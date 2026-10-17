import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ActivityLog from '@/models/ActivityLog';
import { logActivity } from './activity-log';

describe('logActivity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an activity log with the correct audit details', async () => {
    const createSpy = vi
      .spyOn(ActivityLog, 'create')
      .mockResolvedValue({} as never);

    const userId = new Types.ObjectId().toString();
    const resourceId = new Types.ObjectId().toString();
    const siteId = new Types.ObjectId().toString();

    await logActivity({
      userId,
      userName: 'Administrator',
      userEmail: 'admin@example.com',
      action: 'CREATE',
      resourceType: 'Blog',
      resourceId,
      resourceTitle: 'Activity Log Test',
      siteId,
    });

    expect(createSpy).toHaveBeenCalledWith({
      userId: new Types.ObjectId(userId),
      userName: 'Administrator',
      userEmail: 'admin@example.com',
      action: 'CREATE',
      resourceType: 'Blog',
      resourceId: new Types.ObjectId(resourceId),
      resourceTitle: 'Activity Log Test',
      siteId: new Types.ObjectId(siteId),
    });
  });
});
