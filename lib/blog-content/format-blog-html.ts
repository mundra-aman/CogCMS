export function formatBlogHTML(html: string): string {
  if (!html) return '';
  let h = html;

  // Replace non-breaking spaces with regular spaces to allow proper line wrapping.
  // Match the decoded character too: sanitizeBlogHtml runs first and turns the
  // entity into U+00A0, which an entity-only pattern silently leaves in place.
  h = h.replace(/&nbsp;|\u00a0/g, ' ');

  // Backwards-compat: convert sentinel paragraphs from older divider approach
  h = h.replace(/<p[^>]*class="ql-divider"[^>]*>.*?<\/p>/gi, '<hr>');

  // Remove empty <p> tags entirely to prevent huge paragraph gaps
  h = h.replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, '');

  // Convert "Table of Contents" heading only
  h = h.replace(/<p>(?:\s)*(Table(?:\s)*of(?:\s)*Contents?)(?:\s)*<\/p>/gi, '<h2>$1</h2>');

  return h;
}
