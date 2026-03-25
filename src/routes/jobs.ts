import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const jobs = new Hono<{ Bindings: Bindings; Variables: Variables }>()
jobs.use('*', authMiddleware)

function isAdmin(user: any) {
  return user.role === 'OWNER' || user.role === 'ADMIN'
}

// GET /api/jobs - List jobs
jobs.get('/', async (c) => {
  const user = c.get('user')
  const { status, technicianId, startDate, endDate, search } = c.req.query()

  let query = `
    SELECT j.*, 
      c.name as client_name, c.phone as client_phone, c.address as client_address,
      u.name as technician_name, u.phone as technician_phone, u.specialty as technician_specialty, u.avatar_color as technician_color,
      cb.name as created_by_name
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN users u ON j.technician_id = u.id
    LEFT JOIN users cb ON j.created_by = cb.id
    WHERE 1=1
  `
  const params: any[] = []

  if (user.role === 'TECHNICIAN') {
    query += ' AND j.technician_id = ?'; params.push(user.userId)
  } else if (technicianId) {
    query += ' AND j.technician_id = ?'; params.push(technicianId)
  }

  if (status) { query += ' AND j.status = ?'; params.push(status) }
  if (startDate) { query += ' AND j.scheduled_start >= ?'; params.push(startDate) }
  if (endDate) { query += ' AND j.scheduled_end <= ?'; params.push(endDate) }
  if (search) { query += ' AND (j.title LIKE ? OR c.name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }

  query += ' ORDER BY j.scheduled_start ASC'

  const result = await c.env.DB.prepare(query).bind(...params).all<any>()
  return c.json(result.results.map(formatJob))
})

// GET /api/jobs/:id
jobs.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const job = await c.env.DB.prepare(`
    SELECT j.*, 
      c.name as client_name, c.phone as client_phone, c.email as client_email, c.address as client_address, c.notes as client_notes,
      u.name as technician_name, u.phone as technician_phone, u.specialty as technician_specialty, u.avatar_color as technician_color,
      cb.name as created_by_name
    FROM jobs j
    LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN users u ON j.technician_id = u.id
    LEFT JOIN users cb ON j.created_by = cb.id
    WHERE j.id = ?
  `).bind(id).first<any>()

  if (!job) return c.json({ error: 'Job not found' }, 404)
  if (user.role === 'TECHNICIAN' && job.technician_id !== user.userId) return c.json({ error: 'Forbidden' }, 403)

  // Get time logs for this job
  const timeLogs = await c.env.DB.prepare(`
    SELECT tl.*, u.name as technician_name FROM time_logs tl
    JOIN users u ON tl.technician_id = u.id
    WHERE tl.job_id = ? ORDER BY tl.clock_in_time DESC
  `).bind(id).all<any>()

  return c.json({ ...formatJob(job), timeLogs: timeLogs.results })
})

// POST /api/jobs - Create job (admin/owner only)
jobs.post('/', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)

  const body = await c.req.json()
  const { title, description, locationAddress, clientId, technicianId, scheduledStart, scheduledEnd, color, priority, serviceType, notes } = body

  if (!title || !scheduledStart || !scheduledEnd) return c.json({ error: 'Title, start and end time required' }, 400)

  const id = generateId()
  await c.env.DB.prepare(`
    INSERT INTO jobs (id, title, description, location_address, client_id, technician_id, created_by, scheduled_start, scheduled_end, color, priority, service_type, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, title, description || null, locationAddress || null, clientId || null, technicianId || null, user.userId,
    scheduledStart, scheduledEnd, color || '#3B82F6', priority || 'NORMAL', serviceType || null, notes || null).run()

  // Create notification if technician assigned
  if (technicianId) {
    const notifId = generateId()
    await c.env.DB.prepare(
      'INSERT INTO notifications (id, user_id, job_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(notifId, technicianId, id, 'JOB_ASSIGNED', 'New Job Assigned', `You have been assigned to: ${title}`).run()
  }

  const job = await c.env.DB.prepare(`
    SELECT j.*, c.name as client_name, u.name as technician_name, u.avatar_color as technician_color, cb.name as created_by_name
    FROM jobs j LEFT JOIN clients c ON j.client_id = c.id LEFT JOIN users u ON j.technician_id = u.id LEFT JOIN users cb ON j.created_by = cb.id
    WHERE j.id = ?
  `).bind(id).first<any>()

  return c.json(formatJob(job!), 201)
})

// PUT /api/jobs/:id - Update job
jobs.put('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')

  const existing = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first<any>()
  if (!existing) return c.json({ error: 'Job not found' }, 404)

  if (user.role === 'TECHNICIAN') {
    // Technicians can only update status
    const { status } = await c.req.json()
    const allowed = ['IN_PROGRESS', 'COMPLETED']
    if (!allowed.includes(status)) return c.json({ error: 'Invalid status update' }, 400)

    const now = new Date().toISOString()
    const updates: any = { status, updated_at: now }
    if (status === 'IN_PROGRESS' && !existing.actual_start) updates.actual_start = now
    if (status === 'COMPLETED') updates.actual_end = now

    await c.env.DB.prepare(
      'UPDATE jobs SET status = ?, actual_start = COALESCE(actual_start, ?), actual_end = ?, updated_at = ? WHERE id = ?'
    ).bind(updates.status, updates.actual_start || existing.actual_start, updates.actual_end || existing.actual_end, now, id).run()

    // Notify admins/owners on completion
    if (status === 'COMPLETED') {
      const admins = await c.env.DB.prepare("SELECT id FROM users WHERE role IN ('ADMIN','OWNER')").all<any>()
      for (const admin of admins.results) {
        const nid = generateId()
        await c.env.DB.prepare('INSERT INTO notifications (id, user_id, job_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(nid, admin.id, id, 'JOB_COMPLETED', 'Job Completed', `${user.name} completed: ${existing.title}`).run()
      }
    }
  } else {
    // Admin full update
    const { title, description, locationAddress, clientId, technicianId, scheduledStart, scheduledEnd, status, color, priority, serviceType, notes } = await c.req.json()
    const prevTech = existing.technician_id
    await c.env.DB.prepare(`
      UPDATE jobs SET title=?, description=?, location_address=?, client_id=?, technician_id=?,
      scheduled_start=?, scheduled_end=?, status=?, color=?, priority=?, service_type=?, notes=?, updated_at=?
      WHERE id=?
    `).bind(title || existing.title, description ?? existing.description, locationAddress ?? existing.location_address,
      clientId ?? existing.client_id, technicianId ?? existing.technician_id, scheduledStart || existing.scheduled_start,
      scheduledEnd || existing.scheduled_end, status || existing.status, color || existing.color,
      priority || existing.priority, serviceType ?? existing.service_type, notes ?? existing.notes,
      new Date().toISOString(), id).run()

    // Notify new technician if reassigned
    if (technicianId && technicianId !== prevTech) {
      const nid = generateId()
      await c.env.DB.prepare('INSERT INTO notifications (id, user_id, job_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(nid, technicianId, id, 'JOB_ASSIGNED', 'Job Assigned', `You have been assigned to: ${title || existing.title}`).run()
    }
  }

  const updated = await c.env.DB.prepare(`
    SELECT j.*, c.name as client_name, c.phone as client_phone,
      u.name as technician_name, u.avatar_color as technician_color, cb.name as created_by_name
    FROM jobs j LEFT JOIN clients c ON j.client_id = c.id LEFT JOIN users u ON j.technician_id = u.id LEFT JOIN users cb ON j.created_by = cb.id
    WHERE j.id = ?
  `).bind(id).first<any>()

  return c.json(formatJob(updated!))
})

// DELETE /api/jobs/:id (admin/owner only)
jobs.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Normalize datetime strings: "2026-03-13 10:30:00" → "2026-03-13T10:30:00"
// This ensures dayjs treats them as local (wall-clock) time, not UTC
function normalizeDt(dt: string | null | undefined): string | null {
  if (!dt) return null
  // If already has 'T' separator or 'Z', return as-is
  if (dt.includes('T') || dt.includes('Z')) return dt
  // Replace space with T to make it an unambiguous local datetime
  return dt.replace(' ', 'T')
}

function formatJob(j: any) {
  return {
    id: j.id, title: j.title, description: j.description,
    locationAddress: j.location_address, clientId: j.client_id, technicianId: j.technician_id,
    createdBy: j.created_by,
    scheduledStart: normalizeDt(j.scheduled_start),
    scheduledEnd: normalizeDt(j.scheduled_end),
    actualStart: normalizeDt(j.actual_start),
    actualEnd: normalizeDt(j.actual_end),
    status: j.status,
    color: j.color, priority: j.priority, serviceType: j.service_type, notes: j.notes,
    createdAt: j.created_at, updatedAt: j.updated_at,
    client: j.client_id ? { id: j.client_id, name: j.client_name, phone: j.client_phone, email: j.client_email, address: j.client_address, notes: j.client_notes } : null,
    technician: j.technician_id ? { id: j.technician_id, name: j.technician_name, phone: j.technician_phone, specialty: j.technician_specialty, avatarColor: j.technician_color } : null,
    createdByName: j.created_by_name
  }
}

export default jobs
