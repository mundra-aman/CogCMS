# Connect a website

Create a site in the CMS and keep its immutable ID and slug with the website's server configuration. The CMS owns editing and publication; your website owns layout, URLs and caching.

## HTTP API

Create a site API key from **Sites → Edit → API keys**. Plaintext is shown once. Keep the key server-side. Use `content:read` for content and a separate `intake:write` key for forms.

```sh
curl -H "Authorization: Bearer $CMS_API_KEY" "$CMS_ORIGIN/api/v1/posts?limit=20&fields=summary"
curl -H "Authorization: Bearer $CMS_API_KEY" "$CMS_ORIGIN/api/v1/posts/example-post?include=author,related,jsonLd"
```

Events are available at `/api/v1/events` and `/api/v1/events/<slug>`. Posts include `imageAlt` (cover image alt text, empty string when unset); responses carry `X-CMS-Version: 1.1`.

Lists return `{data, meta}` with page/limit metadata; singles return `{data}`. Only published records for that key's site are returned. Read the schemas under `contracts/v1` for exact fields. `packages/cms-client` provides the typed fetch client; `npm run sync:client -- <target-directory>` copies it and the contract into a consumer.

## MongoDB views

For server-side MongoDB consumers, provision the seven per-site published views and a find-only reader identity using the [versioned view contract](../contracts/mongo-v1/README.md). Never give a website the CMS runtime or operator identity. Browser code must not contain a database URI.

## Changes and intake

Configure the website's webhook URL in the CMS site settings. Verify the timestamp and HMAC over the unchanged request bytes before invalidating caches. Webhooks are best effort with one retry; use bounded cache expiry as a fallback. The dashboard's **Connect a website** guide contains the full implementation checklist.

Newsletter and FAQ submissions use `/api/v1/intake/*` through your website server with `intake:write`. Follow the input schemas and trusted visitor-IP requirements in the implementation. Show validation failures, rate limits and outages to the user instead of reporting false success.

## Admin API

Admin endpoints under `/api/admin/*` require an authenticated CMS session cookie (`withAdmin`), enforce same-origin checks on mutations, and resolve the active `siteId` server-side.

### Audit Logs (`GET /api/admin/audit-logs`)

Returns reverse-chronological (`createdAt: -1, _id: -1`) mutation audit entries for the active site alongside global (`siteId: null`) `user` and `site` entries. Requires an **admin** session (`{ admin: true, site: true }`); editors receive `403`.

**Query parameters**

- `page` (optional, default `1`): Digits-only positive safe integer.
- `limit` (optional, default `20`): Digits-only safe integer from `1` to `100`. Both values and the calculated offset `(page - 1) * limit` must be within `Number.MAX_SAFE_INTEGER`, or the endpoint returns `400`.
- `entityType` (optional): `all`, `blog`, `event`, `user`, `site`, or `api_key`.
- `search` (optional, max `100` chars): Literal case-insensitive substring filter (regex-escaped) matched across `entityTitle`, `actor.name`, `actor.email`, and `action`.

**Response**

Returns `{ data, meta }` where `meta` is `{ page, limit, total, totalPages }`. Each record includes `siteId` (`string | null`), embedded `actor` snapshot (`id`, `name`, `email`, `role`), `entityType`, `entityId`, `entityTitle`, `action` (`create`, `update`, `delete`, `publish`, `unpublish`, `restore`, `generate`, `rotate`, `revoke`), `details`, and `createdAt`.

**Audited mutation routes & current scope**

- **Site-scoped (`siteId`):** Blog (`POST`, `PUT`, `DELETE`), Event (`POST`, `PUT`, `DELETE`), Site API key issue/rotate/revoke, and Site webhook secret rotation (`action: 'rotate'`).
- **Global (`siteId: null`):** User `POST` and `PUT` (including previous/next `role`, `status`, `siteIds`, and a `passwordChanged` boolean flag without password values), and Site `POST` and `PUT`.
- **Not currently logged:** Authors, FAQs, whitepapers, release notes, media uploads, and FAQ submissions. `logAudit` runs best-effort outside write transactions so logging errors do not fail primary mutations.

### Revisions (`GET /api/admin/revisions`, `GET /api/admin/revisions/[id]`, `POST /api/admin/revisions/[id]/restore`)

Manages immutable version snapshots and safe draft restoration for blogs and events, scoped to the active site (`withAdmin(..., { site: true })`).

- **`GET /api/admin/revisions`**: Lists version metadata for an entity in newest-first order (`majorVersion: -1, minorVersion: -1, createdAt: -1`).
  - **Query parameters (Zod-validated):**
    - `entityType` (required): `blog` or `event`.
    - `entityId` (required): Valid MongoDB ObjectId.
    - `trigger` (optional): `create`, `update`, `publish`, `unpublish`, or `restore`.
    - `limit` (optional, default `100`): Digits-only positive safe integer, clamped to `500`.
    - `page` (optional, default `1`): Digits-only safe integer from `1` to `100000`. The computed offset `(page - 1) * limit` must stay within `Number.MAX_SAFE_INTEGER`, or the endpoint returns `400`.
  - **Response:** Returns a JSON array omitting the bulky `snapshot` payload; each entry includes `_id`, `majorVersion`, `minorVersion`, `version`, `restoredFromVersion`, `trigger`, `author`, `summary`, and `createdAt`.
- **`GET /api/admin/revisions/[id]`**: Validates `id` as an ObjectId (`400` if invalid) and returns the full site-scoped revision document including `snapshot` (`404` if missing or owned by another site).
- **`POST /api/admin/revisions/[id]/restore`**: Atomically restores a snapshot inside a MongoDB transaction (`runInTransaction`), returning `{ restoredRevision, entity }` (`400` on invalid `id` or unusable blog `authorId`; `404` if missing or cross-site).
  - Forces `status: 'draft'` and clears `publishedAt` so restoring never publishes live as a side effect.
  - Records a new revision (`trigger: 'restore'`, `restoredFromVersion`) and writes a transactional `AuditLog` entry (`action: 'restore'`) in the same session.
  - Re-sanitizes HTML and re-renders TOC/heading snapshots for blogs; if the pre-restore entity was `publish`, emits a post-commit `content.unpublished` webhook using the pre-restore slug.
- **Current scope:** Versioned for `blog` and `event` entities only; FAQs, whitepapers, authors, release notes, sites, and users do not store revisions.
