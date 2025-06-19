interface ActiveVisitor {
  lastSeen: number;
  isTyping: boolean;
  userId?: string;
}

const globalForActive = globalThis as unknown as {
  activeVisitors?: Map<string, ActiveVisitor>;
};

export const activeVisitors =
  globalForActive.activeVisitors || new Map<string, ActiveVisitor>();

if (process.env.NODE_ENV !== "production") {
  globalForActive.activeVisitors = activeVisitors;
} else {
  globalForActive.activeVisitors = activeVisitors;
}

const TIMEOUT_MS = 60 * 1000; // 60 seconds timeout for active users

export function recordActivity(visitorId: string, isTyping = false, userId?: string) {
  if (!visitorId) return;
  activeVisitors.set(visitorId, {
    lastSeen: Date.now(),
    isTyping,
    userId,
  });
}

export function getActiveUserCount(): number {
  const now = Date.now();
  for (const [id, visitor] of activeVisitors.entries()) {
    if (now - visitor.lastSeen > TIMEOUT_MS) {
      activeVisitors.delete(id);
    }
  }
  return Math.max(1, activeVisitors.size);
}
