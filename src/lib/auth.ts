import { SignJWT, jwtVerify } from 'jose'

export interface JWTPayload {
  userId: string
  email: string
  role: 'OWNER' | 'ADMIN' | 'TECHNICIAN'
  name: string
}

export function getSecret(env: any): Uint8Array {
  const secret = env.JWT_SECRET || 'fieldvibe-super-secret-key-change-in-production'
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: JWTPayload, env: any): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret(env))
}

export async function verifyToken(token: string, env: any): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(env))
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function generateId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}
