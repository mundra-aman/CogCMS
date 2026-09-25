import { Types } from 'mongoose';
import { HttpError, validationError } from '@/lib/http/errors';
import Site from '@/models/Site';
import User, { type IUser, type UserRole, type UserStatus } from '@/models/User';

export async function assertActiveSiteAssignments(siteIds: string[]): Promise<void> {
  if (siteIds.length === 0) return;
  const unique = [...new Set(siteIds)];
  const activeCount = await Site.countDocuments({
    _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
    status: 'active',
  });
  if (activeCount !== unique.length) {
    throw validationError({ siteIds }, 'Every assigned site must exist and be active');
  }
}

export async function assertAdminContinuity(
  current: IUser,
  next: { role: UserRole; status: UserStatus },
): Promise<void> {
  const removesActiveAdmin =
    current.role === 'admin' &&
    current.status === 'active' &&
    (next.role !== 'admin' || next.status !== 'active');
  if (!removesActiveAdmin) return;

  const activeAdmins = await User.countDocuments({ role: 'admin', status: 'active' });
  if (activeAdmins <= 1) {
    throw new HttpError(409, 'CONFLICT', 'At least one active admin is required');
  }
}
