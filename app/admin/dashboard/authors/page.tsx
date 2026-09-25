'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Author = { _id: string; name: string; slug: string; role?: string };

export default function AuthorsListPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/authors', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) {
          setAuthors(d);
        } else {
          console.error('API Error:', d);
          setAuthors([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFAF7] text-[#1a1a1a]">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/admin/dashboard"
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
              Manage Authors
            </h1>
          </div>
          <Link
            href="/admin/dashboard/authors/new"
            className="px-5 py-2.5 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm"
            style={{
              background: 'linear-gradient(135deg, #FF751F, #ff9044)',
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(255,117,31,0.25)',
            }}
          >
            + New Author
          </Link>
        </div>

        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            backgroundColor: 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(16px)',
            borderColor: 'rgba(0,0,0,0.06)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.03)',
          }}
        >
          {loading ? (
            <p className="p-8 text-gray-500 text-center">Loading authors...</p>
          ) : authors.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 mb-2">No authors found.</p>
              <p className="text-sm text-gray-400">Create your first one to get started.</p>
            </div>
          ) : (
            <div>
              {authors.map((author, i) => (
                <div
                  key={author._id}
                  className="px-6 py-5 flex items-center justify-between hover:bg-white/60 transition-colors"
                  style={{
                    borderBottom: i < authors.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                  }}
                >
                  <div className="flex-1">
                    <h3 className="text-base text-[#1a1a1a] mb-1" style={{ fontWeight: 600 }}>
                      {author.name}
                      {author.role && (
                        <span
                          className="ml-2 text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-medium border border-orange-100"
                          style={{ letterSpacing: '0.02em' }}
                        >
                          {author.role}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-gray-400">/{author.slug}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
