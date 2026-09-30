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
}

export interface Env {
  DB: D1Database
}
