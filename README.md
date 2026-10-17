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

## Assignment feature: Blog version history

### Feature overview

This implementation adds **Blog Version History** to the admin blog editor. Editors can open the history of an existing blog, see every saved version with its timestamp, status and change type, and restore an earlier version.

The feature solves a common editorial failure mode: an accidental edit or publish can overwrite content that was previously correct. Instead of requiring a separate backup system, the CMS stores immutable snapshots alongside the blog and treats restoration as another normal content change.

### Architecture

```text
Admin Blog Editor
	 |
	 | GET /api/admin/blogs/:slug/versions
	 v
 Blog Version API -----------------> BlogVersion collection
	 |
	 | POST /versions/:version
	 v
 Existing Blog API/model
	 |
	 |- validate site + author
	 |- restore snapshot
	 |- record a new "restore" version
	 `- emit existing publication webhook when status changes
```

A `BlogVersion` belongs to both a `siteId` and `blogId`. Each version contains the complete editorial state needed to restore the blog, including content, metadata, taxonomy, publication state and the rendered snapshot. The original blog remains the source of truth for the live document.

The version API is site-scoped through the same `withAdmin` middleware used by the rest of the admin API. Restore also reuses the existing author validation and slug uniqueness rules.

### Design decisions and trade-offs

- **Full snapshots instead of field-level diffs:** snapshots make restore deterministic and simple. The trade-off is additional MongoDB storage, which is reasonable for an assignment-sized editorial history and can later be addressed with retention or compression.
- **Version after every successful save:** this keeps the mental model simple and ensures that every state an editor explicitly saved is recoverable. Unsaved browser changes are intentionally not persisted.
- **Restore creates a new version:** restoring an old state never destroys history. If version 2 is restored, the restored state becomes version 3, so the editor can still move forward again.
- **Versions are scoped by site and blog:** this follows the CMS's existing multi-tenant design and prevents one site's history from being read or restored from another site.
- **No new dependency:** the feature uses the repository's existing Next.js route handlers, Mongoose, React and Vitest stack. This avoids adding infrastructure solely for version history.

### Technology choices

- **MongoDB/Mongoose:** stores immutable version snapshots in a dedicated `blog_versions` collection.
- **Next.js route handlers:** expose history and restore operations under the existing `/api/admin/blogs` namespace.
- **React/TypeScript:** provides the version history dialog in the existing blog editor.
- **Existing `withAdmin` middleware:** preserves authentication, CSRF/same-origin protection and active-site resolution.
- **Existing validation and publishing utilities:** author validation, slug checks, related-post invalidation and publication webhooks are reused rather than duplicated.
- **Vitest:** integration tests cover version creation and update ordering; restore and tenant scoping are enforced by the site-scoped route handlers.

### Setup and usage

No additional package, service or environment variable is required.

1. Start the CMS using the existing setup instructions.
2. Log in to the admin dashboard and choose a site.
3. Open **Blogs** and edit an existing blog.
4. Click **Version history** in the editor header.
5. Select **Restore** on an older version and confirm.
6. The editor reloads with the restored content. The restoration itself is recorded as the newest version.

A newly created blog starts at version 1. Existing blogs created before this feature do not have historical snapshots; their first subsequent save becomes the first recorded version.

### Limitations and future work

- There is currently no visual field-by-field diff; the history view shows metadata and supports restoration.
- There is no configurable retention policy, so frequently edited blogs can accumulate snapshots.
- Version creation uses a read-then-increment sequence. A future implementation could use an atomic counter if concurrent editors need stronger guarantees.
- Restore requires the referenced author to still satisfy the CMS's current publication rules. This avoids restoring a state that violates today's publishing constraints.
- A future UI could add a read-only preview of a selected version before restoring it.

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
