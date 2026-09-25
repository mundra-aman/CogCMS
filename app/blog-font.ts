import { Poppins } from 'next/font/google';

/* Shared Poppins instance for the blog surfaces (public /blogs + the admin blog
   editor). Both rebind --font-sans — the same variable the root layout sets via
   Geist — so blog content renders in Poppins while the rest of the site stays on
   Geist and code blocks stay on --font-mono. Single source so the public render
   and the editor canvas use an identical font. */
export const poppins = Poppins({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});
