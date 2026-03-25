import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const timeLogs = new Hono<{ Bindings: Bindings; Variables: Variables }>()
timeLogs.use('*', authMiddleware)

// POST /api/time-logs/clock-in
timeLogs.post('/clock-in', async (c) => {
  const user = c.get('user')
  const { jobId, lat, lng } = await c.req.json()

  if (!jobId) return c.json({ error: 'Job ID required' }, 400)

  // Verify job exists and is assigned to this technician
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND technician_id = ?')
    .bind(jobId, user.userId).first<any>()

  if (!job) return c.json({ error: 'Job not found or not assigned to you' }, 404)
  if (job.status === 'COMPLETED') return c.json({ error: 'Job already completed' }, 400)
  if (job.status === 'CANCELLED') return c.json({ error: 'Job is cancelled' }, 400)

  // Check if already clocked in to any job
  const activeLog = await c.env.DB.prepare(
    'SELECT tl.*, j.title as job_title FROM time_logs tl JOIN jobs j ON tl.job_id = j.id WHERE tl.technician_id = ? AND tl.clock_out_time IS NULL'
  ).bind(user.userId).first<any>()

  if (activeLog) return c.json({ error: `Already clocked in to: ${activeLog.job_title}`, activeLog }, 409)

  const id = generateId()
  const now = new Date().toISOString()

  await c.env.DB.prepare(
    'INSERT INTO time_logs (id, job_id, technician_id, clock_in_time, clock_in_lat, clock_in_lng) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, jobId, user.userId, now, lat || null, lng || null).run()

  // Update job status to IN_PROGRESS
  await c.env.DB.prepare(
    'UPDATE jobs SET status = ?, actual_start = COALESCE(actual_start, ?), updated_at = ? WHERE id = ?'
  ).bind('IN_PROGRESS', now, now, jobId).run()

  const log = await c.env.DB.prepare('SELECT * FROM time_logs WHERE id = ?').bind(id).first()
  return c.json({ ...log, message: 'Clocked in successfully' }, 201)
})

// POST /api/time-logs/clock-out
timeLogs.post('/clock-out', async (c) => {
  const user = c.get('user')
  const { timeLogId, lat, lng, notes } = await c.req.json()

  const log = await c.env.DB.prepare(
    'SELECT * FROM time_logs WHERE id = ? AND technician_id = ? AND clock_out_time IS NULL'
  ).bind(timeLogId, user.userId).first<any>()

  if (!log) return c.json({ error: 'No active clock-in found' }, 404)

  const now = new Date()
  const clockIn = new Date(log.clock_in_time)
  const totalMinutes = Math.round((now.getTime() - clockIn.getTime()) / 60000)

  await c.env.DB.prepare(
    'UPDATE time_logs SET clock_out_time = ?, total_minutes = ?, clock_out_lat = ?, clock_out_lng = ?, notes = ? WHERE id = ?'
  ).bind(now.toISOString(), totalMinutes, lat || null, lng || null, notes || null, timeLogId).run()

  const updated = await c.env.DB.prepare('SELECT * FROM time_logs WHERE id = ?').bind(timeLogId).first()
  return c.json({ ...updated, message: 'Clocked out successfully' })
})

// GET /api/time-logs/active - Get current active clock-in
timeLogs.get('/active', async (c) => {
  const user = c.get('user')

  const log = await c.env.DB.prepare(`
    SELECT tl.*, j.title as job_title, j.location_address, j.color,
      c.name as client_name, c.phone as client_phone
    FROM time_logs tl
    JOIN jobs j ON tl.job_id = j.id
    LEFT JOIN clients c ON j.client_id = c.id
    WHERE tl.technician_id = ? AND tl.clock_out_time IS NULL
  `).bind(user.userId).first<any>()

  return c.json(log || null)
})

// GET /api/time-logs - List time logs
timeLogs.get('/', async (c) => {
  const user = c.get('user')
  const { technicianId, jobId, startDate, endDate } = c.req.query()

  let query = `
    SELECT tl.*, j.title as job_title, j.color, u.name as technician_name
    FROM time_logs tl
    JOIN jobs j ON tl.job_id = j.id
    JOIN users u ON tl.technician_id = u.id
    WHERE 1=1
  `
  const params: any[] = []

  if (user.role === 'TECHNICIAN') {
    query += ' AND tl.technician_id = ?'; params.push(user.userId)
  } else if (technicianId) {
    query += ' AND tl.technician_id = ?'; params.push(technicianId)
  }
  if (jobId) { query += ' AND tl.job_id = ?'; params.push(jobId) }
  if (startDate) { query += ' AND tl.clock_in_time >= ?'; params.push(startDate) }
  if (endDate) { query += ' AND tl.clock_in_time <= ?'; params.push(endDate) }

  query += ' ORDER BY tl.clock_in_time DESC LIMIT 100'

  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(result.results)
})

// GET /api/time-logs/summary - Time summary (admin/owner)
timeLogs.get('/summary', async (c) => {
  const user = c.get('user')
  if (user.role !== 'ADMIN' && user.role !== 'OWNER') return c.json({ error: 'Forbidden' }, 403)

  const { startDate, endDate } = c.req.query()
  const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const end = endDate || new Date().toISOString().split('T')[0]

  const summary = await c.env.DB.prepare(`
    SELECT u.id, u.name, u.specialty, u.avatar_color,
      COUNT(tl.id) as total_logs,
      SUM(tl.total_minutes) as total_minutes,
      COUNT(DISTINCT tl.job_id) as jobs_worked
    FROM users u
    LEFT JOIN time_logs tl ON u.id = tl.technician_id AND tl.clock_in_time >= ? AND tl.clock_in_time <= ?
    WHERE u.role = 'TECHNICIAN' AND u.is_active = 1
    GROUP BY u.id ORDER BY total_minutes DESC
  `).bind(`${start}T00:00:00.000Z`, `${end}T23:59:59.999Z`).all()

  return c.json(summary.results)
})

export default timeLogs
