import { Hono } from 'hono'
import { hashPassword, signToken, generateId } from '../lib/auth'

type Bindings = { DB: D1Database; JWT_SECRET?: string }

const auth = new Hono<{ Bindings: Bindings }>()

// Public: list technicians for login dropdown (no auth required)
auth.get('/technicians-public', async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT id, name, email, specialty, avatar_color FROM users WHERE role = 'TECHNICIAN' AND is_active = 1 ORDER BY name ASC`
  ).all<any>()
  return c.json(result.results)
})

auth.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'Email and password required' }, 400)

  const hashed = await hashPassword(password)
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, phone, specialty, avatar_color, is_active FROM users WHERE email = ? AND password_hash = ?'
  ).bind(email.toLowerCase(), hashed).first<any>()

  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  if (!user.is_active) return c.json({ error: 'Account deactivated' }, 403)

  const token = await signToken({ userId: user.id, email: user.email, role: user.role, name: user.name }, c.env)

  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, specialty: user.specialty, avatarColor: user.avatar_color }
  })
})

auth.post('/register', async (c) => {
  const { email, password, name, phone, role, specialty } = await c.req.json()
  if (!email || !password || !name) return c.json({ error: 'Email, password, and name required' }, 400)

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = generateId()
  const hashed = await hashPassword(password)
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4']
  const color = colors[Math.floor(Math.random() * colors.length)]

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, name, phone, role, specialty, avatar_color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, email.toLowerCase(), hashed, name, phone || null, role || 'TECHNICIAN', specialty || null, color).run()

  const token = await signToken({ userId: id, email: email.toLowerCase(), role: role || 'TECHNICIAN', name }, c.env)
  return c.json({ token, user: { id, email: email.toLowerCase(), name, role: role || 'TECHNICIAN', phone, specialty, avatarColor: color } }, 201)
})

auth.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  const cookieHeader = c.req.header('Cookie') || ''
  const cookieMatch = cookieHeader.match(/auth_token=([^;]+)/)
  const token = authHeader?.replace('Bearer ', '') || (cookieMatch ? cookieMatch[1] : null)
  if (!token) return c.json({ error: 'Not authenticated' }, 401)

  const { verifyToken } = await import('../lib/auth')
  const payload = await verifyToken(token, c.env)
  if (!payload) return c.json({ error: 'Invalid token' }, 401)

  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, phone, specialty, avatar_color, is_active FROM users WHERE id = ?'
  ).bind(payload.userId).first<any>()

  if (!user) return c.json({ error: 'User not found' }, 404)
  return c.json({ id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone, specialty: user.specialty, avatarColor: user.avatar_color })
})

export default auth
