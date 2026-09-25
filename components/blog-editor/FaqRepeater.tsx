'use client';

type Faq = { question: string; answer: string };

export default function FaqRepeater({
  value,
  onChange,
}: {
  value: Faq[];
  onChange: (v: Faq[]) => void;
}) {
  const update = (i: number, patch: Partial<Faq>) =>
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  return (
    <div className="flex flex-col gap-3">
      <label className="text-[12px] uppercase tracking-wider text-gray-400" style={{ fontWeight: 600 }}>
        FAQ
      </label>
      {value.map((f, i) => (
        <div key={i} className="p-3 rounded-lg border" style={{ borderColor: 'rgba(0,0,0,0.08)' }}>
          <input
            value={f.question}
            onChange={(e) => update(i, { question: e.target.value })}
            placeholder="Question"
            className="w-full mb-2 px-3 py-2 rounded-md border bg-gray-50/50 text-sm"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          />
          <textarea
            value={f.answer}
            onChange={(e) => update(i, { answer: e.target.value })}
            placeholder="Answer"
            className="w-full px-3 py-2 rounded-md border bg-gray-50/50 text-sm min-h-[64px]"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          />
          <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="mt-2 text-xs text-red-500">Remove</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, { question: '', answer: '' }])}
        className="self-start text-xs text-[#FF751F]">+ Add FAQ</button>
    </div>
  );
}
