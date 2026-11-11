import { validationError } from '@/lib/http/errors';

/** Content Studio refuses a calendar time more than a year out, so the CMS does too. */
export const MAX_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1000;
/** A time a little in the past is a save that took a moment, not a mistake. */
const PAST_GRACE_MS = 5 * 60 * 1000;

export function validTimeZone(zone: string | null | undefined): string | null {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/**
 * The schedule fields to store for a save. Undefined input leaves the stored
 * schedule alone; a published post never keeps a schedule.
 */
export function scheduleUpdate(
  input: { scheduledAt?: string | null; scheduleTimezone?: string | null },
  nextStatus: 'draft' | 'publish',
  now = Date.now(),
): { scheduledAt: Date | null; scheduleTimezone: string | null } | null {
  if (nextStatus === 'publish') return { scheduledAt: null, scheduleTimezone: null };
  if (input.scheduledAt === undefined) return null;
  if (input.scheduledAt === null) return { scheduledAt: null, scheduleTimezone: null };
  const at = new Date(input.scheduledAt);
  if (!Number.isFinite(at.getTime())) throw validationError(null, 'Invalid schedule time');
  if (at.getTime() < now - PAST_GRACE_MS)
    throw validationError(null, 'Pick a schedule time in the future');
  if (at.getTime() > now + MAX_SCHEDULE_AHEAD_MS)
    throw validationError(null, 'Pick a schedule time within one year');
  return { scheduledAt: at, scheduleTimezone: validTimeZone(input.scheduleTimezone) };
}
