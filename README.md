# CogCMS

A self-hostable, multi-site headless CMS built with Next.js 16, React 19, MongoDB/Mongoose, TypeScript and Vitest. Manage blogs, authors, FAQs, whitepapers and release notes in one editorial workspace, and deliver published content to your websites through a versioned API or restricted MongoDB views.

The CMS includes site-scoped users and API keys, editorial previews, stored blog rendering, signed publishing notifications, newsletter and FAQ intake, and optional S3 media uploads. Websites own their presentation. Start with the local demo below or [set up your own installation](docs/DEPLOYMENT.md).

## Local setup

Use Node 22 (`.nvmrc`), npm, **MongoDB 8.2.5** and MongoDB Shell (`mongosh`) for this local recipe. The CMS requires a replica set for transactional paths. Media upload is optional and disabled when the three `S3_*` values are unset.

Get the source and enter the project directory:

```sh
git clone https://github.com/mundra-aman/CogCMS.git
cd CogCMS
```

Then complete these steps from that directory:

1. Create an empty local data directory and start MongoDB with `mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath <empty-local-directory>`. In a second terminal, connect with `mongosh mongodb://localhost:27017` and run `rs.initiate({_id: 'rs0', members: [{_id: 0, host: 'localhost:27017'}]})` once. Do not point these commands at a shared database.
2. Run `npm ci`, copy `.env.example` to `.env`, and set a new local `CMS_JWT_SECRET` (at least 32 characters) and local `CMS_SEED_ADMIN_PASSWORD` (at least 12 characters). The example email is fictional. Keep `MONGODB_DB_NAME=cms_public_demo` and `MONGODB_URI=mongodb://localhost:27017/?replicaSet=rs0`.
3. Run `npm run seed:admin`, `npm run ensure:indexes`, then `npm run seed:demo`. The demo seed refuses remote MongoDB targets, any database name other than `cms_public_demo`, and an existing site or blog. It creates two fictional sites and 48 blogs; it never overwrites existing records.
4. Run `npm run dev` and open `http://localhost:3003/admin/login`. Sign in with the local admin, then choose **Northstar Studio** or **Harbor Notes** from the site selector. Explore the editors or create a site of your own. The demo has no public website, so its public View links are illustrative.

To reset, stop the app and verify that the target is your disposable local `cms_public_demo` database before dropping it with `mongosh`; then repeat the seed commands. No reset command is bundled so a copied command cannot silently erase another database.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build` sequentially. Unit and integration tests use a separate temporary MongoDB replica set. If its binary is not cached, `mongodb-memory-server` may download one. Report any setup or baseline failure separately from your changes.

## Assignment Feature: Admin Activity Log

### Feature overview

This contribution adds a site-scoped Admin Activity Log to CogCMS. It records CREATE, UPDATE and DELETE operations performed on blog posts, including the user, action, affected content and
timestamp.

The feature provides a lightweight audit trail for multi-user content management without changing the existing editorial workflow.

### Architecture and data flow

Admin blog action
→ Blog API route
→ Blog mutation
→ `logActivity()` helper
→ `ActivityLog` Mongoose model
→ MongoDB `activity_logs` collection
→ Activity Log admin page

Each record stores the user ID, name and email, action, resource type, resource ID, resource title, site ID and creation timestamp.

### Design decisions

- **Site-scoped records:** Activity is filtered by the active site to match CogCMS's multi-site architecture.
- **Snapshot information:** User details and content title are stored with each event so historical entries remain readable after later edits.
- **Dedicated collection:** Audit data is kept separate from editorial content.
- **Indexed queries:** `siteId` and `createdAt` are indexed to support recent site activity queries.
- **Synchronous logging:** The mutation waits for the audit entry to be created, providing immediate audit consistency.

### Admin usage

1. Sign in to the admin dashboard.
2. Select an active site.
3. Open **Activity Log** from the Content navigation.
4. Create, edit or delete a blog.
5. Return to Activity Log to view the recorded event.

The page displays the latest 100 records with date/time, user, action, content type and content title.

### Testing

The activity logging helper has a dedicated unit test. The feature was also manually verified through the admin UI for:

- Blog creation → `CREATE`
- Blog update → `UPDATE`
- Blog deletion → `DELETE`

The complete existing test suite passes with 420 tests.

### Limitations and future work

The current implementation intentionally focuses on blog mutations. Future improvements could include activity tracking for other content types, filtering, pagination, detailed event views,
export, retention policies and dedicated PUBLISH/UNPUBLISH event types.

## Boundaries

- Admin routes use a login session and active-site selection. `/api/v1` uses site-scoped keys and exposes published content only.
- Website rendering stays in the consumer; this repository owns editorial UI, content models and publication contracts. See [architecture](docs/ARCHITECTURE.md).
- Local editorial use needs no cloud account or paid service. Optional media and hosted installations use your own resources. See [deployment notes](docs/DEPLOYMENT.md).
- Keep credentials out of the repository. `.env.example` contains placeholders only.

Read [CONTRIBUTING.md](CONTRIBUTING.md) to contribute. The optional [assignment](ASSIGNMENT.md) provides a bounded example contribution; it does not define the scope of the product.

## Community and maintenance

- [Support](SUPPORT.md): questions, bug reports and feature requests.
- [Code of Conduct](CODE_OF_CONDUCT.md): participation and reporting concerns.
- [Security policy](SECURITY.md): private vulnerability reporting and maintenance scope.
- [Changelog](CHANGELOG.md): release status and notable changes.

This is the initial public-source preparation. There are no published stability or long-term support guarantees; review the deployment guide before running an installation with real data.

Licensed under the [MIT License](LICENSE), copyright 2026 Aman Mundra. See [source provenance](PROVENANCE.md) for the project's origins. This source distribution includes no private installation history or customer dataset.
