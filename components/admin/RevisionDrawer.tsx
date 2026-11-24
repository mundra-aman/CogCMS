'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSite } from '@/components/admin/site-provider';
import {
  computeWordDiff,
  computeFieldDiff,
  computeDateTimeDiff,
  stripHtmlTags,
  htmlToStructuredText,
  replaceBlogGraphics,
  renderVisualBodyHtml,
  type DiffToken,
  type FieldDiffResult,
} from '@/lib/revisions/diff';

export interface RevisionAuthor {
  id: string;
  name: string;
  email: string;
}

export interface RevisionSummaryItem {
  _id: string;
  majorVersion: number;
  minorVersion: number;
  version: string;
  restoredFromVersion?: string | null;
  trigger?: 'create' | 'update' | 'publish' | 'unpublish' | 'restore';
  author: RevisionAuthor;
  summary?: string;
  createdAt: string;
}

export interface RevisionDetailItem extends RevisionSummaryItem {
  snapshot: Record<string, unknown>;
}

export interface RevisionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: 'blog' | 'event';
  entityId: string | null;
  currentDraft: Record<string, unknown>;
  onRestore: (entity: Record<string, unknown>, snapshot: Record<string, unknown>) => void;
  authors?: Array<{ _id?: string; id?: string; name: string }>;
}

export function RevisionDrawer({
  isOpen,
  onClose,
  entityType,
  entityId,
  currentDraft,
  onRestore,
  authors: initialAuthors,
}: RevisionDrawerProps) {
  // Composite key guards against stale responses when switching sites or entities while drawer stays mounted.
  const site = useSite();
  const currentSiteId = site?.id ? String(site.id) : (currentDraft?.siteId ? String(currentDraft.siteId) : '');
  const activeRequestKey = `${currentSiteId}:${entityType}:${entityId || ''}`;
  const activeRequestKeyRef = useRef(activeRequestKey);
  activeRequestKeyRef.current = activeRequestKey;

  const loadMoreAbortRef = useRef<AbortController | null>(null);

  const [revisions, setRevisions] = useState<RevisionSummaryItem[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [selectedRevisionDetail, setSelectedRevisionDetail] = useState<RevisionDetailItem | null>(null);

  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [onlyChanges, setOnlyChanges] = useState<boolean>(false);
  const [collapsedBranches, setCollapsedBranches] = useState<Record<number, boolean>>({});
  const [mobileTab, setMobileTab] = useState<'versions' | 'diff'>('versions');
  const [bodyDisplayMode, setBodyDisplayMode] = useState<'visual' | 'diff'>('visual');
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  const [authorMap, setAuthorMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (Array.isArray(initialAuthors)) {
      for (const a of initialAuthors) {
        const id = a._id || (a as any).id;
        if (id && a.name) {
          map[String(id)] = String(a.name);
        }
      }
    }
    return map;
  });
  const [authorsLoaded, setAuthorsLoaded] = useState<boolean>(Boolean(initialAuthors && initialAuthors.length > 0));

  // Load site authors to display human-readable author names instead of raw MongoDB ObjectIds in diffs.
  useEffect(() => {
    if (Array.isArray(initialAuthors) && initialAuthors.length > 0) {
      const map: Record<string, string> = {};
      for (const a of initialAuthors) {
        const id = a._id || (a as any).id;
        if (id && a.name) {
          map[String(id)] = String(a.name);
        }
      }
      setAuthorMap(map);
      setAuthorsLoaded(true);
      return;
    }

    if (!isOpen || entityType !== 'blog') return;

    let cancelled = false;
    fetch('/api/admin/authors')
      .then((res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => {
        if (cancelled || !Array.isArray(data)) return;
        const map: Record<string, string> = {};
        for (const author of data) {
          const id = author?._id || author?.id;
          if (id && author?.name) {
            map[String(id)] = String(author.name);
          }
        }
        setAuthorMap(map);
        setAuthorsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setAuthorsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, entityType, currentSiteId, initialAuthors]);

  // Abort in-flight revision list requests if the drawer closes or active entity changes.
  useEffect(() => {
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;

    if (!isOpen || !entityId) {
      setRevisions([]);
      setSelectedRevisionId(null);
      setSelectedRevisionDetail(null);
      setPage(1);
      setHasMore(false);
      return;
    }

    const controller = new AbortController();
    setLoadingList(true);
    setError(null);
    setSuccessMessage(null);
    setSelectedRevisionId(null);
    setSelectedRevisionDetail(null);
    setConfirmRestoreOpen(false);
    setMobileTab('versions');
    setPage(1);
    setHasMore(false);

    fetch(`/api/admin/revisions?entityType=${entityType}&entityId=${entityId}&page=1&limit=100`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || data?.message || 'Failed to load revisions');
        }
        return res.json() as Promise<RevisionSummaryItem[]>;
      })
      .then((data) => {
        if (controller.signal.aborted || activeRequestKeyRef.current !== activeRequestKey || !isOpen) return;
        setRevisions(data);
        setHasMore(data.length === 100);
        if (data.length > 0) {
          // Select the most recent revision by default.
          setSelectedRevisionId(data[0]._id);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted && activeRequestKeyRef.current === activeRequestKey) {
          setLoadingList(false);
        }
      });

    return () => {
      controller.abort();
      loadMoreAbortRef.current?.abort();
      loadMoreAbortRef.current = null;
    };
  }, [isOpen, entityType, entityId, activeRequestKey]);

  // Fetch full snapshot payload on demand when selecting a revision.
  useEffect(() => {
    if (!selectedRevisionId) {
      setSelectedRevisionDetail(null);
      return;
    }

    const controller = new AbortController();
    setLoadingDetail(true);
    setSelectedRevisionDetail(null);
    setConfirmRestoreOpen(false);

    fetch(`/api/admin/revisions/${selectedRevisionId}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || data?.message || 'Failed to load revision detail');
        }
        return res.json() as Promise<RevisionDetailItem>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setSelectedRevisionDetail(data);
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        setError(err.message);
        setSelectedRevisionDetail(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedRevisionId]);

  async function handleConfirmRestore() {
    if (!selectedRevisionDetail || selectedRevisionDetail._id !== selectedRevisionId) return;
    setRestoring(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/revisions/${selectedRevisionDetail._id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || data?.message || 'Failed to restore revision');
      }
      const data = await res.json();
      onRestore(data.entity || selectedRevisionDetail.snapshot, selectedRevisionDetail.snapshot);
      setConfirmRestoreOpen(false);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }

  // Guarded by activeRequestKeyRef so slow responses from a previous site/entity cannot append to a new list.
  async function handleLoadMore() {
    if (loadingMore || !hasMore || !entityId) return;

    // Abort any prior pending pagination request
    loadMoreAbortRef.current?.abort();
    const controller = new AbortController();
    loadMoreAbortRef.current = controller;

    setLoadingMore(true);
    const nextPage = page + 1;
    const requestKey = activeRequestKeyRef.current;

    try {
      const res = await fetch(
        `/api/admin/revisions?entityType=${entityType}&entityId=${entityId}&page=${nextPage}&limit=100`,
        { signal: controller.signal, cache: 'no-store' }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || data?.message || 'Failed to load older revisions');
      }
      const olderRevisions = (await res.json()) as RevisionSummaryItem[];

      // Key Guard: Ensure response belongs to the currently active entity and drawer is still open
      if (controller.signal.aborted || activeRequestKeyRef.current !== requestKey || !isOpen) {
        return;
      }

      if (olderRevisions.length > 0) {
        setRevisions((prev) => {
          // Double-check active key inside state updater
          if (activeRequestKeyRef.current !== requestKey) return prev;
          const existingIds = new Set(prev.map((r) => r._id));
          const newItems = olderRevisions.filter((r) => !existingIds.has(r._id));
          return [...prev, ...newItems];
        });
        setPage(nextPage);
      }
      setHasMore(olderRevisions.length === 100);
    } catch (err: unknown) {
      if (controller.signal.aborted || (err as any)?.name === 'AbortError') return;
      if (activeRequestKeyRef.current !== requestKey) return;
      setError(err instanceof Error ? err.message : 'Failed to load older revisions');
    } finally {
      if (activeRequestKeyRef.current === requestKey && !controller.signal.aborted) {
        setLoadingMore(false);
      }
    }
  }

  // Group revisions by major release version (e.g. Group v2.x, Group v1.x) for hierarchical tree navigation.
  const groupedRevisions = useMemo(() => {
    const groups: { majorVersion: number; items: RevisionSummaryItem[] }[] = [];
    for (const rev of revisions) {
      const major = rev.majorVersion ?? 1;
      let existingGroup = groups.find((g) => g.majorVersion === major);
      if (!existingGroup) {
        existingGroup = { majorVersion: major, items: [] };
        groups.push(existingGroup);
      }
      existingGroup.items.push(rev);
    }
    return groups;
  }, [revisions]);

  // Diff Analysis Computation:
  // Compares the selected historical snapshot against the user's active editor draft in real time.
  const diffAnalysis = useMemo(() => {
    if (!selectedRevisionDetail) return null;

    const oldSnap = selectedRevisionDetail.snapshot;
    const newDraft = currentDraft;

    // Word diff for title.
    const titleDiff = computeFieldDiff(oldSnap.title, newDraft.title);

    // Word diff for excerpt/summary.
    const oldSummary = entityType === 'blog' ? oldSnap.excerpt : oldSnap.summary;
    const newSummary = entityType === 'blog' ? newDraft.excerpt : newDraft.summary;
    const summaryDiff = computeFieldDiff(oldSummary, newSummary);

    // Structured HTML to text conversion for body diff computation.
    const rawOldContent = String(oldSnap.content ?? '');
    const rawNewContent = String(newDraft.content ?? '');
    const oldContentStructured = htmlToStructuredText(rawOldContent);
    const newContentStructured = htmlToStructuredText(rawNewContent);
    const contentDiff = computeFieldDiff(oldContentStructured, newContentStructured);

    // Entity-specific metadata comparisons with exhaustive field coverage.
    const metaFields: { label: string; diff: FieldDiffResult; type?: 'tags' | 'multiline' | 'text' }[] = [];

    if (entityType === 'event') {
      const tz = String(newDraft.timeZone || oldSnap.timeZone || 'UTC');

      metaFields.push({ label: 'Format', diff: computeFieldDiff(oldSnap.format, newDraft.format) });
      metaFields.push({ label: 'Location', diff: computeFieldDiff(oldSnap.location, newDraft.location) });
      metaFields.push({ label: 'Time Zone', diff: computeFieldDiff(oldSnap.timeZone, newDraft.timeZone) });
      metaFields.push({
        label: 'Start Time',
        diff: computeDateTimeDiff(oldSnap.startAt, newDraft.startAt, tz),
      });
      metaFields.push({
        label: 'End Time',
        diff: computeDateTimeDiff(oldSnap.endAt, newDraft.endAt, tz),
      });
      metaFields.push({
        label: 'Ticket Type',
        diff: computeFieldDiff(oldSnap.ticketPriceType, newDraft.ticketPriceType),
      });

      const formatTicketPrice = (snap: Record<string, unknown>) => {
        if (snap.ticketPriceType === 'free') return 'Free';
        const amt = snap.ticketPriceAmount !== undefined && snap.ticketPriceAmount !== '' ? String(snap.ticketPriceAmount) : '';
        const curr = snap.ticketPriceCurrency ? String(snap.ticketPriceCurrency) : '';
        if (!amt) return '';
        return curr ? `${amt} ${curr}` : amt;
      };
      metaFields.push({
        label: 'Ticket Price',
        diff: computeFieldDiff(formatTicketPrice(oldSnap), formatTicketPrice(newDraft)),
      });

      metaFields.push({
        label: 'Meeting URL',
        diff: computeFieldDiff(
          oldSnap.onlineUrl || oldSnap.onlineMeetingUrl,
          newDraft.onlineUrl || newDraft.onlineMeetingUrl,
        ),
      });
      metaFields.push({
        label: 'Registration URL',
        diff: computeFieldDiff(oldSnap.registrationUrl, newDraft.registrationUrl),
      });
      metaFields.push({
        label: 'Organizer',
        diff: computeFieldDiff(oldSnap.organizer, newDraft.organizer),
      });
      metaFields.push({
        label: 'Speakers',
        diff: computeFieldDiff(oldSnap.speakers, newDraft.speakers),
      });
      metaFields.push({
        label: 'Slug',
        diff: computeFieldDiff(oldSnap.slug, newDraft.slug),
      });
      metaFields.push({
        label: 'Cover Image URL',
        diff: computeFieldDiff(oldSnap.imageUrl, newDraft.imageUrl),
      });
      metaFields.push({
        label: 'Cover Image Alt',
        diff: computeFieldDiff(oldSnap.imageAlt, newDraft.imageAlt),
      });
      metaFields.push({
        label: 'SEO Meta Title',
        diff: computeFieldDiff(oldSnap.metaTitle, newDraft.metaTitle),
      });
      metaFields.push({
        label: 'SEO Description',
        diff: computeFieldDiff(oldSnap.metaDescription, newDraft.metaDescription),
      });
    } else {
      // Blog Entity Comparisons
      const extractTagList = (snap: Record<string, unknown> | undefined): string[] => {
        if (!snap) return [];
        if (Array.isArray(snap.tags) && snap.tags.length > 0) {
          return snap.tags.map(String).filter(Boolean);
        }
        if (snap.tag) return [String(snap.tag)];
        if (snap.category) return [String(snap.category)];
        return [];
      };

      const oldTagsList = extractTagList(oldSnap);
      const newTagsList = extractTagList(newDraft);

      metaFields.push({
        label: 'Category / Tags',
        type: 'tags',
        diff: computeFieldDiff(oldTagsList.join(', '), newTagsList.join(', ')),
      });
      const formatAuthor = (val: unknown) => {
        if (!val) return 'Site publisher (default)';
        if (typeof val === 'object' && val !== null && 'name' in (val as any)) {
          return String((val as any).name);
        }
        const strVal = String(val);
        if (authorMap[strVal]) {
          return authorMap[strVal];
        }
        if (authorsLoaded && /^[0-9a-fA-F]{24}$/.test(strVal)) {
          return `Deleted Author (${strVal.slice(-6)})`;
        }
        return strVal;
      };
      metaFields.push({
        label: 'Author',
        diff: computeFieldDiff(formatAuthor(oldSnap.authorId), formatAuthor(newDraft.authorId)),
      });
      metaFields.push({
        label: 'Slug',
        diff: computeFieldDiff(oldSnap.slug, newDraft.slug),
      });
      metaFields.push({
        label: 'Featured Post',
        diff: computeFieldDiff(oldSnap.isFeatured ? 'Yes' : 'No', newDraft.isFeatured ? 'Yes' : 'No'),
      });
      metaFields.push({
        label: 'SEO Meta Title',
        diff: computeFieldDiff(oldSnap.metaTitle, newDraft.metaTitle),
      });
      metaFields.push({
        label: 'SEO Description',
        diff: computeFieldDiff(oldSnap.metaDescription, newDraft.metaDescription),
      });
      metaFields.push({
        label: 'SEO Keywords',
        diff: computeFieldDiff(oldSnap.keywords, newDraft.keywords),
      });
      metaFields.push({
        label: 'Cover Image URL',
        diff: computeFieldDiff(oldSnap.imageUrl, newDraft.imageUrl),
      });
      metaFields.push({
        label: 'Cover Image Alt',
        diff: computeFieldDiff(oldSnap.imageAlt, newDraft.imageAlt),
      });

      const formatList = (val: unknown) => {
        if (!Array.isArray(val) || val.length === 0) return '';
        return val.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
      };
      metaFields.push({
        label: 'Key Takeaways',
        type: 'multiline',
        diff: computeFieldDiff(formatList(oldSnap.keyTakeaways), formatList(newDraft.keyTakeaways)),
      });

      const formatFaqs = (val: unknown) => {
        if (!Array.isArray(val) || val.length === 0) return '';
        return val
          .map((f: any, idx: number) => `Q${idx + 1}: ${f.question || ''}\nA: ${f.answer || ''}`)
          .join('\n\n');
      };
      metaFields.push({
        label: 'FAQs',
        type: 'multiline',
        diff: computeFieldDiff(formatFaqs(oldSnap.faqs), formatFaqs(newDraft.faqs)),
      });

      const formatRelated = (val: unknown) => {
        if (!Array.isArray(val) || val.length === 0) return '';
        return val.join(', ');
      };
      metaFields.push({
        label: 'Related Posts',
        diff: computeFieldDiff(formatRelated(oldSnap.relatedSlugs), formatRelated(newDraft.relatedSlugs)),
      });

      const formatToc = (val: unknown) => {
        if (!Array.isArray(val) || val.length === 0) return '';
        return val
          .map((item: any) => {
            const parts = [];
            if (item.id) parts.push(`Section: ${item.id}`);
            if (item.label) parts.push(`Label: "${item.label}"`);
            if (item.hidden) parts.push(`(Hidden)`);
            return parts.join(' - ');
          })
          .join('\n');
      };
      metaFields.push({
        label: 'Table of Contents Overrides',
        type: 'multiline',
        diff: computeFieldDiff(formatToc(oldSnap.tocOverrides), formatToc(newDraft.tocOverrides)),
      });
    }

    // Tally aggregate metrics across all tracked fields.
    let totalAdditions = titleDiff.additions + summaryDiff.additions + contentDiff.additions;
    let totalDeletions = titleDiff.deletions + summaryDiff.deletions + contentDiff.deletions;
    let changedFieldCount = (titleDiff.isChanged ? 1 : 0) + (summaryDiff.isChanged ? 1 : 0) + (contentDiff.isChanged ? 1 : 0);

    for (const m of metaFields) {
      if (m.diff.isChanged) {
        changedFieldCount++;
        totalAdditions += m.diff.additions;
        totalDeletions += m.diff.deletions;
      }
    }

    return {
      titleDiff,
      summaryDiff,
      contentDiff,
      rawOldContent,
      rawNewContent,
      metaFields,
      totalAdditions,
      totalDeletions,
      changedFieldCount,
    };
  }, [selectedRevisionDetail, currentDraft, entityType, authorMap, authorsLoaded]);

  function toggleBranchCollapse(major: number) {
    setCollapsedBranches((prev) => ({ ...prev, [major]: !prev[major] }));
  }

  function handleSelectRevision(id: string) {
    setSelectedRevisionId(id);
    setMobileTab('diff');
  }

  function renderSideTokens(tokens: DiffToken[], side: 'left' | 'right') {
    return (
      <div className="leading-relaxed break-words">
        {tokens.map((token, i) => {
          if (side === 'left') {
            if (token.type === 'removed') {
              return (
                <span
                  key={i}
                  className="bg-rose-100 text-rose-800 line-through decoration-rose-400 px-0.5 rounded"
                >
                  {token.text}
                </span>
              );
            }
            if (token.type === 'unchanged') {
              return <span key={i}>{token.text}</span>;
            }
            return null;
          } else {
            if (token.type === 'added') {
              return (
                <span key={i} className="bg-emerald-100 text-emerald-800 font-medium px-0.5 rounded">
                  {token.text}
                </span>
              );
            }
            if (token.type === 'unchanged') {
              return <span key={i}>{token.text}</span>;
            }
            return null;
          }
        })}
      </div>
    );
  }

  function renderUnifiedTokens(tokens: DiffToken[]) {
    return (
      <div className="leading-relaxed break-words">
        {tokens.map((token, i) => {
          if (token.type === 'added') {
            return (
              <span key={i} className="bg-emerald-100 text-emerald-800 font-medium px-0.5 rounded">
                {token.text}
              </span>
            );
          }
          if (token.type === 'removed') {
            return (
              <span
                key={i}
                className="bg-rose-100 text-rose-800 line-through decoration-rose-400 px-0.5 rounded opacity-80"
              >
                {token.text}
              </span>
            );
          }
          return <span key={i}>{token.text}</span>;
        })}
      </div>
    );
  }

  // Helper to render metadata values cleanly without truncation.
  function renderMetaValue(
    item: { label: string; diff: FieldDiffResult; type?: 'tags' | 'multiline' | 'text' },
    side: 'left' | 'right',
  ) {
    const isLeft = side === 'left';
    const value = isLeft ? item.diff.oldValue : item.diff.newValue;

    if (!value) {
      return <span className="text-stone-300">—</span>;
    }

    // Custom Tag Badge renderer: renders distinct, wrapping chip badges with diff highlights
    if (item.type === 'tags') {
      const tags = value.split(',').map((t) => t.trim()).filter(Boolean);
      if (tags.length === 0) return <span className="text-stone-300">—</span>;

      const otherValue = isLeft ? item.diff.newValue : item.diff.oldValue;
      const otherTags = otherValue ? otherValue.split(',').map((t) => t.trim()).filter(Boolean) : [];

      return (
        <div className="flex flex-wrap gap-1.5 py-0.5">
          {tags.map((tag, idx) => {
            const isAddedInRight = !isLeft && item.diff.isChanged && !otherTags.includes(tag);
            const isRemovedInLeft = isLeft && item.diff.isChanged && !otherTags.includes(tag);

            let badgeClass = 'bg-stone-100 text-stone-700 border-stone-200';
            if (isAddedInRight) {
              badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
            } else if (isRemovedInLeft) {
              badgeClass = 'bg-rose-50 text-rose-800 border-rose-300 line-through';
            }

            return (
              <span
                key={`${tag}-${idx}`}
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border shadow-2xs ${badgeClass}`}
              >
                {isAddedInRight ? `+ ${tag}` : isRemovedInLeft ? `- ${tag}` : tag}
              </span>
            );
          })}
        </div>
      );
    }

    // Multiline renderer (Key Takeaways, FAQs)
    if (item.type === 'multiline') {
      return (
        <div className="whitespace-pre-line font-mono text-[11px] leading-relaxed break-words py-0.5">
          {item.diff.isChanged ? renderSideTokens(item.diff.tokens, side) : value}
        </div>
      );
    }

    // Standard field: render word diff tokens if changed, or plain text if unchanged
    if (item.diff.isChanged) {
      return (
        <div className="break-words whitespace-normal text-xs font-medium leading-relaxed py-0.5">
          {renderSideTokens(item.diff.tokens, side)}
        </div>
      );
    }

    return (
      <div className="break-words whitespace-normal text-xs text-stone-600 leading-relaxed py-0.5">
        {value}
      </div>
    );
  }

  // Guard: Return null if drawer is not toggled open.
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Drawer Container: Responsive full-width sheet on mobile, wide max-w-7xl/94vw on desktop, full viewport height (100dvh), or 100vw when maximized. */}
      <div
        className={`w-full bg-white shadow-2xl flex flex-col h-full h-[100dvh] overflow-hidden transition-all duration-200 ${
          isMaximized
            ? 'max-w-full'
            : 'sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[94vw]'
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 sm:px-6 sm:py-3.5 shrink-0 bg-white">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base md:text-lg font-semibold text-stone-900">
                Revision History & Comparison
              </h2>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 shrink-0">
                {revisions.length} {revisions.length === 1 ? 'version' : 'versions'}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-stone-500 mt-0.5 line-clamp-1 sm:line-clamp-none">
              Track draft iterations, compare changes against your current editor draft, and restore previous states
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Fullscreen / Maximize Toggle */}
            <button
              type="button"
              onClick={() => setIsMaximized((prev) => !prev)}
              className="rounded-xl px-2.5 py-1.5 text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title={isMaximized ? 'Restore standard width' : 'Maximize drawer to full screen width'}
              aria-label={isMaximized ? 'Restore standard width' : 'Maximize drawer to full screen width'}
            >
              <span className="text-sm">{isMaximized ? '🗗' : '⛶'}</span>
              <span className="hidden sm:inline">{isMaximized ? 'Standard' : 'Fullscreen'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700 shrink-0 min-w-[38px] min-h-[38px] flex items-center justify-center transition-colors"
              aria-label="Close revisions drawer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher (Visible only on screens < md) */}
        <div className="flex md:hidden border-b border-stone-200 bg-stone-100/90 px-3 py-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('versions')}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg text-center transition-colors ${
              mobileTab === 'versions'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Versions ({revisions.length})
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('diff')}
            disabled={!selectedRevisionId}
            className={`flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg text-center transition-colors disabled:opacity-40 ${
              mobileTab === 'diff'
                ? 'bg-white text-stone-900 shadow-xs border border-stone-200'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Diff & Details {selectedRevisionDetail ? `(v${selectedRevisionDetail.version})` : ''}
          </button>
        </div>

        {/* Alert Notification Banners */}
        {error && (
          <div role="alert" className="bg-rose-50 px-4 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm text-rose-700 border-b border-rose-200 flex items-center justify-between shrink-0">
            <span className="break-words">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-semibold ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div role="status" className="bg-emerald-50 px-4 py-2.5 sm:px-6 sm:py-3 text-xs sm:text-sm text-emerald-800 border-b border-emerald-200 flex items-center justify-between shrink-0">
            <span className="break-words">{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold ml-4 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Content Area: Sidebar on left (md:w-72/80) + Diff Comparison panel on right (flex-1) */}
        <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
          {/* Left Panel: Version Release History Tree */}
          <div
            className={`w-full border-r border-stone-200 overflow-y-auto bg-stone-50/70 p-3 space-y-3 shrink-0 ${
              isSidebarCollapsed
                ? 'hidden'
                : `${mobileTab === 'versions' ? 'block flex-1 md:flex-initial' : 'hidden'} md:block md:w-72 lg:w-80`
            }`}
          >
            {/* Versioning Logic Guide */}
            <div className="rounded-lg bg-orange-50/80 border border-orange-200/70 p-2.5 text-[11px] text-stone-600">
              <div className="font-semibold text-orange-900 flex items-center gap-1">
                <span>Version Guide</span>
              </div>
              <div className="mt-1 text-[10.5px] text-stone-600 space-y-0.5">
                <p><strong className="text-stone-800">v1.0, v2.0:</strong> Published or restored milestones</p>
                <p><strong className="text-stone-800">v1.1, v1.2:</strong> Draft saves while editing</p>
              </div>
            </div>

            <div className="px-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Version Releases
              </span>
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(true)}
                className="hidden md:inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 hover:text-stone-800 px-2 py-0.5 rounded hover:bg-stone-200 transition-colors"
                title="Hide sidebar to maximize comparison area"
              >
                <span>⇤</span>
                <span>Hide</span>
              </button>
            </div>

            {loadingList ? (
              <p className="p-4 text-xs text-stone-500">Loading versions...</p>
            ) : revisions.length === 0 ? (
              <p className="p-4 text-xs text-stone-500">No revisions found. Save changes to begin tracking.</p>
            ) : (
              <div className="space-y-3 pb-8 md:pb-0">
                {groupedRevisions.map((group) => {
                  const isCollapsed = Boolean(collapsedBranches[group.majorVersion]);
                  const hasPublished = group.items.some((i) => i.trigger === 'publish');
                  const hasRestored = group.items.some((i) => i.trigger === 'restore');

                  const groupLabel = hasPublished
                    ? `Release v${group.majorVersion}.x (Published)`
                    : hasRestored
                      ? `Release v${group.majorVersion}.x (Restored · Draft)`
                      : `Version ${group.majorVersion}.x (Drafting)`;

                  return (
                    <div key={group.majorVersion} className="rounded-xl border border-stone-200/80 bg-white overflow-hidden shadow-xs">
                      {/* Collapsible Release Branch Header */}
                      <button
                        type="button"
                        onClick={() => toggleBranchCollapse(group.majorVersion)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-stone-100/80 hover:bg-stone-200/60 text-left border-b border-stone-200/60 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 pr-1">
                          <span className="text-stone-400 text-xs font-mono shrink-0">
                            {isCollapsed ? '▶' : '▼'}
                          </span>
                          <span className="text-xs font-bold text-stone-800 truncate">
                            {groupLabel}
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold text-stone-500 bg-stone-200 px-1.5 py-0.5 rounded shrink-0">
                          {group.items.length} {group.items.length === 1 ? 'save' : 'saves'}
                        </span>
                      </button>

                      {/* Version Revision Cards within this Release Group */}
                      {!isCollapsed && (
                        <div className="p-1.5 space-y-1">
                          {group.items.map((rev) => {
                            const isSelected = rev._id === selectedRevisionId;
                            const date = new Date(rev.createdAt);

                            // Trigger status badge
                            const triggerBadge =
                              rev.trigger === 'publish' ? (
                                <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                                  Published
                                </span>
                              ) : rev.trigger === 'restore' ? (
                                <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                  Restored · Draft
                                </span>
                              ) : rev.trigger === 'unpublish' ? (
                                <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200">
                                  Unpublished · Draft
                                </span>
                              ) : rev.trigger === 'create' ? (
                                <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800">
                                  Initial
                                </span>
                              ) : (
                                <span className="rounded-md px-1 py-0.2 text-[9px] font-medium text-stone-400 bg-stone-100">
                                  Draft
                                </span>
                              );

                            return (
                              <div
                                key={rev._id}
                                className={`group relative rounded-lg p-2.5 text-xs transition-colors border ${
                                  isSelected
                                    ? 'bg-orange-600 text-white shadow-sm border-orange-600'
                                    : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-200/60'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSelectRevision(rev._id)}
                                  className="w-full text-left"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="font-bold font-mono text-xs">
                                        v{rev.version}
                                      </span>
                                      {triggerBadge}
                                    </div>
                                    <span className={`text-[10px] ${isSelected ? 'text-orange-200' : 'text-stone-400'}`}>
                                      {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>

                                  {rev.restoredFromVersion && (
                                    <div className={`mt-1 flex items-center gap-1 text-[10px] font-medium ${isSelected ? 'text-orange-100' : 'text-amber-700'}`}>
                                      <span>⤾ Restored from v{rev.restoredFromVersion}</span>
                                    </div>
                                  )}

                                  <div className="mt-1 truncate font-medium">
                                    {rev.author.name}
                                  </div>
                                  <div className="mt-0.5 flex items-center justify-between">
                                    <span className={`truncate text-[10px] ${isSelected ? 'text-orange-100' : 'text-stone-500'}`}>
                                      {rev.summary || date.toLocaleDateString()}
                                    </span>
                                    <span className={`md:hidden text-[10px] font-medium ml-1 shrink-0 ${isSelected ? 'text-orange-100' : 'text-orange-600'}`}>
                                      Compare →
                                    </span>
                                  </div>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {hasMore && (
                  <div className="pt-2 pb-2">
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="w-full py-2.5 px-3 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 border border-stone-300 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      {loadingMore ? (
                        <span>Loading older versions...</span>
                      ) : (
                        <span>Load older versions ({revisions.length} loaded) ↓</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Diff Comparison & Restoration View */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6 ${
              mobileTab === 'diff' ? 'block' : 'hidden md:block'
            }`}
          >
            {/* Collapsed Sidebar Restore Bar (Desktop) */}
            {isSidebarCollapsed && (
              <div className="hidden md:flex items-center justify-between pb-3 border-b border-stone-200 animate-in fade-in duration-150">
                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 border border-stone-300 px-3 py-1.5 rounded-lg transition-colors shadow-2xs"
                  title="Show versions list sidebar"
                >
                  <span>⇥</span>
                  <span>Show Versions ({revisions.length})</span>
                </button>

                {revisions.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500 font-medium">Selected Version:</span>
                    <select
                      value={selectedRevisionId || ''}
                      onChange={(e) => setSelectedRevisionId(e.target.value)}
                      className="text-xs font-mono font-bold bg-white border border-stone-300 rounded-lg px-2.5 py-1 text-stone-800 shadow-2xs"
                    >
                      {revisions.map((r) => (
                        <option key={r._id} value={r._id}>
                          v{r.version} {r.trigger ? `(${r.trigger})` : ''} — {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Quick Navigation on Mobile */}
            <div className="md:hidden flex items-center justify-between pb-2 border-b border-stone-200">
              <button
                type="button"
                onClick={() => setMobileTab('versions')}
                className="flex items-center gap-1 text-xs font-semibold text-stone-700 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <span>←</span>
                <span>All Versions ({revisions.length})</span>
              </button>

              {revisions.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-stone-500">Compare:</span>
                  <select
                    value={selectedRevisionId || ''}
                    onChange={(e) => setSelectedRevisionId(e.target.value)}
                    className="text-xs font-mono font-bold bg-stone-100 border border-stone-300 rounded-lg px-2 py-1 text-stone-800"
                  >
                    {revisions.map((r) => (
                      <option key={r._id} value={r._id}>
                        v{r.version} {r.trigger ? `(${r.trigger})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {loadingDetail ? (
              <p className="text-sm text-stone-500">Loading version details...</p>
            ) : selectedRevisionDetail && diffAnalysis ? (
              <div>
                {/* Revision Header Details & Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-4 border-b border-stone-200">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-md bg-stone-100 border border-stone-200 px-2 py-0.5 text-xs font-mono font-bold text-stone-800">
                        v{selectedRevisionDetail.version}
                      </span>
                      {selectedRevisionDetail.trigger === 'restore' && (
                        <span className="rounded-md bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                          Restored · Draft
                        </span>
                      )}
                      {selectedRevisionDetail.trigger === 'publish' && (
                        <span className="rounded-md bg-emerald-100 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                          Published
                        </span>
                      )}
                      {selectedRevisionDetail.trigger === 'unpublish' && (
                        <span className="rounded-md bg-purple-100 border border-purple-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-900">
                          Unpublished · Draft
                        </span>
                      )}
                      <span className="text-xs text-stone-400">➔</span>
                      <span className="rounded-md bg-orange-100 border border-orange-200 px-2 py-0.5 text-xs font-semibold text-orange-800">
                        Current Editor Draft
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1 break-words">
                      Recorded on {new Date(selectedRevisionDetail.createdAt).toLocaleString()} by {selectedRevisionDetail.author.name} ({selectedRevisionDetail.author.email})
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {diffAnalysis.changedFieldCount === 0 ? (
                      <span
                        className="w-full sm:w-auto rounded-xl bg-stone-100 border border-stone-200 px-3.5 py-2 text-xs font-semibold text-stone-500 text-center min-h-[38px] flex items-center justify-center cursor-default select-none"
                        title="The current editor draft is already identical to this version."
                      >
                        Current Draft (Identical)
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={restoring || loadingDetail || !selectedRevisionDetail || selectedRevisionDetail._id !== selectedRevisionId}
                        onClick={() => setConfirmRestoreOpen(true)}
                        className="w-full sm:w-auto rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-50 transition-colors text-center min-h-[38px] flex items-center justify-center"
                      >
                        {restoring ? 'Restoring...' : `Restore v${selectedRevisionDetail.version} as Draft`}
                      </button>
                    )}
                  </div>
                </div>

                {/* In-Drawer Restore Confirmation Warning Banner */}
                {confirmRestoreOpen && selectedRevisionDetail && selectedRevisionDetail._id === selectedRevisionId && (
                  <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 sm:p-4 animate-in fade-in duration-150">
                    <h4 className="text-sm font-semibold text-amber-900">
                      Restore Version {selectedRevisionDetail.version} as draft?
                    </h4>
                    <p className="mt-1 text-xs text-amber-700 leading-relaxed">
                      This action restores the content from Version {selectedRevisionDetail.version} into your editor as an unpublished draft. It will not be published live until you explicitly click Publish.
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmRestoreOpen(false)}
                        className="flex-1 sm:flex-initial rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 text-center min-h-[36px]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={restoring}
                        onClick={handleConfirmRestore}
                        className="flex-1 sm:flex-initial rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-50 text-center min-h-[36px]"
                      >
                        {restoring ? 'Restoring...' : `Restore as Draft`}
                      </button>
                    </div>
                  </div>
                )}

                {/* Diff Stats Toolbar & Comparison Controls */}
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl bg-stone-50 p-3 border border-stone-200 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    <span className="font-semibold text-stone-700">Diff Stats:</span>
                    <span className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 font-bold font-mono text-[11px]">
                      +{diffAnalysis.totalAdditions} added
                    </span>
                    <span className="rounded-md bg-rose-100 text-rose-800 px-2 py-0.5 font-bold font-mono text-[11px]">
                      -{diffAnalysis.totalDeletions} removed
                    </span>
                    <span className="rounded-md bg-stone-200 text-stone-700 px-2 py-0.5 font-semibold text-[11px]">
                      {diffAnalysis.changedFieldCount} {diffAnalysis.changedFieldCount === 1 ? 'field' : 'fields'} modified
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                    <label className="flex items-center gap-1.5 text-stone-600 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={onlyChanges}
                        onChange={(e) => setOnlyChanges(e.target.checked)}
                        className="rounded border-stone-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="text-[11px] font-medium">Only modified fields</span>
                    </label>

                    {/* Side-by-Side vs. Unified Diff Mode Switcher */}
                    <div className="flex rounded-lg bg-stone-200 p-0.5 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setViewMode('split')}
                        className={`rounded px-2.5 py-1 transition-colors ${
                          viewMode === 'split' ? 'bg-white font-bold text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Side-by-Side
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('unified')}
                        className={`rounded px-2.5 py-1 transition-colors ${
                          viewMode === 'unified' ? 'bg-white font-bold text-stone-900 shadow-xs' : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Unified
                      </button>
                    </div>
                  </div>
                </div>

                {/* Zero differences indicator */}
                {diffAnalysis.changedFieldCount === 0 && (
                  <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-4 text-xs text-stone-600">
                    <span className="font-semibold text-stone-800">No differences:</span> The current editor draft is identical to Version {selectedRevisionDetail.version}.
                  </div>
                )}

                {/* Diff Comparison Sections */}
                <div className="mt-6 space-y-6 pb-8 md:pb-0">
                  {/* Title Diff */}
                  {(!onlyChanges || diffAnalysis.titleDiff.isChanged) && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Title</h4>
                        {diffAnalysis.titleDiff.isChanged && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                            Modified
                          </span>
                        )}
                      </div>

                      {viewMode === 'split' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
                          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 font-medium">
                            <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">
                              Past Version (v{selectedRevisionDetail.version})
                            </span>
                            {renderSideTokens(diffAnalysis.titleDiff.tokens, 'left')}
                          </div>
                          <div className="rounded-xl border border-orange-200 bg-orange-50/20 p-3 font-medium">
                            <span className="text-[10px] uppercase font-bold text-orange-600 block mb-1">
                              Current Editor Draft
                            </span>
                            {renderSideTokens(diffAnalysis.titleDiff.tokens, 'right')}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs">
                          {renderUnifiedTokens(diffAnalysis.titleDiff.tokens)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Excerpt / Summary Diff */}
                  {(!onlyChanges || diffAnalysis.summaryDiff.isChanged) && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                          {entityType === 'blog' ? 'Excerpt' : 'Summary'}
                        </h4>
                        {diffAnalysis.summaryDiff.isChanged && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                            Modified
                          </span>
                        )}
                      </div>

                      {viewMode === 'split' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs">
                          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                            <span className="text-[10px] uppercase font-bold text-stone-400 block mb-1">
                              Past Version (v{selectedRevisionDetail.version})
                            </span>
                            {renderSideTokens(diffAnalysis.summaryDiff.tokens, 'left')}
                          </div>
                          <div className="rounded-xl border border-orange-200 bg-orange-50/20 p-3">
                            <span className="text-[10px] uppercase font-bold text-orange-600 block mb-1">
                              Current Editor Draft
                            </span>
                            {renderSideTokens(diffAnalysis.summaryDiff.tokens, 'right')}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 text-xs">
                          {renderUnifiedTokens(diffAnalysis.summaryDiff.tokens)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Metadata & Settings Comparison Table */}
                  {(!onlyChanges || diffAnalysis.metaFields.some((m) => m.diff.isChanged)) && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                          Metadata & Settings
                        </h4>
                        <span className="text-[10px] text-stone-400">
                          {diffAnalysis.metaFields.filter((m) => m.diff.isChanged).length} modified
                        </span>
                      </div>

                      <div className="rounded-xl border border-stone-200 overflow-x-auto text-xs bg-white shadow-2xs">
                        <table className="min-w-full divide-y divide-stone-200">
                          <thead className="bg-stone-50/90 text-stone-500 font-semibold text-[11px] uppercase tracking-wider">
                            <tr>
                              <th className="px-3.5 py-2.5 text-left w-1/4 sm:w-1/5">Field</th>
                              <th className="px-3.5 py-2.5 text-left w-[35%] sm:w-[37%]">v{selectedRevisionDetail.version}</th>
                              <th className="px-3.5 py-2.5 text-left w-[35%] sm:w-[37%]">Current Editor Draft</th>
                              <th className="px-3.5 py-2.5 text-right w-[5%] sm:w-[6%]">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100 bg-white">
                            {diffAnalysis.metaFields
                              .filter((m) => !onlyChanges || m.diff.isChanged)
                              .map((m) => (
                                <tr
                                  key={m.label}
                                  className={`transition-colors hover:bg-stone-50/60 ${
                                    m.diff.isChanged ? 'bg-amber-50/25' : ''
                                  }`}
                                >
                                  <td className="px-3.5 py-2.5 font-medium text-stone-800 align-top">
                                    {m.label}
                                  </td>
                                  <td className="px-3.5 py-2.5 align-top">
                                    {renderMetaValue(m, 'left')}
                                  </td>
                                  <td className="px-3.5 py-2.5 align-top">
                                    {renderMetaValue(m, 'right')}
                                  </td>
                                  <td className="px-3.5 py-2.5 text-right whitespace-nowrap align-top">
                                    {m.diff.isChanged ? (
                                      <span className="rounded-md bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                        Changed
                                      </span>
                                    ) : (
                                      <span className="text-stone-300 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Body Content Comparison (Visual Canvas & Track Changes) */}
                  {(!onlyChanges || diffAnalysis.contentDiff.isChanged) && (
                    <div>
                      {/* Embedded scoped styles for Visual Canvas matching the live Quill editing surface */}
                      <style dangerouslySetInnerHTML={{ __html: `
                        .revision-visual-canvas {
                          font-family: inherit;
                          font-size: 14px;
                          line-height: 1.6;
                          color: #242424;
                        }
                        .revision-visual-canvas table {
                          width: 100% !important;
                          border-collapse: collapse !important;
                          margin: 1.25rem 0 !important;
                          border: 1px solid rgba(0, 0, 0, 0.08) !important;
                          font-size: 13.5px !important;
                          border-radius: 0.5rem !important;
                        }
                        .revision-visual-canvas table td,
                        .revision-visual-canvas table th {
                          border: 1px solid rgba(0, 0, 0, 0.07) !important;
                          padding: 0.6rem 0.9rem !important;
                          color: #4b4b4b !important;
                          vertical-align: top !important;
                        }
                        .revision-visual-canvas table tr:first-child td,
                        .revision-visual-canvas table tr:first-child th {
                          font-weight: 600 !important;
                          color: #1a1a1a !important;
                          background: #fafaf9 !important;
                          border-bottom: 2px solid rgba(0, 0, 0, 0.1) !important;
                        }
                        .revision-visual-canvas table tr:not(:first-child):nth-child(even) td {
                          background: #fbf7f1 !important;
                        }
                        .revision-visual-canvas table tr:not(:first-child) td:first-child {
                          font-weight: 600 !important;
                          color: #1a1a1a !important;
                        }
                        .revision-visual-canvas pre,
                        .revision-visual-canvas .ql-code-block-container,
                        .revision-visual-canvas .ql-code-block {
                          background-color: #1e1e1e !important;
                          color: #f8f8f2 !important;
                          border-radius: 0.5rem !important;
                          padding: 0.85rem 1.1rem !important;
                          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
                          font-size: 12.5px !important;
                          line-height: 1.55 !important;
                          margin: 1.25rem 0 !important;
                          overflow-x: auto !important;
                          white-space: pre !important;
                        }
                        .revision-visual-canvas h1 { font-size: 1.4rem !important; font-weight: 700 !important; margin: 1rem 0 0.5rem !important; color: #1a1a1a !important; }
                        .revision-visual-canvas h2 { font-size: 1.2rem !important; font-weight: 600 !important; margin: 1rem 0 0.5rem !important; color: #1a1a1a !important; }
                        .revision-visual-canvas h3 { font-size: 1.05rem !important; font-weight: 600 !important; margin: 0.85rem 0 0.4rem !important; color: #1a1a1a !important; }
                        .revision-visual-canvas p { margin: 0.65rem 0 !important; line-height: 1.6 !important; }
                        .revision-visual-canvas .blog-graphic-view { margin: 1.25rem 0 !important; }
                        .revision-visual-canvas .blog-graphic__stats {
                          display: grid !important;
                          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) !important;
                          gap: 1rem !important;
                        }
                        .revision-visual-canvas .blog-graphic__stat {
                          background: #fff !important;
                          border: 1px solid rgba(0, 0, 0, 0.08) !important;
                          border-radius: 0.85rem !important;
                          padding: 1.25rem 1rem !important;
                          text-align: center !important;
                          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
                        }
                        .revision-visual-canvas .blog-graphic__num {
                          font-size: 2rem !important;
                          font-weight: 800 !important;
                          color: #1a1a1a !important;
                          line-height: 1 !important;
                        }
                        .revision-visual-canvas .blog-graphic__label {
                          margin-top: 0.5rem !important;
                          font-size: 0.9rem !important;
                          font-weight: 600 !important;
                          color: #1a1a1a !important;
                        }
                        .revision-visual-canvas .blog-graphic__bar {
                          width: 48px !important;
                          height: 4px !important;
                          border-radius: 2px !important;
                          margin: 0.75rem auto 0 !important;
                        }
                        .revision-visual-canvas .blog-graphic__caption {
                          margin: 0.65rem 0 0 !important;
                          font-size: 0.8rem !important;
                          color: #6b6b6b !important;
                        }
                        .revision-visual-canvas .blog-graphic__callout {
                          border-left: 4px solid var(--accent, #ff751f) !important;
                          background: #fbf7f1 !important;
                          border-radius: 0 0.75rem 0.75rem 0 !important;
                          padding: 1.1rem 1.35rem !important;
                          margin: 1.25rem 0 !important;
                        }
                        .revision-visual-canvas .blog-graphic__eyebrow {
                          font-size: 10.5px !important;
                          font-weight: 700 !important;
                          letter-spacing: 0.08em !important;
                          text-transform: uppercase !important;
                          color: var(--accent, #ff751f) !important;
                          margin-bottom: 0.35rem !important;
                        }
                        .revision-visual-canvas .blog-graphic__callout-text {
                          margin: 0 !important;
                          font-size: 1rem !important;
                          line-height: 1.55 !important;
                          color: #1a1a1a !important;
                        }
                        .revision-visual-canvas .blog-graphic__comparison {
                          display: grid !important;
                          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) !important;
                          gap: 1rem !important;
                          margin: 1.25rem 0 !important;
                        }
                        .revision-visual-canvas .blog-graphic__col {
                          background: #fff !important;
                          border: 1px solid rgba(0, 0, 0, 0.08) !important;
                          border-top: 3px solid var(--accent, #ff751f) !important;
                          border-radius: 0.75rem !important;
                          padding: 1.1rem !important;
                        }
                        .revision-visual-canvas .blog-graphic__col-heading {
                          font-weight: 600 !important;
                          font-size: 0.95rem !important;
                          color: #1a1a1a !important;
                          margin-bottom: 0.5rem !important;
                        }
                        .revision-visual-canvas .blog-graphic__col-points {
                          list-style: none !important;
                          padding: 0 !important;
                          margin: 0 !important;
                        }
                        .revision-visual-canvas .blog-graphic__col-points li {
                          position: relative !important;
                          padding: 0.25rem 0 0.25rem 1.2rem !important;
                          color: #4b4b4b !important;
                          font-size: 0.85rem !important;
                        }
                        .revision-visual-canvas .blog-graphic__col-points li::before {
                          content: '✓' !important;
                          position: absolute !important;
                          left: 0 !important;
                          color: var(--accent, #ff751f) !important;
                          font-weight: 700 !important;
                        }
                      `}} />

                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                            Body Content
                          </h4>
                          {diffAnalysis.contentDiff.isChanged && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                              Modified (+{diffAnalysis.contentDiff.additions} / -{diffAnalysis.contentDiff.deletions})
                            </span>
                          )}
                        </div>

                        {/* Display Mode Pill Switcher */}
                        <div className="flex rounded-lg bg-stone-200 p-0.5 text-[11px] font-medium">
                          <button
                            type="button"
                            onClick={() => setBodyDisplayMode('visual')}
                            className={`rounded px-2.5 py-1 transition-colors flex items-center gap-1.5 ${
                              bodyDisplayMode === 'visual'
                                ? 'bg-white font-bold text-stone-900 shadow-xs'
                                : 'text-stone-600 hover:text-stone-900'
                            }`}
                          >
                            <span>👁</span>
                            <span>Visual Canvas</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBodyDisplayMode('diff')}
                            className={`rounded px-2.5 py-1 transition-colors flex items-center gap-1.5 ${
                              bodyDisplayMode === 'diff'
                                ? 'bg-white font-bold text-stone-900 shadow-xs'
                                : 'text-stone-600 hover:text-stone-900'
                            }`}
                          >
                            <span>⚡</span>
                            <span>Track Changes</span>
                          </button>
                        </div>
                      </div>

                      {bodyDisplayMode === 'visual' ? (
                        viewMode === 'split' ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 max-h-[600px] overflow-y-auto">
                              <span className="text-[10px] uppercase font-bold text-stone-400 block mb-2">
                                Past Version (v{selectedRevisionDetail.version})
                              </span>
                              <div className="revision-visual-canvas editor-canvas bg-white rounded-lg border border-stone-200 p-4">
                                <div
                                  className="ql-editor prose max-w-none text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderVisualBodyHtml(diffAnalysis.rawOldContent) }}
                                />
                              </div>
                            </div>
                            <div className="rounded-xl border border-orange-200 bg-orange-50/20 p-3 max-h-[600px] overflow-y-auto">
                              <span className="text-[10px] uppercase font-bold text-orange-600 block mb-2">
                                Current Editor Draft
                              </span>
                              <div className="revision-visual-canvas editor-canvas bg-white rounded-lg border border-orange-200 p-4">
                                <div
                                  className="ql-editor prose max-w-none text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderVisualBodyHtml(diffAnalysis.rawNewContent) }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase font-bold text-stone-500">
                                  Past Version (v{selectedRevisionDetail.version}) — Historical Snapshot
                                </span>
                              </div>
                              <div className="revision-visual-canvas editor-canvas bg-white rounded-lg border border-stone-200 p-4 max-h-[480px] overflow-y-auto">
                                <div
                                  className="ql-editor prose max-w-none text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderVisualBodyHtml(diffAnalysis.rawOldContent) }}
                                />
                              </div>
                            </div>
                            <div className="rounded-xl border border-orange-200 bg-orange-50/20 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase font-bold text-orange-600">
                                  Current Editor Draft — Active Canvas
                                </span>
                              </div>
                              <div className="revision-visual-canvas editor-canvas bg-white rounded-lg border border-orange-200 p-4 max-h-[480px] overflow-y-auto">
                                <div
                                  className="ql-editor prose max-w-none text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: renderVisualBodyHtml(diffAnalysis.rawNewContent) }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      ) : (
                        viewMode === 'split' ? (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3.5 max-h-72 sm:max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
                              <span className="text-[10px] uppercase font-bold text-stone-400 block mb-2 font-sans">
                                Past Version (v{selectedRevisionDetail.version})
                              </span>
                              {renderSideTokens(diffAnalysis.contentDiff.tokens, 'left')}
                            </div>
                            <div className="rounded-xl border border-orange-200 bg-orange-50/20 p-3.5 max-h-72 sm:max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
                              <span className="text-[10px] uppercase font-bold text-orange-600 block mb-2 font-sans">
                                Current Editor Draft
                              </span>
                              {renderSideTokens(diffAnalysis.contentDiff.tokens, 'right')}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 sm:p-4 max-h-72 sm:max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap">
                            {renderUnifiedTokens(diffAnalysis.contentDiff.tokens)}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-500">Select a version from the left panel to compare.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
