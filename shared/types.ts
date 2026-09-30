export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]

export type User = {
  id: string
  email: string
  createdAt: string
}

export type Workspace = {
  id: string
  name: string
  createdAt: string
}

export type Session = {
  userId: string
  workspaceId: string
  role: Role
  expiresAt: string
}

export type ApiError = {
  error: { code: string; message: string; requestId: string }
}
