import mongoose from 'mongoose';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getEnv } from '@/lib/env';
import connectToDatabase from '@/lib/mongodb';
import { hashPassword } from '@/lib/auth/password';
import User from '@/models/User';

export interface SeedAdminResult {
  created: boolean;
  userId: string;
}

export async function seedAdmin(): Promise<SeedAdminResult> {
  const env = getEnv();
  if (!env.CMS_SEED_ADMIN_EMAIL || !env.CMS_SEED_ADMIN_PASSWORD || !env.CMS_SEED_ADMIN_NAME) {
    throw new Error(
      'CMS_SEED_ADMIN_EMAIL, CMS_SEED_ADMIN_PASSWORD, and CMS_SEED_ADMIN_NAME are required',
    );
  }

  await connectToDatabase();
  const existing = await User.findOne({ role: 'admin' }).exec();
  if (existing) return { created: false, userId: existing._id.toString() };

  const user = await User.create({
    email: env.CMS_SEED_ADMIN_EMAIL,
    passwordHash: await hashPassword(env.CMS_SEED_ADMIN_PASSWORD),
    name: env.CMS_SEED_ADMIN_NAME,
    role: 'admin',
    siteIds: [],
    status: 'active',
    createdBy: null,
  });
  return { created: true, userId: user._id.toString() };
}

async function main(): Promise<void> {
  try {
    const result = await seedAdmin();
    console.log(result.created ? 'Created the initial admin.' : 'An admin already exists; unchanged.');
  } finally {
    await mongoose.disconnect();
  }
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
