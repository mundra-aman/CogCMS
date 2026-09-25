'use client';

import { useState } from 'react';
import { CODE_LANGUAGES } from '@/lib/quill/code-language-blot';

export default function CodeLanguagePicker({ onPick }: { onPick: (lang: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] hover:border-[#FF751F] hover:text-[#FF751F] transition-colors"
        style={{ borderColor: 'rgba(0,0,0,0.08)', color: '#888', fontWeight: 500 }}
      >
        Code
      </button>
      {open ? (
        <div
          className="absolute z-50 mt-1 w-40 max-h-60 overflow-auto bg-white border rounded-lg shadow-xl p-1"
          style={{ borderColor: 'rgba(0,0,0,0.08)' }}
        >
          {CODE_LANGUAGES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                onPick(l);
                setOpen(false);
              }}
              className="block w-full text-left px-2 py-1.5 text-xs rounded hover:bg-orange-50 hover:text-[#FF751F]"
            >
              {l}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
