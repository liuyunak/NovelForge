import { defineConfig } from 'vitest/config'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests'

export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 10000,
  },
})
