'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { slugify } from '@/lib/blog-content/slugify';

export default function NewAuthorPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', slug: '', role: '', bio: '', avatarUrl: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = { ...form, slug: form.slug || slugify(form.name) };
    try {
      const res = await fetch('/api/admin/authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save author.');
        return;
      }
      router.push('/admin/dashboard/authors');
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  };

  const fieldLabels: Record<string, string> = {
    name: 'Name',
    role: 'Role / Title',
    avatarUrl: 'Avatar URL',
  };

  return (
    <div className="min-h-screen bg-[#FDFAF7] text-[#1a1a1a]">
      <div className="max-w-xl mx-auto px-8 py-12">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/dashboard/authors"
            className="text-gray-400 hover:text-gray-800 transition-colors"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1
            className="text-2xl md:text-3xl"
            style={{
              fontWeight: 600,
              color: '#1a1a1a',
              letterSpacing: '-0.03em',
            }}
          >
            New Author
          </h1>
        </div>

        <div
          className="rounded-2xl border p-8 flex flex-col gap-5"
          style={{
            backgroundColor: 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(16px)',
            borderColor: 'rgba(0,0,0,0.06)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
          }}
        >
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          {(['name', 'role', 'avatarUrl'] as const).map((k) => (
            <div key={k} className="flex flex-col gap-1.5">
              <label className="text-sm" style={{ fontWeight: 500, color: '#555' }}>
                {fieldLabels[k]}
              </label>
              <input
                placeholder={fieldLabels[k]}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                className="px-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-orange-200 placeholder:text-gray-400 bg-white/80 text-sm"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
              />
            </div>
          ))}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ fontWeight: 500, color: '#555' }}>
              Slug <span className="text-gray-400 font-normal">(auto-generated if blank)</span>
            </label>
            <input
              placeholder="e.g. jane-doe"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="px-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-orange-200 placeholder:text-gray-400 bg-white/80 text-sm"
              style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm" style={{ fontWeight: 500, color: '#555' }}>
              Bio
            </label>
            <textarea
              placeholder="Short bio…"
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              className="px-4 py-3 rounded-xl border outline-none transition-all focus:ring-2 focus:ring-orange-200 placeholder:text-gray-400 bg-white/80 text-sm min-h-[100px] resize-y"
              style={{ borderColor: 'rgba(0,0,0,0.08)' }}
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="self-start px-6 py-2.5 rounded-xl text-white text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FF751F, #ff9044)',
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(255,117,31,0.25)',
            }}
          >
            {saving ? 'Saving…' : 'Save Author'}
          </button>
        </div>
      </div>
    </div>
  );
}
