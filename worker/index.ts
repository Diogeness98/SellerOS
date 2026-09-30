import { handleRequest } from './api'
import type { Env } from './types'

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env)
  },
}
