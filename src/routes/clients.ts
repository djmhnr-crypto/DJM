import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { generateId } from '../lib/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const clients = new Hono<{ Bindings: Bindings; Variables: Variables }>()
clients.use('*', authMiddleware)

function isAdmin(user: any) {
  return user.role === 'OWNER' || user.role === 'ADMIN'
}

clients.get('/', async (c) => {
  const { search } = c.req.query()
  let query = 'SELECT *, (SELECT COUNT(*) FROM jobs WHERE client_id = clients.id) as job_count FROM clients WHERE 1=1'
  const params: any[] = []
  if (search) { query += ' AND (name LIKE ? OR email LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`) }
  query += ' ORDER BY name ASC'
  const result = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(result.results)
})

clients.get('/:id', async (c) => {
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(c.req.param('id')).first()
  if (!client) return c.json({ error: 'Client not found' }, 404)
  return c.json(client)
})

clients.post('/', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)
  const { name, phone, email, address, notes } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const id = generateId()
  await c.env.DB.prepare('INSERT INTO clients (id, name, phone, email, address, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, name, phone || null, email || null, address || null, notes || null).run()
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first()
  return c.json(client, 201)
})

clients.put('/:id', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)
  const id = c.req.param('id')
  const { name, phone, email, address, notes } = await c.req.json()
  await c.env.DB.prepare('UPDATE clients SET name=?, phone=?, email=?, address=?, notes=?, updated_at=? WHERE id=?')
    .bind(name, phone || null, email || null, address || null, notes || null, new Date().toISOString(), id).run()
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first()
  return c.json(client)
})

clients.delete('/:id', async (c) => {
  const user = c.get('user')
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403)
  await c.env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})

export default clients
