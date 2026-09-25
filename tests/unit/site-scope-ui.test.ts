import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('site-scoped admin UI', () => {
  it('remounts client state when the selected site changes', () => {
    const layout = readFileSync(
      new URL('../../app/admin/dashboard/layout.tsx', import.meta.url),
      'utf8',
    );

    expect(layout).toContain(
      "<SiteProvider key={currentSite?.id ?? 'no-site'} site={currentSite}>",
    );
  });

  it('uses the selected site URL for FAQ preview links', () => {
    const page = readFileSync(
      new URL('../../app/admin/dashboard/faqs/page.tsx', import.meta.url),
      'utf8',
    );

    expect(page).toContain('const site = useSite();');
    expect(page).toContain("href={publicUrlFor(site, 'faq')}");
    expect(page).not.toContain('href="/faq"');
  });

  it('surfaces the author field error when publication is blocked', () => {
    const editor = readFileSync(
      new URL('../../app/admin/dashboard/blogs/new/page.tsx', import.meta.url),
      'utf8',
    );

    expect(editor).toContain('data.details?.fieldErrors?.authorId?.[0]');
  });
});
