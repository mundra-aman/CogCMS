import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

describe('Next.js development safeguards', () => {
  it('does not rewrite the repository agent instructions on dev startup', () => {
    expect(nextConfig.agentRules).toBe(false);
  });
});
