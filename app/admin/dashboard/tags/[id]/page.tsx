'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PRESET_COLORS = [
  '#FF751F',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ef4444',
  '#f59e0b',
  '#14b8a6',
  '#ec4899',
  '#6366f1',
  '#64748b',
];

export default function EditTagPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    color: '#FF751F',
    status: 'publish' as 'draft' | 'publish',
  });

  useEffect(() => {
    fetch(`/api/admin/tags/${id}`)
      .then((r) => {
        if (!r.ok) {
          setNotFound(true);
          setLoading(false);
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        setFormData({
          name: data.name || '',
          slug: data.slug || '',
          description: data.description || '',
          color: data.color || '#FF751F',
          status: data.status || 'publish',
        });
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load tag');
        setLoading(false);
      });
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Tag name is required.');
      return;
    }
    if (!formData.slug.trim()) {
      setError('Slug is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Failed to update tag');
        setSaving(false);
        return;
      }
      router.push('/admin/dashboard/tags');
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFAF7] flex items-center justify-center">
        <div className="text-center">
          <div
            className="inline-block h-6 w-6 rounded-full border-2 border-orange-200 border-t-orange-500 animate-spin"
            role="status"
          />
          <p className="text-gray-400 mt-3 text-sm">Loading tag…</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#FDFAF7] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-3" style={{ fontWeight: 500 }}>
            Tag not found
          </p>
          <Link
            href="/admin/dashboard/tags"
            className="text-sm text-orange-600 hover:text-orange-700 underline underline-offset-4"
          >
            Back to tags
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFAF7] text-[#1a1a1a]">
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/dashboard/tags"
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
          <div>
            <h1
              className="text-2xl md:text-3xl"
              style={{
                fontWeight: 600,
                color: '#1a1a1a',
                letterSpacing: '-0.03em',
              }}
            >
              Edit Tag
            </h1>
            <p className="text-xs text-gray-400 mt-1">
              Editing &ldquo;{formData.name}&rdquo;
            </p>
          </div>
        </div>

        {error && (
          <div className="p-4 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200 mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div
            className="rounded-2xl border p-6 md:p-8 space-y-6"
            style={{
              backgroundColor: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(16px)',
              borderColor: 'rgba(0,0,0,0.06)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
            }}
          >
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Tag Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-base"
                style={{ borderColor: 'rgba(0,0,0,0.08)', fontWeight: 500 }}
                placeholder="e.g. Machine Learning"
                required
              />
            </div>

            {/* Slug */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Slug
              </label>
              <input
                type="text"
                name="slug"
                value={formData.slug}
                onChange={handleChange}
                className="px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm font-mono"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                placeholder="machine-learning"
                required
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Description
                <span className="text-gray-300 normal-case tracking-normal ml-1">(optional)</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                className="px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm leading-relaxed min-h-[80px]"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                placeholder="A brief description of what this tag represents…"
              />
            </div>

            {/* Color Picker */}
            <div className="flex flex-col gap-2.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Color Label
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, color }))}
                    className="h-8 w-8 rounded-full transition-all"
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        formData.color === color
                          ? `0 0 0 3px white, 0 0 0 5px ${color}`
                          : '0 1px 3px rgba(0,0,0,0.1)',
                      transform: formData.color === color ? 'scale(1.15)' : 'scale(1)',
                    }}
                    title={color}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-8 w-8 rounded-lg border-0 cursor-pointer p-0"
                />
                <span className="text-[11px] text-gray-400 font-mono">{formData.color}</span>
              </div>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="px-4 py-2.5 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
              >
                <option value="publish">Published</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          {/* Preview */}
          {formData.name && (
            <div className="mt-6">
              <span
                className="text-[12px] uppercase tracking-wider text-gray-400 mb-3 block"
                style={{ fontWeight: 600 }}
              >
                Preview
              </span>
              <div
                className="rounded-xl border p-5 flex items-center gap-3"
                style={{
                  borderColor: 'rgba(255,117,31,0.15)',
                  background: 'rgba(255,117,31,0.02)',
                }}
              >
                <span
                  className="h-5 w-5 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                  style={{ backgroundColor: formData.color }}
                />
                <div className="min-w-0">
                  <span
                    className="text-[11px] uppercase tracking-[0.08em] px-2.5 py-1 rounded-md inline-block"
                    style={{
                      fontWeight: 600,
                      color: formData.color,
                      background: `${formData.color}0F`,
                      border: `1px solid ${formData.color}20`,
                    }}
                  >
                    {formData.name}
                  </span>
                  {formData.description && (
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                      {formData.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-8">
            <Link
              href="/admin/dashboard/tags"
              className="px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 border rounded-xl transition-colors"
              style={{ fontWeight: 500, borderColor: 'rgba(0,0,0,0.08)' }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #FF751F, #ff9044)',
                fontWeight: 600,
                boxShadow: '0 4px 16px rgba(255,117,31,0.25)',
              }}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
