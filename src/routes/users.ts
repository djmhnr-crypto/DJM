import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { generateId, hashPassword } from '../lib/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const users = new Hono<{ Bindings: Bindings; Variables: Variables }>()
users.use('*', authMiddleware)

// GET /api/users - List users (admin only)
users.get('/', async (c) => {
  const user = c.get('user')
  if (user.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403)

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

// GET /api/users/technicians - List active technicians
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
  if (user.role !== 'ADMIN' && user.userId !== id) return c.json({ error: 'Forbidden' }, 403)

  const found = await c.env.DB.prepare(
    'SELECT id, email, name, phone, role, specialty, is_active, avatar_color, created_at FROM users WHERE id = ?'
  ).bind(id).first()
  if (!found) return c.json({ error: 'User not found' }, 404)
  return c.json(found)
})

// POST /api/users - Create user (admin only)
users.post('/', async (c) => {
  const user = c.get('user')
  if (user.role !== 'ADMIN') return c.json({ error: 'Forbidden' }, 403)

  const { email, password, name, phone, role, specialty, avatarColor } = await c.req.json()
  if (!email || !password || !name) return c.json({ error: 'Email, password, and name required' }, 400)

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = generateId()
  const hashed = await hashPassword(password)
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']
  const color = avatarColor || colors[Math.floor(Math.random() * colors.length)]

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, phone, role, specialty, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, email.toLowerCase(), hashed, name, phone || null, role || 'TECHNICIAN', specialty || null, color).run()

  const created = await c.env.DB.prepare(
    'SELECT id, email, name, phone, role, specialty, avatar_color, is_active FROM users WHERE id = ?'
  ).bind(id).first()
  return c.json(created, 201)
})

// PUT /api/users/:id
users.put('/:id', async (c) => {
  const user = c.get('user')
  const id = c.req.param('id')
  if (user.role !== 'ADMIN' && user.userId !== id) return c.json({ error: 'Forbidden' }, 403)

  const { name, phone, specialty, isActive, avatarColor } = await c.req.json()
  await c.env.DB.prepare('UPDATE users SET name=?, phone=?, specialty=?, is_active=?, avatar_color=?, updated_at=? WHERE id=?')
    .bind(name, phone || null, specialty || null, isActive !== undefined ? (isActive ? 1 : 0) : 1, avatarColor || '#3B82F6', new Date().toISOString(), id).run()

  const updated = await c.env.DB.prepare('SELECT id, email, name, phone, role, specialty, avatar_color, is_active FROM users WHERE id = ?').bind(id).first()
  return c.json(updated)
})

export default users
