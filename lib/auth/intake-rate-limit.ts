import { createHash } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import { HttpError } from '@/lib/http/errors';

export const INTAKE_IP_CAPACITY = 30;
export const INTAKE_KEY_CAPACITY = 600;
export type IntakeRateLimit = { limited: false } | { limited: true; retryAfter: number };
type Bucket = { _id: string; tokens: number; updatedAt: Date; expiresAt: Date };
const WINDOW_MS = 60_000;
const TIMEOUT_MS = 5000;

/** Two-document transaction preserves the old all-or-nothing token debit across instances. */
export async function consumeIntakeTokens(
  ip: string,
  keyId: string,
  now: number,
): Promise<IntakeRateLimit> {
  let session: ClientSession | undefined;
  const deadline = Date.now() + TIMEOUT_MS;
  const buckets = [
    { _id: `ip:${createHash('sha256').update(ip).digest('hex')}`, capacity: INTAKE_IP_CAPACITY },
    {
      _id: `key:${createHash('sha256').update(keyId).digest('hex')}`,
      capacity: INTAKE_KEY_CAPACITY,
    },
  ];
  try {
    const database = await connectToDatabase();
    const collection = database.connection.db!.collection<Bucket>('intake_rate_limits');
    session = await database.startSession();
    for (let attempt = 0; attempt < 8; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      try {
        return await session.withTransaction(
          async () => {
            const updated: Bucket[] = [];
            let retryAfter = 0;
            // Mongo does not support parallel operations within a transaction.
            for (const { _id, capacity } of buckets) {
              const old = await collection.findOne({ _id }, { session });
              const elapsed = old ? Math.max(0, now - old.updatedAt.getTime()) : WINDOW_MS;
              const tokens = Math.min(
                capacity,
                (old?.tokens ?? capacity) + (elapsed * capacity) / WINDOW_MS,
              );
              if (tokens < 1)
                retryAfter = Math.max(
                  retryAfter,
                  Math.ceil(((1 - tokens) * WINDOW_MS) / capacity / 1000),
                );
              // Never move the clock backwards when older requests complete after newer ones.
              const updatedAt = new Date(Math.max(now, old?.updatedAt.getTime() ?? now));
              updated.push({
                _id,
                tokens: tokens - 1,
                updatedAt,
                expiresAt: new Date(updatedAt.getTime() + WINDOW_MS),
              });
            }
            if (retryAfter > 0) return { limited: true as const, retryAfter };
            for (const { _id, ...values } of updated) {
              await collection.updateOne({ _id }, { $set: values }, { upsert: true, session });
            }
            return { limited: false as const };
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            timeoutMS: remaining,
          },
        );
      } catch (error) {
        // Concurrent first creation can be duplicate-key rather than a transient transaction error.
        if (!(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 11000
        ))
          throw error;
      }
    }
    throw new Error('Intake transaction contention');
  } catch {
    // Driver errors can contain credentials, addresses, or submitted identities.
    throw new HttpError(503, 'INTERNAL_ERROR', 'Intake rate limit unavailable');
  } finally {
    try {
      await session?.endSession();
    } catch {
      throw new HttpError(503, 'INTERNAL_ERROR', 'Intake rate limit unavailable');
    }
  }
}
