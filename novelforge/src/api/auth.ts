/**
 * Auth API — User registration, login, and token management.
 * 
 * Stores users in a simple JSON file (data/users.json) for MVP.
 * Uses bcrypt-like hashing (built-in Node.js crypto) for passwords.
 * Issues JWT tokens via hono/jwt.
 */
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { getJwtSecret } from '../middleware/auth.js'

const authApiRouter = new Hono()

// ==================== Types ====================

interface StoredUser {
  userId: string
  username: string
  passwordHash: string
  salt: string
  createdAt: string
}

interface UsersDb {
  users: StoredUser[]
}

// ==================== Validation Schemas ====================

const registerSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string().min(8).max(128),
})

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

// ==================== Rate Limiting ====================

interface RateLimitEntry {
  count: number
  reset: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

/**
 * Check if the request should be allowed under the rate limit.
 * All Map operations are synchronous and Node.js is single-threaded
 * (one event-loop tick), so concurrent-access races are not a concern
 * in practice. The cleanup timer uses `unref()` to not keep the process alive.
 */
function checkRateLimit(ip: string, maxRequests = 10, windowMs = 60000): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + windowMs })
    return true
  }
  if (entry.count >= maxRequests) {
    return false
  }
  entry.count++
  return true
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of rateLimitMap) {
    if (now > val.reset) rateLimitMap.delete(key)
  }
}, 300_000).unref()

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || '127.0.0.1'
}

// ==================== User Store ====================

const USERS_DB_PATH = path.join(process.cwd(), 'data', 'users.json')
const USERS_LOCK_PATH = path.join(process.cwd(), 'data', 'users.lock')

/**
 * Simple cooperative file-based mutex for users.json writes.
 * Uses a lock file with retry; not suitable for extreme concurrency
 * but sufficient for typical MVP deployment traffic.
 */
function acquireLock(retries = 10, intervalMs = 50): boolean {
  for (let i = 0; i < retries; i++) {
    try {
      const fd = fs.openSync(USERS_LOCK_PATH, 'wx')
      fs.writeSync(fd, String(process.pid))
      fs.closeSync(fd)
      return true
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e?.code === 'EEXIST') {
        // Stale lock detection: remove if older than 30 seconds
        try {
          const stat = fs.statSync(USERS_LOCK_PATH)
          if (Date.now() - stat.mtimeMs > 30_000) {
            fs.unlinkSync(USERS_LOCK_PATH)
            continue
          }
        } catch { /* lock file may have been removed */ }
      }
      if (i < retries - 1) {
        const end = Date.now() + intervalMs
        while (Date.now() < end) { /* busy-wait for simplicity */ }
      }
    }
  }
  return false
}

function releaseLock(): void {
  try { fs.unlinkSync(USERS_LOCK_PATH) } catch { /* already released */ }
}

function getUsersDb(): UsersDb {
  const dir = path.dirname(USERS_DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(USERS_DB_PATH)) {
    const empty: UsersDb = { users: [] }
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(empty, null, 2))
    return empty
  }
  try {
    return JSON.parse(fs.readFileSync(USERS_DB_PATH, 'utf-8'))
  } catch {
    return { users: [] }
  }
}

function saveUsersDb(db: UsersDb): void {
  const dir = path.dirname(USERS_DB_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  // Atomic write: temp file → rename
  const tmpPath = `${USERS_DB_PATH}.tmp.${Date.now()}`
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2))
  fs.renameSync(tmpPath, USERS_DB_PATH)
}

function findUser(username: string): StoredUser | undefined {
  const db = getUsersDb()
  return db.users.find(u => u.username.toLowerCase() === username.toLowerCase())
}

// ==================== Password Hashing ====================

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, actualSalt, 100000, 64, 'sha512').toString('hex')
  return { hash, salt: actualSalt }
}

function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt)
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash))
}

// ==================== JWT Token Generation ====================

const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days

async function generateToken(userId: string, username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    userId,
    username,
    iat: now,
    exp: now + TOKEN_EXPIRY_SECONDS,
  }
  return await sign(payload, getJwtSecret())
}

// ==================== Routes ====================

// POST /api/auth/register
authApiRouter.post('/register', async (c) => {
  const ip = getClientIp(c)
  if (!checkRateLimit(ip, 5, 300_000)) {
    return c.json({ error: 'Too many registration attempts. Please try again later.' }, 429)
  }

  const body = await c.req.json().catch(() => ({}))
  const validation = registerSchema.safeParse(body)

  if (!validation.success) {
    return c.json({
      error: 'Invalid registration data',
      details: validation.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    }, 400)
  }

  const { username, password } = validation.data

  // Check if user already exists
  const locked = acquireLock()
  if (!locked) {
    return c.json({ error: 'Server is busy. Please try again.' }, 503)
  }
  
  let user: StoredUser
  try {
    if (findUser(username)) {
      return c.json({ error: 'Username already taken' }, 409)
    }

    // Hash password and create user
    const { hash, salt } = hashPassword(password)
    user = {
      userId: crypto.randomUUID(),
      username,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    }

    const db = getUsersDb()
    db.users.push(user)
    saveUsersDb(db)
  } finally {
    releaseLock()
  }

  // Generate token
  const token = await generateToken(user.userId, user.username)

  return c.json({
    token,
    user: {
      userId: user.userId,
      username: user.username,
      createdAt: user.createdAt,
    },
  }, 201)
})

// POST /api/auth/login
authApiRouter.post('/login', async (c) => {
  const ip = getClientIp(c)
  if (!checkRateLimit(ip, 10, 60_000)) {
    return c.json({ error: 'Too many login attempts. Please try again later.' }, 429)
  }

  const body = await c.req.json().catch(() => ({}))
  const validation = loginSchema.safeParse(body)

  if (!validation.success) {
    return c.json({ error: 'Invalid login data', details: validation.error.issues }, 400)
  }

  const { username, password } = validation.data

  const user = findUser(username)
  if (!user) {
    return c.json({ error: 'Invalid username or password' }, 401)
  }

  if (!verifyPassword(password, user.passwordHash, user.salt)) {
    return c.json({ error: 'Invalid username or password' }, 401)
  }

  const token = await generateToken(user.userId, user.username)

  return c.json({
    token,
    user: {
      userId: user.userId,
      username: user.username,
      createdAt: user.createdAt,
    },
  })
})

// GET /api/auth/me — Get current user info (protected)
authApiRouter.get('/me', async (c) => {
  const jwtPayload = c.get('jwtPayload') as { userId: string; username: string } | undefined
  if (!jwtPayload) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const user = findUser(jwtPayload.username)
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({
    userId: user.userId,
    username: user.username,
    createdAt: user.createdAt,
  })
})

export { authApiRouter }
