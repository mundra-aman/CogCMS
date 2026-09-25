'use client';

export default function TakeawaysRepeater({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12px] uppercase tracking-wider text-gray-400" style={{ fontWeight: 600 }}>
        Key Takeaways
      </label>
      {value.map((t, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={t}
            onChange={(e) => onChange(value.map((x, idx) => (idx === i ? e.target.value : x)))}
            placeholder="A key point readers should remember"
            className="flex-1 px-3 py-2 rounded-md border bg-gray-50/50 text-sm"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          />
          <button type="button" onClick={() => onChange(value.filter((_, idx) => idx !== i))}
            className="text-xs text-red-500">×</button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...value, ''])}
        className="self-start text-xs text-[#FF751F]">+ Add takeaway</button>
    </div>
  );
}
