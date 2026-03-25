import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { generateId, hashPassword } from '../lib/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const users = new Hono<{ Bindings: Bindings; Variables: Variables }>()
users.use('*', authMiddleware)

// Helper: check if caller has admin-level access (OWNER or ADMIN)
function isAdmin(user: any) {
  return user.role === 'OWNER' || user.role === 'ADMIN'
}

// GET /api/users - List users (OWNER or ADMIN only)
users.get('/', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)

  const { role, search } = c.req.query()
  let query = `SELECT id, email, name, phone, role, specialty, is_active, avatar_color, created_at,
    (SELECT COUNT(*) FROM jobs WHERE technician_id = users.id AND status != 'CANCELLED') as total_jobs,
    (SELECT COUNT(*) FROM jobs WHERE technician_id = users.id AND status = 'COMPLETED') as completed_jobs,
    (SELECT COUNT(*) FROM jobs WHERE technician_id = users.id AND status = 'IN_PROGRESS') as active_jobs
    FROM users WHERE 1=1`
  const params: any[] = []

  if (role) { query += ' AND role = ?'; params.push(role) }
  if (search) { query += ' AND (name LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
  query += ' ORDER BY name ASC'

  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(result.results)
})

// GET /api/users/technicians - List active technicians (public for login dropdown)
users.get('/technicians', async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT id, name, email, phone, specialty, avatar_color, is_active,
      (SELECT COUNT(*) FROM jobs WHERE technician_id = users.id AND status = 'IN_PROGRESS') as active_jobs,
      (SELECT COUNT(*) FROM jobs WHERE technician_id = users.id AND DATE(scheduled_start) = DATE('now') AND status != 'CANCELLED') as today_jobs
    FROM users WHERE role = 'TECHNICIAN' AND is_active = 1 ORDER BY name ASC
  `).all()
  return c.json(result.results)
})

// GET /api/users/:id
users.get('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!isAdmin(user) && user.userId !== id) return c.json({ error: 'Forbidden' }, 403)

  const found = await c.env.DB.prepare(
    'SELECT id, email, name, phone, role, specialty, is_active, avatar_color, created_at FROM users WHERE id = ?'
  ).bind(id).first()
  if (!found) return c.json({ error: 'User not found' }, 404)
  return c.json(found)
})

// POST /api/users - Create user (OWNER or ADMIN only)
users.post('/', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)

  const { email, password, name, phone, role, specialty, avatarColor } = await c.req.json()
  if (!email || !password || !name) return c.json({ error: 'Email, password, and name required' }, 400)

  // Only OWNER can create ADMIN/OWNER accounts
  const targetRole = role || 'TECHNICIAN'
  if ((targetRole === 'ADMIN' || targetRole === 'OWNER') && user.role !== 'OWNER') {
    return c.json({ error: 'Only OWNER can create admin accounts' }, 403)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = generateId()
  const hashed = await hashPassword(password)
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']
  const color = avatarColor || colors[Math.floor(Math.random() * colors.length)]

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, phone, role, specialty, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, email.toLowerCase(), hashed, name, phone || null, targetRole, specialty || null, color).run()

  const created = await c.env.DB.prepare(
    'SELECT id, email, name, phone, role, specialty, avatar_color, is_active FROM users WHERE id = ?'
  ).bind(id).first()
  return c.json(created, 201)
})

// PUT /api/users/:id - Update user info (OWNER/ADMIN can update any, technician cannot update themselves beyond basics)
users.put('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (!isAdmin(user) && user.userId !== id) return c.json({ error: 'Forbidden' }, 403)

  const target = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<any>()
  if (!target) return c.json({ error: 'User not found' }, 404)

  const body = await c.req.json()
  const { name, phone, specialty, isActive, avatarColor, email, password, role } = body
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : undefined

  // TECHNICIAN cannot change their own password or email
  if (user.role === 'TECHNICIAN') {
    if (password || email || role) return c.json({ error: 'Technicians cannot change credentials or role' }, 403)
  }

  // Only OWNER can change role; cannot promote to OWNER via ADMIN
  if (role !== undefined) {
    if (user.role !== 'OWNER') return c.json({ error: 'Only OWNER can change roles' }, 403)
    // Cannot demote OWNER to anything
    if (target.role === 'OWNER' && role !== 'OWNER') return c.json({ error: 'Cannot change OWNER role' }, 403)
  }

  // Build update
  let setParts = ['name=?', 'phone=?', 'specialty=?', 'is_active=?', 'avatar_color=?', 'updated_at=?']
  let params: any[] = [
    name ?? target.name,
    phone ?? target.phone,
    specialty ?? target.specialty,
    isActive !== undefined ? (isActive ? 1 : 0) : target.is_active,
    avatarColor ?? target.avatar_color,
    new Date().toISOString()
  ]

  if (normalizedEmail && isAdmin(user)) {
    // Check email not taken
    const emailCheck = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(normalizedEmail, id).first()
    if (emailCheck) return c.json({ error: 'Email already in use' }, 409)
    setParts.push('email=?')
    params.push(normalizedEmail)
  }

  if (password && isAdmin(user)) {
    const hashed = await hashPassword(password)
    setParts.push('password_hash=?')
    params.push(hashed)
  }

  if (role && user.role === 'OWNER') {
    setParts.push('role=?')
    params.push(role)
  }

  params.push(id)
  await c.env.DB.prepare(`UPDATE users SET ${setParts.join(',')} WHERE id=?`).bind(...params).run()

  const updated = await c.env.DB.prepare('SELECT id, email, name, phone, role, specialty, avatar_color, is_active FROM users WHERE id = ?').bind(id).first()
  return c.json(updated)
})

// DELETE /api/users/:id - Delete technician (OWNER or ADMIN only, cannot delete OWNER)
users.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)

  const id = c.req.param('id')
  const target = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first<any>()
  if (!target) return c.json({ error: 'User not found' }, 404)
  if (target.role === 'OWNER') return c.json({ error: 'Cannot delete OWNER account' }, 403)
  if (target.role === 'ADMIN' && user.role !== 'OWNER') return c.json({ error: 'Only OWNER can delete admin accounts' }, 403)
  if (id === user.userId) return c.json({ error: 'Cannot delete your own account' }, 403)

  // Unassign jobs before deleting
  await c.env.DB.prepare('UPDATE jobs SET technician_id = NULL WHERE technician_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM notifications WHERE user_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()

  return c.json({ success: true })
})

export default users
