import type { ReactNode } from 'react';
import { poppins } from '../../../blog-font';

/* The blog editor + admin blog list use Poppins so the writing surface matches
   the published article (app/blogs uses the same shared instance). Rebinds
   --font-sans for this segment; the editor canvas font override lives in
   editor-canvas.css (.ql-container forces Helvetica, so a wrapper isn't enough). */
export default function AdminBlogsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={poppins.variable} style={{ fontFamily: 'var(--font-sans), sans-serif' }}>
      {children}
    </div>
  );
}
