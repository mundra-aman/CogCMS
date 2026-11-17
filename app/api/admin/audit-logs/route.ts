import { NextResponse } from 'next/server';
import { Types } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';
import { withAdmin } from '@/lib/http/admin-handler';
import { validationError } from '@/lib/http/errors';
import { paginationMeta } from '@/contracts/v1/common';

// Instruct Next.js to always execute this route dynamically per request, disabling static caching; Every second, new events are created, edited, and deleted; If Next.js cached the response, an admin refreshing the page would see stale logs from 10 minutes ago!
export const dynamic = 'force-dynamic';

// Regular Expression Matching: to escape ReDoS attack
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Get request to fetch audit logs with pagination and search; withAdmin is responsible for: CSRF Protection, Session Authentication, Role Authorization, Site Context;
// Uses the `withAdmin` HOF wrapper over Next.js central middleware because:
// 1. Full Node.js runtime is required for live Mongoose session & active user status validation (incompatible with Edge runtime middleware).
// 2. Type-safe dependency injection: seamlessly resolves and passes strongly-typed { user, site } into the route context.
// 3. Granular per-route access control: enforces { admin: true } role authorization at the route boundary.
export const GET = withAdmin(
  async (req, { site }) => {
    // Use req.nextUrl.searchParams to get the search parameters
    const searchParams = req.nextUrl.searchParams;

    // Unpack the search parameters with default values
    const rawPage = searchParams.get('page');
    const rawLimit = searchParams.get('limit');
    const search = (searchParams.get('search') ?? '').trim();
    const entityType = searchParams.get('entityType');

    // Check if the page and limit are valid integers; else set default values
    const page = rawPage ? parseInt(rawPage, 10) : 1;
    const limit = rawLimit ? parseInt(rawLimit, 10) : 20;

    // Validate the page and limit
    if (isNaN(page) || page < 1) {
      throw validationError({ page: ['Page must be a positive integer'] });
    }
    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw validationError({ limit: ['Limit must be between 1 and 100'] });
    }
    if (search.length > 100) {
      throw validationError({ search: ['Search query cannot exceed 100 characters'] });
    }

    // By seeding the filter with siteId right at initialization, every subsequent query is permanently locked to the active tenant's site. A user on Site A can never query records belonging to Site B, even if they manipulate query strings.
    const filter: Record<string, unknown> = {
      // site.id does NOT come from query parameters or user input; it comes from the server-resolved session (withAdmin)
      siteId: new Types.ObjectId(site.id),
    };

    // Entity Type Whitelisting: If the user selected "All Entities" in the UI (or left it unset), we skip this block and don't restrict entityType
    if (entityType && entityType !== 'all') {
      const allowedEntityTypes = ['blog', 'event', 'user', 'site', 'api_key'];
      if (!allowedEntityTypes.includes(entityType)) {
        throw validationError({ entityType: ['Invalid entityType filter'] });
      }
      filter.entityType = entityType;
    }

    // Safe Substring Search: Takes the user's raw search string and neutralizes regex characters; 
    if (search) {
      const escaped = escapeRegex(search);
      const searchRegex = new RegExp(escaped, 'i'); // Case-insensitive flag
      // MongoDB's $or operator matches documents if ANY of these 4 conditions are met
      filter.$or = [
        { entityTitle: searchRegex },
        { 'actor.name': searchRegex },
        { 'actor.email': searchRegex },
        { action: searchRegex },
      ];
    }

    // Wait for database connection; If the connection is already established in the background (from the previous request), this line returns immediately
    await connectToDatabase();

    // Calculating the Pagination Offset
    const skip = (page - 1) * limit;

    // Parallel Database Execution: Promise.all is used inplace of await; Node would wait for the first query to finish before starting the second; With Promise.all: Both queries are sent to MongoDB concurrently across connection pool sockets; MongoDB processes them in parallel;
    const [total, items] = await Promise.all([
      AuditLog.countDocuments(filter).exec(),
      AuditLog.find(filter)
        // Primary sort (newest logs first); _id: -1: Tie-breaker! If two actions happen within the exact same millisecond, id: -1 guarantees stable deterministic pagination;
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        // Mongoose queries are thenables, not real JavaScript Promises. Calling .exec() returns a true native V8 Promise and gives cleaner stack traces if an error occurs.
        .exec(),
    ]);

    // Retruning standard response contract
    return NextResponse.json({
      data: items,
      meta: paginationMeta(page, limit, total),
    });
  },
  // second arguments to withAdmin HOF
  { admin: true, site: true },
);