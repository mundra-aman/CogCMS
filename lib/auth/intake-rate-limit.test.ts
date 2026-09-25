import { afterEach, expect, it, vi } from 'vitest';
const { startSession } = vi.hoisted(() => ({ startSession: vi.fn() }));
vi.mock('@/lib/mongodb', () => ({
  default: async () => ({ connection: { db: { collection: () => ({}) } }, startSession }),
}));
import { consumeIntakeTokens } from './intake-rate-limit';
afterEach(() => startSession.mockReset());
it.each(['start', 'end'])('redacts driver errors when session %s fails', async (stage) => {
  const sentinel = new Error('mongodb://user:secret-sentinel@host');
  const session = {
    withTransaction: vi.fn().mockResolvedValue({ limited: false }),
    endSession: vi.fn().mockRejectedValue(sentinel),
  };
  if (stage === 'start') startSession.mockRejectedValue(sentinel);
  else startSession.mockResolvedValue(session);
  await expect(consumeIntakeTokens('203.0.113.8', 'key', Date.now())).rejects.toMatchObject({
    status: 503,
    message: 'Intake rate limit unavailable',
  });
});
