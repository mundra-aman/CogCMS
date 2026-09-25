import { graphicConfigSchema, type GraphicConfig } from './types';

/* A graphic is stored inline in the blog body as
   <div class="blog-graphic" data-graphic="<type>" data-config="<base64>">.
   Base64 of the JSON keeps quotes/angle-brackets out of the HTML attribute and
   away from the regex sanitizer. Works in both Node (render) and the browser (editor). */

export function encodeConfig(config: GraphicConfig): string {
  const json = JSON.stringify(config);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(json, 'utf-8').toString('base64');
  }
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeConfig(encoded: string): GraphicConfig | null {
  try {
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(encoded, 'base64').toString('utf-8')
        : decodeURIComponent(escape(atob(encoded)));
    const parsed = graphicConfigSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
