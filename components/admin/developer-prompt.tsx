'use client';

import { useState } from 'react';
import { developerConnectionPrompt } from '@/lib/website-connection-guide';

export function DeveloperPrompt() {
  const [status, setStatus] = useState('');

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(developerConnectionPrompt);
      setStatus('Prompt copied. Fill the placeholders before sending it to your developer.');
    } catch {
      setStatus('Copy was blocked by your browser. Select the prompt below and copy it manually.');
    }
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={copyPrompt}
        className="rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
      >
        Copy developer prompt
      </button>
      <p role="status" className="mt-3 text-sm text-stone-600">
        {status}
      </p>
      <label htmlFor="developer-prompt" className="mt-4 block text-sm font-medium text-stone-800">
        Developer AI prompt — replace the bracketed placeholders after copying
      </label>
      <textarea
        id="developer-prompt"
        readOnly
        value={developerConnectionPrompt}
        rows={18}
        spellCheck={false}
        className="mt-2 w-full resize-y rounded-xl border border-stone-300 bg-stone-50 p-4 font-mono text-sm leading-6 text-stone-800 focus-visible:outline-2 focus-visible:outline-orange-600"
      />
    </div>
  );
}
