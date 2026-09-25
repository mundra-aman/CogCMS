// Run with tsx; uses installed Playwright/Chrome and no remote services.
// PLAYWRIGHT_MODULE may point to an existing installation; never downloads it.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { renderBlogSnapshot } from '../lib/render/blog.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const id = '\0publishing-qa';
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ReactQuill, { Quill } from 'react-quill-new';
import { registerCodeLanguageBlot } from '/lib/quill/code-language-blot.ts';
registerCodeLanguageBlot(Quill);
window.qa = {};
createRoot(document.getElementById('editor')).render(React.createElement(ReactQuill, {
  useSemanticHTML: false,
  ref: value => { if (value) window.qa.editor = value; },
  onChange: value => { window.qa.html = value; }
}));`;
const server = await createServer({
  configFile: false, root, resolve: { alias: { '@': root } },
  server: { host: '127.0.0.1', port: 0 },
  plugins: [{
    name: 'publishing-qa', resolveId: value => value === id ? id : undefined,
    load: value => value === id ? entry : undefined,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml('/', '<!doctype html><div id="editor"></div><script type="module" src="/@id/__x00__publishing-qa"></script>'));
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'chrome' });
  const page = await browser.newPage();
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  await page.waitForFunction(() => window.qa?.editor?.getEditor());
  const source = await page.evaluate(() => {
    const quill = window.qa.editor.getEditor();
    quill.setContents([
      { insert: '  const value = "&lt;tag&gt;";' },
      { insert: '\n\n', attributes: { 'code-block': 'javascript' } },
      { insert: '  console.log(value < 3);' },
      { insert: '\n', attributes: { 'code-block': 'javascript' } },
    ]);
    if (window.qa.html !== quill.root.innerHTML) throw Error('Expected safe DOM export');
    return window.qa.html;
  });
  const published = await renderBlogSnapshot(source);
  await page.setContent(published.html);
  assert.equal(await page.locator('.blog-code').count(), 1);
  assert.equal(await page.locator('.blog-code__lang').textContent(), 'JAVASCRIPT');
  assert.equal(await page.getByRole('button', { name: 'Copy code' }).count(), 1);
  assert.equal(await page.locator('pre.shiki code').textContent(), '  const value = "&lt;tag&gt;";\n\n  console.log(value < 3);');
  assert.ok(await page.locator('pre.shiki span[style]').count());
  assert.equal(await page.locator('.ql-code-block-container,script').count(), 0);
  console.log('PASS: actual ReactQuill DOM export publishes exact code text, blank lines, language, Shiki highlighting and copy control.');
} finally {
  await browser?.close();
  await server.close();
}
