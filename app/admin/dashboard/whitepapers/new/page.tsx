'use client';

import { Suspense, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import 'react-quill-new/dist/quill.snow.css';
import { contentToBlocks } from '@/lib/whitepaper-content';
import { WhitepaperArticle } from '@/components/preview/whitepaper-article';
import { useSite } from '@/components/admin/site-provider';

const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false });

interface WhitepaperFormData {
  title: string;
  slug: string;
  description: string;
  date: string;
  author: string;
  authorRole: string;
  readTime: string;
  tags: string;
  headline: string;
  stat1Value: string;
  stat1Label: string;
  stat2Value: string;
  stat2Label: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
  content: string;
}

const DEFAULT_DATA: WhitepaperFormData = {
  title: '',
  slug: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
  author: 'Research Team',
  authorRole: 'AI Search Strategist',
  readTime: '',
  tags: 'AEO, GEO, AI Search',
  headline: '',
  stat1Value: '',
  stat1Label: '',
  stat2Value: '',
  stat2Label: '',
  metaTitle: '',
  metaDescription: '',
  keywords: '',
  content:
    '<h1>Whitepaper Title</h1><h2>Executive Summary</h2><p>Write your whitepaper content in the editor.</p>',
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function estimateReadTime(content: string) {
  const plainText = content
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#>*`\[\]_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) {
    return '1 min read';
  }

  const words = plainText.split(' ').filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / 238));
  return `${minutes} min read`;
}

function formatPreviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function WhitepaperEditorForm() {
  const site = useSite();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editSlug = searchParams.get('slug');

  const [formData, setFormData] = useState<WhitepaperFormData>(DEFAULT_DATA);
  const [originalSlug, setOriginalSlug] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(!!editSlug);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editSlug) return;

    setLoadingData(true);
    setOriginalSlug(editSlug);

    fetch(`/api/admin/whitepapers/${editSlug}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.error) return;

        const tags = Array.isArray(data.tags)
          ? data.tags.join(', ')
          : typeof data.tags === 'string'
            ? data.tags
            : data.tag || '';

        setFormData({
          title: data.title || '',
          slug: data.slug || '',
          description: data.description || data.excerpt || '',
          date: data.date
            ? String(data.date).slice(0, 10)
            : data.createdAt
              ? new Date(data.createdAt).toISOString().slice(0, 10)
              : DEFAULT_DATA.date,
          author: data.author || DEFAULT_DATA.author,
          authorRole: data.authorRole || '',
          readTime: data.readTime || '',
          tags,
          headline: data.headline || '',
          stat1Value: data.stat1Value || '',
          stat1Label: data.stat1Label || '',
          stat2Value: data.stat2Value || '',
          stat2Label: data.stat2Label || '',
          metaTitle: data.metaTitle || '',
          metaDescription: data.metaDescription || '',
          keywords: data.keywords || '',
          content: data.content || '',
        });

        setSlugManuallyEdited(true);
      })
      .catch((fetchError) => {
        console.error(fetchError);
        setError('Failed to load whitepaper for editing.');
      })
      .finally(() => setLoadingData(false));
  }, [editSlug]);

  const computedReadTime = useMemo(() => estimateReadTime(formData.content), [formData.content]);
  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: '#whitepaper-editor-toolbar',
        handlers: {
          divider(this: any) {
            const range = this.quill.getSelection(true);
            const index = range ? range.index : this.quill.getLength();
            this.quill.clipboard.dangerouslyPasteHTML(index, '<hr><p><br></p>');
            this.quill.setSelection(index + 1);
          },
        },
      },
    }),
    [],
  );
  const quillFormats = ['header', 'list', 'bullet'];

  const previewWhitepaper = useMemo(() => {
    const tags = formData.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const readTime = formData.readTime || computedReadTime;

    return {
      title: formData.title || 'Your Whitepaper Title',
      description: formData.description || 'Short description',
      dateFormatted: formatPreviewDate(formData.date || DEFAULT_DATA.date),
      author: formData.author || DEFAULT_DATA.author,
      authorRole: formData.authorRole || 'AI Search Strategist',
      readTime,
      tags: tags.length > 0 ? tags : ['AEO', 'GEO', 'AI Search'],
      headline: formData.headline || formData.title || 'Headline',
      stat1Value: formData.stat1Value,
      stat1Label: formData.stat1Label,
      stat2Value: formData.stat2Value,
      stat2Label: formData.stat2Label,
      blocks: contentToBlocks(formData.content || DEFAULT_DATA.content),
    };
  }, [computedReadTime, formData]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'slug') {
      setSlugManuallyEdited(true);
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTitleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const title = e.target.value;
    setFormData((prev) => ({
      ...prev,
      title,
      slug: slugManuallyEdited ? prev.slug : slugify(title),
      headline: prev.headline || title,
    }));
  };

  const handleSubmit = async (status: 'draft' | 'publish') => {
    if (!formData.title.trim()) {
      setError('Title is required.');
      return;
    }

    if (!formData.slug.trim()) {
      setError('Slug is required.');
      return;
    }

    if (!formData.description.trim()) {
      setError('Description is required.');
      return;
    }

    if (!formData.content.trim()) {
      setError('Whitepaper content is required.');
      return;
    }

    setLoading(true);
    setError(null);

    const tagsArray = formData.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const payload = {
      title: formData.title,
      slug: formData.slug,
      description: formData.description,
      excerpt: formData.description,
      date: formData.date,
      author: formData.author,
      authorRole: formData.authorRole,
      readTime: formData.readTime || computedReadTime,
      tags: tagsArray,
      tag: tagsArray[0] || 'Research',
      headline: formData.headline || formData.title,
      stat1Value: formData.stat1Value,
      stat1Label: formData.stat1Label,
      stat2Value: formData.stat2Value,
      stat2Label: formData.stat2Label,
      metaTitle: formData.metaTitle,
      metaDescription: formData.metaDescription,
      keywords: formData.keywords,
      content: formData.content,
      status,
    };

    try {
      const isEdit = !!originalSlug;
      const endpoint = isEdit ? `/api/admin/whitepapers/${originalSlug}` : '/api/admin/whitepapers';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save whitepaper.');
        return;
      }

      router.push('/admin/dashboard/whitepapers');
    } catch (submitError: any) {
      setError(submitError.message || 'Failed to save whitepaper.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFAF7] text-[#1a1a1a]">
      <div className="flex justify-end px-8 pt-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSubmit('draft')}
            disabled={loading || loadingData}
            className="px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-50 border rounded-full transition-colors disabled:opacity-50"
            style={{ fontWeight: 500, borderColor: 'rgba(0,0,0,0.12)' }}
          >
            Save draft
          </button>
          <button
            type="button"
            onClick={() => handleSubmit('publish')}
            disabled={loading || loadingData}
            className="px-5 py-2 text-[13px] text-white rounded-full shadow-sm transition-all disabled:opacity-50"
            style={{
              fontWeight: 600,
              background: 'linear-gradient(135deg, #1a8917, #2ba52b)',
              boxShadow: '0 2px 8px rgba(26,137,23,0.3)',
            }}
          >
            {loading ? 'Saving...' : 'Publish'}
          </button>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/dashboard/whitepapers"
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
            {editSlug ? 'Edit Whitepaper' : 'Create Whitepaper'}
          </h1>
        </div>

        {error && (
          <div className="p-4 mb-6 text-sm text-red-700 bg-red-50 rounded-xl border border-red-200">
            {error}
          </div>
        )}

        {loadingData ? (
          <div className="p-10 text-center text-gray-500">Loading whitepaper...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_520px] gap-6 items-start">
            <div
              className="rounded-2xl border p-6 space-y-5"
              style={{
                backgroundColor: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(16px)',
                borderColor: 'rgba(0,0,0,0.06)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="Title"
                  name="title"
                  value={formData.title}
                  onChange={handleTitleChange}
                />
                <Field label="Slug" name="slug" value={formData.slug} onChange={handleChange} />
                <Field
                  label="Description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  multiline
                />
                <Field
                  label="Date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  type="date"
                />
                <Field
                  label="Author"
                  name="author"
                  value={formData.author}
                  onChange={handleChange}
                />
                <Field
                  label="Author Role"
                  name="authorRole"
                  value={formData.authorRole}
                  onChange={handleChange}
                />
                <Field
                  label="Read Time"
                  name="readTime"
                  value={formData.readTime}
                  onChange={handleChange}
                  hint={`Auto: ${computedReadTime}`}
                />
                <Field
                  label="Tags (comma separated)"
                  name="tags"
                  value={formData.tags}
                  onChange={handleChange}
                />
                <Field
                  label="Headline"
                  name="headline"
                  value={formData.headline}
                  onChange={handleChange}
                />
                <Field
                  label="Stat 1 Value"
                  name="stat1Value"
                  value={formData.stat1Value}
                  onChange={handleChange}
                />
                <Field
                  label="Stat 1 Label"
                  name="stat1Label"
                  value={formData.stat1Label}
                  onChange={handleChange}
                />
                <Field
                  label="Stat 2 Value"
                  name="stat2Value"
                  value={formData.stat2Value}
                  onChange={handleChange}
                />
                <Field
                  label="Stat 2 Label"
                  name="stat2Label"
                  value={formData.stat2Label}
                  onChange={handleChange}
                />
                <Field
                  label="Meta Title"
                  name="metaTitle"
                  value={formData.metaTitle}
                  onChange={handleChange}
                />
                <Field
                  label="Meta Description"
                  name="metaDescription"
                  value={formData.metaDescription}
                  onChange={handleChange}
                  multiline
                />
                <Field
                  label="Keywords"
                  name="keywords"
                  value={formData.keywords}
                  onChange={handleChange}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  className="text-[12px] uppercase tracking-wider text-gray-400"
                  style={{ fontWeight: 600 }}
                >
                  Whitepaper Content
                </label>
                <div
                  className="rounded-xl border bg-white min-h-[420px] px-1 py-2"
                  style={{
                    borderColor: 'rgba(0,0,0,0.08)',
                  }}
                >
                  <div
                    id="whitepaper-editor-toolbar"
                    className="border-b mb-3 px-2 py-1.5 rounded-t-lg bg-[#fafafa]"
                    style={{ borderColor: 'rgba(0,0,0,0.08)' }}
                  >
                    <span className="ql-formats">
                      <button className="ql-header" value="1" />
                      <button className="ql-header" value="2" />
                      <button className="ql-header" value="3" />
                    </span>
                    <span className="ql-formats">
                      <button className="ql-list" value="ordered" />
                      <button className="ql-list" value="bullet" />
                    </span>
                    <span className="ql-formats">
                      <button className="ql-divider" type="button">
                        HR
                      </button>
                    </span>
                  </div>
                  <ReactQuill
                    useSemanticHTML={false}
                    theme="snow"
                    value={formData.content}
                    onChange={(value: string) =>
                      setFormData((prev) => ({ ...prev, content: value }))
                    }
                    modules={quillModules}
                    formats={quillFormats}
                    placeholder="Write your whitepaper content..."
                  />
                </div>
              </div>
            </div>

            <aside
              className="rounded-2xl border p-5 h-fit sticky top-24"
              style={{
                backgroundColor: 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(16px)',
                borderColor: 'rgba(0,0,0,0.06)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
              }}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-sm text-gray-900" style={{ fontWeight: 600 }}>
                    Live Whitepaper Preview
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    This renders the same layout the public whitepaper page uses.
                  </p>
                </div>
                <span
                  className="text-[10px] uppercase tracking-[0.08em] px-2.5 py-1 rounded-full border bg-orange-50 text-orange-600"
                  style={{ fontWeight: 700, borderColor: 'rgba(255,117,31,0.18)' }}
                >
                  Preview
                </span>
              </div>

              <div
                className="rounded-2xl border overflow-hidden bg-white"
                style={{
                  borderColor: 'rgba(0,0,0,0.08)',
                  maxHeight: 'calc(100vh - 170px)',
                  overflowY: 'auto',
                }}
              >
                <div style={{ pointerEvents: 'none' }}>
                  <WhitepaperArticle wp={previewWhitepaper} />
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                URL:{' '}
                <span className="text-gray-700">
                  {site?.publicPaths.whitepapers ?? '/whitepapers'}/{formData.slug || 'your-slug'}
                </span>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  multiline = false,
  type = 'text',
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  multiline?: boolean;
  type?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[11px] uppercase tracking-wider text-gray-400"
        style={{ fontWeight: 600 }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          className="px-3 py-2.5 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm min-h-[88px]"
          style={{ borderColor: 'rgba(0,0,0,0.08)' }}
        />
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          className="px-3 py-2.5 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 text-sm"
          style={{ borderColor: 'rgba(0,0,0,0.08)' }}
        />
      )}
      {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
    </div>
  );
}

export default function NewWhitepaperPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FDFAF7]" />}>
      <WhitepaperEditorForm />
    </Suspense>
  );
}
