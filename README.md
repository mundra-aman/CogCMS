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

## Feature: Webhook Subscriptions

### Feature overview

Sites previously had only one outbound webhook (a single URL configured on the site itself). That doesn't fit teams who want several external systems — a Slack relay, a customer's backend, an automation tool — each notified independently, about different events, with their own secret. Webhook Subscriptions let a site register any number of outbound URLs, each scoped to the specific publish/update events it cares about, delivered with a signed, verifiable payload.

### Architecture

Each subscription is a `siteId`-scoped Mongo document (URL, event filter, a server-generated secret, active flag, last delivery status). It hooks into the same place the existing site-level webhook already fires from — the blog and FAQ publish/update/delete routes — so no new trigger point was introduced.

```
[Blog/FAQ publish or update route]
        |
        v
[dispatch.ts] -- finds active subscriptions matching the event --> [sign.ts] -- HMAC-SHA256 --> [deliver.ts] -- POST + 1 retry --> [external system]
        |
        v
[lastDelivery written back onto the subscription]
```

`dispatch.ts` runs inside Next's `after()`, so it executes once the editor's save/publish response has already been sent — a slow or unreachable subscriber can never delay or fail a content save.

### Design decisions and trade-offs

- **Fire-and-forget over a queue**: a durable queue (e.g. BullMQ, SQS) would survive process restarts and support backoff/replay, but it's infrastructure this project doesn't otherwise run. `after()` plus one retry is enough for a "best-effort notification" contract and keeps the feature dependency-free; the trade-off is that a delivery lost to a crash mid-request is not retried later.
- **One retry, not exponential backoff**: a single retry after a fixed 2-second pause catches the common case (a transient network blip or a cold-starting receiver) without building a backoff scheduler for a fire-and-forget path that already isn't guaranteed. A subscriber that's down for longer simply misses that event; there's no queue to replay it from.
- **HMAC-SHA256 over other auth schemes**: mirrors the signing convention already used by the site-level webhook in `lib/webhook.ts` (`sha256=` of `HMAC(secret, "${timestamp}.${body}")`). This was chosen for consistency — a receiver already integrated with the existing site webhook can verify subscription deliveries with the same code — over alternatives like mTLS (too much operational overhead for a webhook receiver) or a static bearer token (doesn't prove the body wasn't tampered with in transit).
- **Secret shown once, hidden by default afterwards**: the secret must be stored as-is (the server needs it to compute each HMAC), but the field is `select: false` in Mongoose and stripped from the create response's subscription object, so list/update responses and ordinary queries never include it. Only the dispatcher asks for it explicitly with `.select('+secret')`. It is not encrypted at rest; anyone with direct database read access can see it.

### Technology choices

- **Node's built-in `crypto` module** (`createHmac`) for signing — no new dependency, and it's the same primitive the existing site webhook uses.
- **`randomBytes(32).toString('base64url')`** for secret generation — a 256-bit secret, URL-safe encoding, no library needed.
- **Next.js `after()`** for fire-and-forget scheduling — avoids hand-rolling a background task runner for a single async side effect.
- **Zod** for the create/update contracts, matching every other admin input schema in this codebase.
- No new runtime dependency was added; `package.json` was checked first and nothing was missing.

### Setup and usage

1. In the admin UI, open **Sites**, pick a site, and scroll to the **Webhooks** card below API Keys.
2. Enter an `https://` endpoint URL, choose one or more events (`content.published`, `content.updated`, `content.unpublished`, `content.deleted`), and click **Add webhook**.
3. Copy the signing secret shown immediately after creation — it is never displayed again. Disable or delete the subscription from the same table if it's misconfigured.

To verify a delivery on the receiving end, recompute the signature over `${timestamp}.${rawBody}` using the stored secret and compare it to the `X-CMS-Signature` header:

```js
import { createHmac } from 'node:crypto';

function isValidSignature(secret, timestampHeader, rawBody, signatureHeader) {
  const expected = 'sha256=' + createHmac('sha256', secret)
    .update(`${timestampHeader}.${rawBody}`)
    .digest('hex');
  return expected === signatureHeader;
}
```

Use the **raw** request body (before any JSON parsing) — signing a re-serialized copy will not match.

### Limitations and future work

- No delivery queue: a delivery that fails after its one retry is not attempted again, and there is no way to trigger a manual redelivery from the UI.
- No exponential backoff or dead-letter handling for consistently failing endpoints — a permanently broken subscriber just accumulates `failed` statuses.
- No event history or replay log; only the single most recent `lastDelivery` is kept per subscription.
- No payload customization — every subscriber for a given event receives the same fixed envelope shape.
### Live Walkthrough video
A ZIP file has been added by the name of 'live_walkthrough_video.zip' and this video can also be accessed through a public drive link : https://drive.google.com/file/d/1h5oGtp6IbS4UyRw6Hfek8F8x6shj2RnX/view?usp=sharing
## Community and maintenance

- [Support](SUPPORT.md): questions, bug reports and feature requests.
- [Code of Conduct](CODE_OF_CONDUCT.md): participation and reporting concerns.
- [Security policy](SECURITY.md): private vulnerability reporting and maintenance scope.
- [Changelog](CHANGELOG.md): release status and notable changes.

This is the initial public-source preparation. There are no published stability or long-term support guarantees; review the deployment guide before running an installation with real data.

Licensed under the [MIT License](LICENSE), copyright 2026 Aman Mundra. See [source provenance](PROVENANCE.md) for the project's origins. This source distribution includes no private installation history or customer dataset.

