# CogCMS

A self-hostable, multi-site headless CMS built with Next.js 16, React 19, MongoDB/Mongoose, TypeScript and Vitest. Manage blogs, authors, FAQs, whitepapers and release notes in one editorial workspace, and deliver published content to your websites through a versioned API or restricted MongoDB views.

The CMS includes site-scoped users and API keys, editorial previews, stored blog rendering, signed publishing notifications, newsletter and FAQ intake, and optional S3 media uploads. Websites own their presentation. Start with the local demo below or [set up your own installation](docs/DEPLOYMENT.md).

## Local setup

Use Node 22 (`.nvmrc`), npm and your own **MongoDB 8.2.5 replica set**; the project does not supply a database. A standalone `mongod` starts the app, but the transactional `/api/v1` intake rate limiter then fails with `Transaction numbers are only allowed on a replica set member`. Media upload is optional and disabled when the three `S3_*` values are unset.

Get the source and enter the project directory:

```sh
git clone https://github.com/mundra-aman/CogCMS.git
cd CogCMS
```

Then complete these steps from that directory:

1. Start a local single-node replica set with either option. Do not point these commands at a shared database.
   - **Installed MongoDB and `mongosh`:** create an empty local data directory and start MongoDB with `mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath <empty-local-directory>`. In a second terminal, connect with `mongosh mongodb://localhost:27017` and run `rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})` once.
   - **Docker:** run `docker run -d --name cogcms-mongo -p 127.0.0.1:27017:27017 mongo:8.2.5 --replSet rs0 --bind_ip_all`, then once `docker exec cogcms-mongo mongosh --quiet --eval "rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})"`.
2. Run `npm ci`, copy `.env.example` to `.env`, and set a new local `CMS_JWT_SECRET` (at least 32 characters) and local `CMS_SEED_ADMIN_PASSWORD` (at least 12 characters). Only the "Required for local development" section matters for this demo. The example email is fictional. Keep `MONGODB_DB_NAME=cms_public_demo` and `MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0`.
3. Run `npm run seed:admin`, `npm run ensure:indexes`, then `npm run seed:demo`. The demo seed refuses remote MongoDB targets, any database name other than `cms_public_demo`, and an existing site or blog. It creates two fictional sites and 48 blogs; it never overwrites existing records.
4. Run `npm run dev` and open `http://localhost:3003/admin/login`. Sign in with the local admin, then choose **Northstar Studio** or **Harbor Notes** from the site selector. Explore the editors or create a site of your own. The demo has no public website, so its public View links are illustrative.

To reset, stop the app and verify that the target is your disposable local `cms_public_demo` database before dropping it with `mongosh`; then repeat the seed commands. No reset command is bundled so a copied command cannot silently erase another database. With the Docker option, `docker rm -f -v cogcms-mongo` discards that container and its data.

A hosted replica set such as a MongoDB Atlas cluster also runs the app, but `seed:demo` accepts only a local target, so you start there without demo content.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build` sequentially. Unit and integration tests use a separate temporary MongoDB replica set. If its binary is not cached, `mongodb-memory-server` may download one. Report any setup or baseline failure separately from your changes.

## Boundaries

- Admin routes use a login session and active-site selection. `/api/v1` uses site-scoped keys and exposes published content only.
- Website rendering stays in the consumer; this repository owns editorial UI, content models and publication contracts. See [architecture](docs/ARCHITECTURE.md).
- Local editorial use needs no cloud account or paid service. Optional media and hosted installations use your own resources. See [deployment notes](docs/DEPLOYMENT.md).
- Keep credentials out of the repository. `.env.example` contains placeholders only.

Read [CONTRIBUTING.md](CONTRIBUTING.md) to contribute. The optional [assignment](ASSIGNMENT.md) provides a bounded example contribution; it does not define the scope of the product.

## Activity Log and Audit Trail

### 1. Feature Overview

The Activity Log / Audit Trail provides CMS administrators with a persistent, site-scoped chronological record of editorial mutations across the system. In a collaborative multi-site CMS, teams need clear operational visibility into:

- What changes were made to content assets (blogs, authors, FAQs, whitepapers, release notes).
- Who performed each operation (actor name, email, role, and persistent user ID).
- What specific action occurred (creation, update, publication, unpublication, or deletion).
- When the operation occurred (UTC timestamp).
- Safe contextual metadata associated with the event (publication statuses, categories, changed fields).

The feature acts as an immutable audit trail rather than a transient application log. It is strictly scoped to the active site, ensuring complete multi-tenant isolation, and is accessible only to authenticated users with valid CMS administrative access.

### 2. Architecture and Data Flow

Activity logging integrates directly into the existing server-side mutation layer. The lifecycle guarantees that an activity log entry is written only after the underlying MongoDB document mutation has successfully committed.

```
Admin Action (Browser UI)
    │
    ▼
Admin API Route (/api/admin/*)
    │  [withAdmin middleware: origin validation + session verification + site resolution]
    ▼
Primary CMS Mutation (e.g. Blog.create, Author.findOneAndUpdate, FAQ.findOneAndDelete)
    │
    ├── (On Failure: returns 4xx/5xx; activity logging is bypassed)
    │
    ▼ (On Success)
Shared Activity Recorder (lib/admin/activity-log.ts: recordActivity)
    │  [Sanitizes metadata + captures actor snapshot from authenticated server identity]
    ▼
Persistent Storage (MongoDB activity_logs collection)
    │
    ▼
Query Pipeline (/api/admin/activity-logs)
    │  [Site-scoped, validated filtering, deterministic sort, bounded pagination]
    ▼
Admin Activity Interface (/admin/dashboard/activity-logs)
```

Data Flow:

1. An administrator performs an action in the CMS dashboard (e.g. editing an article or deleting a FAQ).
2. The request hits the corresponding `/api/admin/*` route wrapped by `withAdmin`, validating CSRF/origin, session credentials, and site access.
3. The route performs schema validation and executes the document mutation against MongoDB.
4. If the mutation succeeds, the handler calls `recordActivity()` with the authenticated server user context, target entity identifiers, and event metadata.
5. `recordActivity()` sanitizes metadata, constructs an immutable record with an actor snapshot, and saves it to the `activity_logs` collection.
6. The admin interface fetches bounded pages via `GET /api/admin/activity-logs` with active-site isolation, filter validation, and deterministic sorting (`createdAt` descending, `_id` descending).

### 3. Data Model

The audit trail is persisted in MongoDB via the `ActivityLog` Mongoose model (`models/ActivityLog.ts`) in the `activity_logs` collection:

- `siteId` (ObjectId, required, indexed): References the active site, enforcing multi-site tenant isolation.
- `actor` (Embedded Subdocument, required):
  - `id` (ObjectId, ref: User): MongoDB identifier of the user who performed the action.
  - `name` (String): Display name of the user at the time of the action.
  - `email` (String): Email address of the user at the time of the action.
  - `role` (String): Role of the user (`admin` or `editor`).
- `action` (String, enum: `create`, `update`, `delete`, `publish`, `unpublish`, required): Semantic content lifecycle action. Status changes from draft to publish are classified as `publish`; publish to draft as `unpublish`.
- `entityType` (String, enum: `blog`, `author`, `faq`, `whitepaper`, `release_note`, required): Content model affected.
- `entityId` (String, required): String representation of the affected document's MongoDB ObjectId.
- `entityTitle` (String, default: ''): Human-readable snapshot of the entity (e.g. blog title, author name, FAQ question, whitepaper title, or release note version).
- `entitySlug` (String, default: ''): Canonical URL slug where applicable.
- `metadata` (Mixed, default: {}): Sanitized operational context, such as status transitions and categories.
- `createdAt` (Date, default: Date.now, immutable): Timestamp of the audit event.

#### Deliberate Snapshotting and Denormalization

The `actor` (name, email, role) and `entityTitle` are explicitly stored as snapshots at creation time:

- **Historical readability**: If an entity is deleted (such as a removed blog post or FAQ), the primary document is gone from MongoDB. Without a snapshot, an administrator reviewing past deletions would see only an unidentifiable ObjectId. The snapshot preserves permanent historical context.
- **Actor continuity**: If a staff member leaves and their CMS account is updated or deleted, past audit records must continue to show who performed historical actions rather than showing broken or missing user references.
- **Performance**: Snapshotting eliminates N+1 query lookups when rendering the activity log list.

#### Indexes

Compound indexes are tailored to the exact query access patterns used by the feature:

- `{ siteId: 1, createdAt: -1, _id: -1 }`: Optimizes the default chronological list query and deterministic pagination.
- `{ siteId: 1, action: 1, createdAt: -1 }`: Accelerates action-filtered queries within a site.
- `{ siteId: 1, entityType: 1, createdAt: -1 }`: Accelerates entity-filtered queries within a site.
- `{ siteId: 1, entityId: 1 }`: Supports entity-specific audit history inspection.

In adherence to repository DocumentDB compatibility guidelines, no text indexes, partial filter expressions, or collation specifications are used.

### 4. Design Decisions and Trade-offs

- **Centralized Activity Recorder vs. Duplicated Logging**: All audit record creation is routed through `recordActivity()` in `lib/admin/activity-log.ts`. This centralizes input validation, actor snapshotting, error handling, and security sanitization in one reusable module rather than dispersing database calls across individual route handlers.
- **Server-Determined Actor Identity**: Client payloads cannot provide an `actorId` or directly create activity records. The actor identity is extracted exclusively from the server-validated session (`ctx.user`), preventing privilege escalation or identity spoofing.
- **Error Behavior and Observability**: Audit logging takes place after the primary mutation has succeeded. Because CogCMS operations are single-document mutations without two-phase commit transactions, failing to write an audit entry must not cause the primary operation to report an HTTP 500 error to the client (which would cause user confusion and retry attempts). `recordActivity()` catches unexpected persistence errors, logs full diagnostic details to `console.error('[cms] activity logging failed', ...)` for monitoring and alerting, and returns `null`. A `throwOnError` option is available for environments requiring strict transactional consistency.
- **Server-Side Pagination and Bounded Queries**: The API enforces bounded page sizes (default 20, maximum 100) using MongoDB `skip` and `limit`. The browser never downloads the full activity dataset.
- **Deterministic Ordering**: To avoid pagination drift when multiple entries share the exact same millisecond timestamp, queries sort by `{ createdAt: -1, _id: -1 }`.
- **Sensitive Data Redaction**: The metadata sanitizer (`sanitizeActivityMetadata`) automatically inspects keys case-insensitively and strips sensitive terms matching `password`, `secret`, `token`, `cookie`, `credential`, `auth`, `jwt`, and `hash`. Long string fields are truncated to 500 characters to prevent database bloat.

### 5. Technology Choices

- **Mongoose 9**: Used for the `ActivityLog` schema, type safety, and compound index declaration, maintaining architectural consistency with existing models (`Blog`, `Author`, etc.).
- **Next.js 16 App Router Route Handlers**: `app/api/admin/activity-logs/route.ts` leverages `withAdmin` for unified session validation, CSRF checks, and site resolution.
- **Radix UI Dialog**: Uses `@radix-ui/react-alert-dialog` (already installed in the repository) for accessible, keyboard-navigable inspection of audit record details.
- **Tailwind CSS**: Follows the existing stone-based neutral palette and badge conventions (`bg-emerald-50`, `bg-amber-50`, `bg-rose-50`, `bg-blue-50`, `bg-purple-50`) without introducing external UI component libraries.

### 6. Setup and Usage

#### Accessing the Activity Log

1. Start the application:
   ```sh
   npm run dev
   ```
2. Navigate to `http://localhost:3003/admin/login` and log in with your administrator credentials.
3. Select an active site from the site selector (e.g. **Northstar Studio** or **Harbor Notes**).
4. In the sidebar navigation under **Content**, click **Activity log** (or navigate to `/admin/dashboard/activity-logs`).

#### Generating Activity Entries

Any editorial action on a supported entity generates an audit entry:

- **Create**: Create a new blog post, author, FAQ, whitepaper, or release note.
- **Publish / Unpublish**: Transition any draft content item to published, or unpublish an active item.
- **Update**: Edit any existing content attributes and save.
- **Delete**: Delete a blog post, author, FAQ, whitepaper, or release note.

#### Using Filters and Pagination

- **Search**: Enter text in the search input to filter entries by entity title or actor name.
- **Action Filter**: Select Created, Updated, Published, Unpublished, or Deleted.
- **Entity Filter**: Filter by Blog post, Author, FAQ, Whitepaper, or Release note.
- **Inspect**: Click the "Inspect" button on any row to open a modal displaying the full audit entry, actor identity details, and operational metadata.
- **Pagination**: Use the Previous and Next controls at the bottom of the table to navigate through paginated result pages.

#### Running Tests

Run the test suites to verify functionality:

```sh
# Run activity log unit tests
node scripts/run-vitest.mjs run lib/admin/activity-log.test.ts

# Run activity log end-to-end integration tests
node scripts/run-vitest.mjs run tests/integration/api/admin-activity-logs.test.ts

# Run complete checks
npm run typecheck
npm test
npm run build
```

### 7. Limitations and Future Work

- **Granular Attribute Diffs**: The current implementation records status transitions and target entity metadata. A future enhancement could record detailed field-level before/after diffs for rich text content.
- **Audit Log Export**: While newsletter subscribers support CSV export, the Activity Log currently only exposes paginated JSON. A streaming CSV or JSON export feature could be added for compliance audits.
- **Retention and Archival Policies**: Audit entries currently persist indefinitely. For high-volume enterprise deployments, a scheduled TTL archival job could migrate records older than a retention threshold (e.g. 1 year) to cold storage (such as S3 Glacier or compressed JSON archives).
- **Advanced Date-Range Filters**: Filtering currently operates by action, entity type, and text search. Adding specific start-date and end-date datepicker inputs would further assist auditing large histories.

## Community and maintenance

- [Support](SUPPORT.md): questions, bug reports and feature requests.
- [Code of Conduct](CODE_OF_CONDUCT.md): participation and reporting concerns.
- [Security policy](SECURITY.md): private vulnerability reporting and maintenance scope.
- [Changelog](CHANGELOG.md): release status and notable changes.

This is the initial public-source preparation. There are no published stability or long-term support guarantees; review the deployment guide before running an installation with real data.

Licensed under the [MIT License](LICENSE), copyright 2026 Aman Mundra. See [source provenance](PROVENANCE.md) for the project's origins. This source distribution includes no private installation history or customer dataset.
