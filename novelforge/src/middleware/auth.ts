/**
 * JWT Authentication Middleware for NovelForge
 * 
 * Uses hono/jwt for token verification.
 * When JWT_SECRET is not configured (setup mode), auth is bypassed.
 * Routes wrapped with authMiddleware will reject unauthenticated requests.
 */
import { jwt, type JwtVariables } from 'hono/jwt'
import type { Context } from 'hono'
import * as crypto from 'node:crypto'

// JWT payload type
export interface JwtPayload {
  userId: string
  username: string
  iat?: number
  exp?: number
}

// Extend Hono's Variables type
export type AuthVariables = JwtVariables<JwtPayload>

/** Cached fallback secret for setup mode (generated once per process lifetime) */
let _fallbackSecret: string | null = null

/**
 * Get the JWT secret from environment.
 * In setup mode (no JWT_SECRET configured), generates a random temporary secret
 * so that registration/login still work before the Setup Wizard configures a permanent one.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret === 'novelforge-dev-secret-change-in-production') {
    // Setup mode — generate a temporary random secret
    if (!_fallbackSecret) {
      _fallbackSecret = crypto.randomBytes(32).toString('hex')
      // This secret is NOT persisted — it changes on restart.
      // The Setup Wizard should configure a permanent JWT_SECRET.
    }
    return _fallbackSecret
  }
  return secret
}

/**
 * Check if auth is properly configured with a permanent JWT secret.
 */
export function isAuthConfigured(): boolean {
  const secret = process.env.JWT_SECRET
  return !!secret && secret !== 'novelforge-dev-secret-change-in-production'
}

/**
 * JWT middleware — skips auth if JWT_SECRET is not yet configured (setup mode).
 */
export const authMiddleware = async (c: Context, next: () => Promise<void>) => {
  // Skip auth only when JWT_SECRET is truly not configured (setup mode)
  // `getJwtSecret()` always returns a value (fallback for setup mode),
  // so we check `isAuthConfigured()` instead to determine setup vs. configured state.
  if (!isAuthConfigured()) {
    // Setup mode — auth not configured yet, allow through
    return await next()
  }
  // Use hono/jwt with the configured secret
  const secret = getJwtSecret()
  const jwtMiddleware = jwt({ secret, alg: 'HS256' })
  return jwtMiddleware(c, next)
}

/**
 * Error handler for JWT failures.
 * Customizes error messages for better DX.
 */
export function jwtErrorHandler(err: Error, c: Context) {
  const name = err.name || ''
  if (name === 'JwtTokenExpired') {
    return c.json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }, 401)
  }
  if (name === 'JwtTokenInvalid' || name === 'JwtTokenSignatureMismatched') {
    return c.json({ error: 'Invalid token', code: 'INVALID_TOKEN' }, 401)
  }
  if (name === 'JwtTokenNotBefore') {
    return c.json({ error: 'Token not yet active', code: 'TOKEN_NOT_ACTIVE' }, 401)
  }
  return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
}

/**
 * Helper to extract the JWT payload from context.
 */
export function getAuthPayload(c: Context): JwtPayload | null {
  const payload = c.get('jwtPayload') as JwtPayload | undefined
  return payload || null
}

/**
 * Helper to get the current user ID from JWT context.
 */
export function getCurrentUserId(c: Context): string | null {
  const payload = getAuthPayload(c)
  return payload?.userId || null
}
