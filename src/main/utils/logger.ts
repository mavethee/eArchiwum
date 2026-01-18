import pino, { Logger } from 'pino'

let loggerInstance: Logger | null = null

export const initializeLogger = (): Logger => {
  if (loggerInstance) return loggerInstance

  const isDevelopment = process.env.NODE_ENV === 'development'
  const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')

  loggerInstance = pino({
    level: logLevel,
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined,
    base: {
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    }
  })

  return loggerInstance
}

export const getLogger = (module?: string): Logger => {
  if (!loggerInstance) {
    initializeLogger()
  }

  return module ? loggerInstance!.child({ module }) : loggerInstance!
}

export default {
  initializeLogger,
  getLogger
}
