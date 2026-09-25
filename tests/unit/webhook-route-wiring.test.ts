import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mutationRoutes = [
  'app/api/admin/blogs/route.ts',
  'app/api/admin/blogs/[slug]/route.ts',
  'app/api/admin/authors/route.ts',
  'app/api/admin/authors/[slug]/route.ts',
  'app/api/admin/faqs/route.ts',
  'app/api/admin/faqs/[id]/route.ts',
  'app/api/admin/whitepapers/route.ts',
  'app/api/admin/whitepapers/[slug]/route.ts',
  'app/api/admin/release-notes/route.ts',
  'app/api/admin/release-notes/[slug]/route.ts',
];

describe('public-content webhook wiring', () => {
  it.each(mutationRoutes)('%s dispatches through the best-effort notifier', (path) => {
    expect(readFileSync(path, 'utf8')).toContain('notifySiteWebhook');
  });
});
