import pino from 'pino'
import { config } from './config.js'

/**
 * Unified application logger backed by pino.
 *
 * Usage:
 *   import { logger } from './logger.js'
 *   logger.info('message')
 *   logger.warn('warning', { detail })
 *   logger.error(err, 'context')
 *
 * Configuration:
 *   LOG_LEVEL env var controls level: debug | info | warn | error (default: info)
 *   In development, uses pino-pretty for readable output.
 *   In production, outputs structured JSON.
 */
const isProduction = process.env.NODE_ENV === 'production'

const logger = pino({
  level: config.logLevel,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }),
})

export { logger }
