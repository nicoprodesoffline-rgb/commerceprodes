const memSessions = new Map<string, number>();

export function saveAdminSession(token: string, expiresAt: number) {
  memSessions.set(token, expiresAt);
}

export function hasActiveAdminSession(token: string): boolean {
  const expiresAt = memSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    memSessions.delete(token);
    return false;
  }
  return true;
}

export function deleteAdminSession(token: string) {
  memSessions.delete(token);
}
