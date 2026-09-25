// Registers a code-block variant that persists a data-language attribute,
// so the renderer can highlight with the right grammar. Quill 2 (react-quill-new).
export { CODE_LANGUAGES } from '@/lib/blog-content/code-languages';

export function registerCodeLanguageBlot(Quill: any) {
  try {
    const CodeBlock = Quill.import('formats/code-block');

    class LangCodeBlock extends CodeBlock {
      static create(value: any) {
        const node = super.create(value);
        if (typeof value === 'string' && value && value !== 'text') {
          node.setAttribute('data-language', value);
        }
        return node;
      }
      static formats(domNode: HTMLElement) {
        return domNode.getAttribute('data-language') || true;
      }
      format(name: string, value: any) {
        if (name === 'code-block' && typeof value === 'string') {
          (this as any).domNode.setAttribute('data-language', value);
        } else {
          super.format(name, value);
        }
      }
    }
    Quill.register('formats/code-block', LangCodeBlock, true);
  } catch {
    // already registered / unsupported — code blocks still work without a language
  }
}
