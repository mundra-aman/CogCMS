'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const CATEGORIES = ['Platform', 'Features', 'Pricing', 'Security', 'Strategy'];

function FAQForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    question: '',
    answer: '',
    category: 'Platform',
  });

  // Pre-fill question from URL params (from user submissions)
  useEffect(() => {
    const q = searchParams.get('question');
    if (q) {
      setFormData((prev) => ({ ...prev, question: q }));
    }
  }, [searchParams]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.question.trim()) {
      setError('Question is required.');
      return;
    }
    if (!formData.answer.trim()) {
      setError('Answer is required.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/faqs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        console.warn(data.error || 'Failed to create FAQ');
      }
      router.push('/admin/dashboard/faqs');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFAF7] text-[#1a1a1a]">
      <div className="max-w-2xl mx-auto px-8 py-12">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/dashboard/faqs"
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
            Add New FAQ
          </h1>
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
            {/* Category */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Category
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleChange}
                className="px-4 py-2.5 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Question */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Question
              </label>
              <input
                type="text"
                name="question"
                value={formData.question}
                onChange={handleChange}
                className="px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-base"
                style={{ borderColor: 'rgba(0,0,0,0.08)', fontWeight: 500 }}
                placeholder="e.g. How does the platform protect customer data?"
                required
              />
            </div>

            {/* Answer */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-[12px] uppercase tracking-wider text-gray-400"
                style={{ fontWeight: 600 }}
              >
                Answer
              </label>
              <textarea
                name="answer"
                value={formData.answer}
                onChange={handleChange}
                className="px-4 py-3 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm leading-relaxed min-h-[120px]"
                style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                placeholder="Write a comprehensive answer..."
                required
              />
              <span className="text-[11px] text-gray-300 text-right">
                {formData.answer.length} characters
              </span>
            </div>
          </div>

          {/* Preview */}
          {formData.question && (
            <div className="mt-6">
              <span
                className="text-[12px] uppercase tracking-wider text-gray-400 mb-3 block"
                style={{ fontWeight: 600 }}
              >
                Preview
              </span>
              <div
                className="rounded-xl border p-5"
                style={{
                  borderColor: 'rgba(255,117,31,0.15)',
                  background: 'rgba(255,117,31,0.02)',
                }}
              >
                <span
                  className="text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-md inline-block mb-3"
                  style={{
                    fontWeight: 600,
                    color: '#FF751F',
                    background: 'rgba(255,117,31,0.06)',
                    border: '1px solid rgba(255,117,31,0.1)',
                  }}
                >
                  {formData.category}
                </span>
                <h3 className="text-base mb-2" style={{ fontWeight: 600, color: '#1a1a1a' }}>
                  {formData.question}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {formData.answer || 'Answer preview will appear here...'}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-8">
            <Link
              href="/admin/dashboard/faqs"
              className="px-5 py-2.5 text-sm text-gray-600 hover:bg-gray-50 border rounded-xl transition-colors"
              style={{ fontWeight: 500, borderColor: 'rgba(0,0,0,0.08)' }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, #FF751F, #ff9044)',
                fontWeight: 600,
                boxShadow: '0 4px 16px rgba(255,117,31,0.25)',
              }}
            >
              {loading ? 'Saving...' : 'Save FAQ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewFAQPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FDFAF7]" />}>
      <FAQForm />
    </Suspense>
  );
}
