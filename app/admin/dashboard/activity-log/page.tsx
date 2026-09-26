import connectToDatabase from '@/lib/mongodb';
import ActivityLog from '@/models/ActivityLog';
import { requireUser } from '@/lib/auth/require';
import { getCurrentSite } from '@/lib/site/context';

export const dynamic = 'force-dynamic';

export default async function ActivityLogPage() {
  const user = await requireUser();
  const site = await getCurrentSite(user);

  if (!site) {
    return (
      <div className="rounded-lg border bg-white p-6">
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="mt-2 text-sm text-gray-500">
          Please select an active site to view its activity log.
        </p>
      </div>
    );
  }

  await connectToDatabase();

  const activities = await ActivityLog.find({
    siteId: site.id,
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean()
    .exec();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="mt-1 text-sm text-gray-500">
          Recent activity performed by administrators and editors.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium">Date & Time</th>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Content Type</th>
              <th className="px-4 py-3 font-medium">Content</th>
            </tr>
          </thead>

          <tbody className="divide-y">
            {activities.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No activity has been recorded yet.
                </td>
              </tr>
            ) : (
              activities.map((activity) => (
                <tr key={activity._id.toString()}>
                  <td className="px-4 py-3">
                    {new Date(activity.createdAt).toLocaleString()}
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{activity.userName}</div>
                    <div className="text-xs text-gray-500">
                      {activity.userEmail}
                    </div>
                  </td>

                  <td className="px-4 py-3 font-medium">
                    {activity.action}
                  </td>

                  <td className="px-4 py-3">
                    {activity.resourceType}
                  </td>

                  <td className="px-4 py-3">
                    {activity.resourceTitle}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
