import jwt from 'jsonwebtoken'
import type { AuthTokenPayload } from '@/types/auth'

export const NMES_SESSION_COOKIE = 'nmes-session'

const TOKEN_EXPIRY_SECONDS = 60 * 60 * 8 // 8 hours

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: TOKEN_EXPIRY_SECONDS,
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set')
  }
  return secret
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY_SECONDS })
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    if (typeof decoded === 'string') return null
    return decoded as AuthTokenPayload
  } catch {
    return null
  }
}
