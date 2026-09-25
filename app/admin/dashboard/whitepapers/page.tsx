'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useSite } from '@/components/admin/site-provider';
import { publicUrlFor } from '@/lib/site/urls';

interface Whitepaper {
  _id: string;
  title: string;
  slug: string;
  status?: string;
  tag?: string;
  tags?: string[];
  isFeatured?: boolean;
  createdAt: string;
}

export default function AdminWhitepapersList() {
  const site = useSite();
  const [whitepapers, setWhitepapers] = useState<Whitepaper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/whitepapers', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setWhitepapers(data);
        } else {
          console.error('API Error:', data);
          setWhitepapers([]);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const [whitepaperToDelete, setWhitepaperToDelete] = useState<string | null>(null);

  const handleDeleteClick = (slug: string) => {
    setWhitepaperToDelete(slug);
  };

  const confirmDelete = async () => {
    if (!whitepaperToDelete) return;
    try {
      const res = await fetch(`/api/admin/whitepapers/${whitepaperToDelete}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setWhitepapers(whitepapers.filter((b) => b.slug !== whitepaperToDelete));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWhitepaperToDelete(null);
    }
  };

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
              Manage Whitepapers
            </h1>
          </div>
          <Link
            href="/admin/dashboard/whitepapers/new"
            className="px-5 py-2.5 text-white rounded-xl shadow-md hover:shadow-lg transition-all text-sm"
            style={{
              background: 'linear-gradient(135deg, #FF751F, #ff9044)',
              fontWeight: 600,
              boxShadow: '0 4px 16px rgba(255,117,31,0.25)',
            }}
          >
            + Create New Whitepaper
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
            <p className="p-8 text-gray-500 text-center">Loading whitepapers...</p>
          ) : whitepapers.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-400 mb-2">No whitepapers found.</p>
              <p className="text-sm text-gray-400">Create your first one to get started.</p>
            </div>
          ) : (
            <div>
              {whitepapers.map((whitepaper, i) => {
                const primaryTag = whitepaper.tag || whitepaper.tags?.[0];
                return (
                  <div
                    key={whitepaper._id}
                    className="px-6 py-5 flex items-center justify-between hover:bg-white/60 transition-colors"
                    style={{
                      borderBottom:
                        i < whitepapers.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
                    }}
                  >
                    <div className="flex-1">
                      <Link
                        href={`/admin/dashboard/whitepapers/new?slug=${whitepaper.slug}`}
                        className="hover:underline"
                      >
                        <h3
                          className="text-base text-[#1a1a1a] mb-1 flex items-center gap-2"
                          style={{ fontWeight: 600 }}
                        >
                          {whitepaper.title}
                          {whitepaper.status === 'draft' && (
                            <span
                              className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium"
                              style={{ letterSpacing: '0.02em' }}
                            >
                              Draft
                            </span>
                          )}
                        </h3>
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        {primaryTag && (
                          <span className="text-[10px] uppercase font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-100">
                            {primaryTag}
                          </span>
                        )}
                        <p className="text-xs text-gray-400">
                          /{whitepaper.slug} • {new Date(whitepaper.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {whitepaper.status !== 'draft' && site && (
                        <a
                          href={publicUrlFor(site, 'whitepapers', whitepaper.slug)}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-blue-50 transition-colors"
                          style={{
                            borderColor: 'rgba(59,130,246,0.2)',
                            color: '#3b82f6',
                            fontWeight: 500,
                          }}
                        >
                          View
                        </a>
                      )}
                      <button
                        onClick={() => handleDeleteClick(whitepaper.slug)}
                        className="px-3 py-1.5 text-xs border rounded-lg hover:bg-red-50 hover:text-red-600 transition-colors"
                        style={{
                          borderColor: 'rgba(239,68,68,0.2)',
                          color: '#ef4444',
                          fontWeight: 500,
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Premium Alert Dialog for Deletion */}
      <AlertDialog.Root
        open={!!whitepaperToDelete}
        onOpenChange={(open) => !open && setWhitepaperToDelete(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <AlertDialog.Content
            className="fixed left-[50%] top-[50%] z-[100] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-8 shadow-2xl sm:rounded-3xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
            style={{ borderColor: 'rgba(0,0,0,0.08)' }}
          >
            <div className="flex flex-col gap-3 text-center sm:text-left">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 sm:mx-0">
                <svg
                  className="h-8 w-8 text-red-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <AlertDialog.Title className="text-xl font-semibold text-gray-900 mt-2 tracking-tight">
                Delete this whitepaper post?
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-gray-500 leading-relaxed font-medium">
                Are you absolutely sure you want to delete this content? This action cannot be
                undone. This will permanently remove the whitepaper post, its metadata, and content
                from your servers.
              </AlertDialog.Description>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-3 mt-4">
              <AlertDialog.Cancel asChild>
                <button className="mt-3 inline-flex w-full justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto transition-colors">
                  Cancel
                </button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button
                  onClick={confirmDelete}
                  className="inline-flex w-full justify-center rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 sm:w-auto transition-colors"
                >
                  Yes, delete it
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
