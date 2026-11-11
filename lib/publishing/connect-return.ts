/** Client-safe login return path; this is deliberately not a general redirect helper. */
export function safeStudioReturnPath(value: string | null): string {
  if (!value || value.length > 6000 || !value.startsWith('/')) return '/admin/dashboard';
  try {
    const url = new URL(value, 'https://cms-return.invalid');
    if (
      url.origin !== 'https://cms-return.invalid' ||
      !['/connect/content-studio', '/admin/open-blog'].includes(url.pathname) ||
      url.hash
    )
      return '/admin/dashboard';
    if (url.pathname === '/admin/open-blog') {
      const siteId = url.searchParams.get('siteId') ?? '';
      const slug = url.searchParams.get('slug') ?? '';
      if (
        !/^[a-f\d]{24}$/.test(siteId) ||
        slug.length > 160 ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      )
        return '/admin/dashboard';
      return '/admin/open-blog?' + new URLSearchParams({ siteId, slug });
    }
    return url.pathname + url.search;
  } catch {
    return '/admin/dashboard';
  }
}
