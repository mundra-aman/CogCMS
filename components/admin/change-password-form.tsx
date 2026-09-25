'use client';

import { useState, type FormEvent } from 'react';

type Feedback = { tone: 'success' | 'error'; text: string };

export function ChangePasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const currentPassword = String(fields.get('currentPassword') ?? '');
    const newPassword = String(fields.get('newPassword') ?? '');
    const confirmPassword = String(fields.get('confirmPassword') ?? '');

    if (newPassword !== confirmPassword) {
      setFeedback({ tone: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/admin/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setFeedback({ tone: 'error', text: body?.error ?? 'Could not change password.' });
        return;
      }

      form.reset();
      setFeedback({ tone: 'success', text: 'Password changed.' });
    } catch {
      setFeedback({ tone: 'error', text: 'Could not change password.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-stone-200 bg-stone-50">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-stone-700">
        Change password
      </summary>
      <form onSubmit={handleSubmit} className="space-y-2 border-t border-stone-200 p-3">
        <label className="block text-xs font-medium text-stone-600">
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-stone-600">
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={200}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-stone-600">
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={200}
            className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        {feedback ? (
          <p
            role="status"
            className={
              feedback.tone === 'success' ? 'text-xs text-emerald-700' : 'text-xs text-red-700'
            }
          >
            {feedback.text}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Changing…' : 'Update password'}
        </button>
      </form>
    </details>
  );
}
