import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const notifications = new Hono<{ Bindings: Bindings; Variables: Variables }>()
notifications.use('*', authMiddleware)

notifications.get('/', async (c) => {
  const user = c.get('user')
  const result = await c.env.DB.prepare(`
    SELECT n.*, j.title as job_title, j.color as job_color
    FROM notifications n LEFT JOIN jobs j ON n.job_id = j.id
    WHERE n.user_id = ? ORDER BY n.sent_at DESC LIMIT 50
  `).bind(user.userId).all()
  return c.json(result.results)
})

notifications.get('/unread-count', async (c) => {
  const user = c.get('user')
  const result = await c.env.DB.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0')
    .bind(user.userId).first<any>()
  return c.json({ count: result?.count || 0 })
})

notifications.put('/:id/read', async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.userId).run()
  return c.json({ success: true })
})

notifications.put('/mark-all-read', async (c) => {
  const user = c.get('user')
  await c.env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(user.userId).run()
  return c.json({ success: true })
})

export default notifications
