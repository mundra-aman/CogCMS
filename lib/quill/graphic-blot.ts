import { encodeConfig, decodeConfig } from '@/lib/blog-content/graphics/encode';
import { renderGraphic } from '@/lib/blog-content/graphics/render';
import type { GraphicConfig } from '@/lib/blog-content/graphics/types';

/* A block-embed blot for inline graphics. Serializes to
   <div class="blog-graphic" data-graphic="<type>" data-config="<base64>"> and renders
   the SAME markup as the public page (renderGraphic), so the canvas matches the reader.
   The class lets Quill recognise the blot when loading an existing post for editing. */

export function registerGraphicBlot(Quill: any) {
  try {
    const BlockEmbed = Quill.import('blots/block/embed');

    class GraphicBlot extends BlockEmbed {
      static blotName = 'graphic';
      static tagName = 'div';
      static className = 'blog-graphic';

      static create(value: GraphicConfig) {
        const node = super.create() as HTMLElement;
        node.setAttribute('contenteditable', 'false');
        if (value && value.type) {
          node.setAttribute('data-graphic', value.type);
          node.setAttribute('data-config', encodeConfig(value));
          node.innerHTML = renderGraphic(value);
        }
        return node;
      }

      static value(node: HTMLElement): GraphicConfig | null {
        return decodeConfig(node.getAttribute('data-config') || '');
      }
    }

    Quill.register(GraphicBlot, true);
  } catch {
    // already registered / unsupported — editor still works without graphics
  }
}
