import { Types } from 'mongoose';

import ActivityLog, { ActivityAction } from '@/models/ActivityLog';

type LogActivityParams = {
  userId: string;
  userName: string;
  userEmail: string;
  action: ActivityAction;
  resourceType: string;
  resourceId: string;
  resourceTitle: string;
  siteId: string;
};

export async function logActivity({
  userId,
  userName,
  userEmail,
  action,
  resourceType,
  resourceId,
  resourceTitle,
  siteId,
}: LogActivityParams) {
  await ActivityLog.create({
    userId: new Types.ObjectId(userId),
    userName,
    userEmail,
    action,
    resourceType,
    resourceId: new Types.ObjectId(resourceId),
    resourceTitle,
    siteId: new Types.ObjectId(siteId),
  });
}
