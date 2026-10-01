export interface D1Result<T = unknown> {
  results: T[]
  success: boolean
  meta?: Record<string, unknown>
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T = unknown>(): Promise<T | null>
  all<T = unknown>(): Promise<D1Result<T>>
  run(): Promise<D1Result>
}

export interface D1Database {
  prepare(query: string): D1Statement
  batch?<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>
}

export interface Env {
  DB: D1Database
  SESSION_SECRET: string
  MERCADOLIVRE_CLIENT_ID?: string
  MERCADOLIVRE_CLIENT_SECRET?: string
  MERCADOLIVRE_REDIRECT_URI?: string
  TOKEN_ENCRYPTION_KEY?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  RATE_LIMITS_ENABLED?: string
}
