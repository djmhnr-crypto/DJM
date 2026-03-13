import { Context, Next } from 'hono'
import { verifyToken, JWTPayload } from '../lib/auth'

export type Variables = {
  user: JWTPayload
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization')
  const cookieToken = getCookieToken(c)
  const token = authHeader?.replace('Bearer ', '') || cookieToken

  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const payload = await verifyToken(token, c.env)
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  c.set('user', payload)
  await next()
}

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as JWTPayload
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'Forbidden' }, 403)
    }
    await next()
  }
}

function getCookieToken(c: Context): string | null {
  const cookie = c.req.header('Cookie') || ''
  const match = cookie.match(/auth_token=([^;]+)/)
  return match ? match[1] : null
}
