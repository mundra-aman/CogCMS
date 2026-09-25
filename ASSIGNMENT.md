# Assessment: server-side admin blog list

**Timebox:** approximately four hours of implementation. Stop at the timebox and document unfinished work. Report setup problems separately from implementation time. No deployment or paid service is required.

## Task

Improve the admin blog list so search, status filtering and pagination happen on the server. The current page fetches every full blog document and filters the array in the browser. Preserve authentication, active-site isolation and existing editor/delete links.

## Acceptance criteria

- `GET /api/admin/blogs` accepts `page` (default 1), `limit` (default 20, maximum 100), `search` (trimmed, maximum 100 characters) and `status` (`all`, `draft`, `publish`; default `all`). Invalid values return HTTP 400 through the existing error format. Pagination integers and calculated offset must be safe integers.
- Search is case-insensitive **literal substring** matching on title, slug or tag. Empty search means no search restriction. `a+b` is literal text, not a caller-supplied regular expression.
- Preserve ordering by `createdAt` descending, then `_id` descending. Scope both results and counts to the server-resolved active site. Client parameters cannot override that scope.
- Return `{ data, meta: { page, limit, total, totalPages } }`. `total` counts records matching the current site and filters. Empty results have `total: 0`, `totalPages: 0`, `data: []`. A page beyond the last returns an empty array with the requested page and accurate metadata.
- List rows contain only `_id`, `title`, `slug`, `status`, `tag` and `createdAt`. Do not fetch article bodies or rendered snapshots for this screen. Explain how the query enforces this.
- Show previous/next controls and result counts. Reset to page 1 after search/status changes. Handle loading, empty and retryable error states. Ignore superseded responses, including when the active site changes.
- After successful deletion, refresh the current query and recover to a valid page if the last item disappeared. A failed deletion leaves the row available and explains the error.
- Update callers and tests for the new response contract. Do not change `/api/v1` consumer contracts or paginate unrelated screens.

The local seed creates 48 fictional blogs across two fictional sites, mixed statuses, duplicate titles, tied timestamps and literal search punctuation. Only authorized users may access a site's data.

## Verification and submission

Add focused tests for input boundaries, literal search, status filters, stable ordering, empty and out-of-range pages, omitted body fields, and two-site isolation of both data and counts. Explain how you checked stale requests and post-deletion behavior in the UI; screenshots or a short recording help.

Run and report `npm run typecheck`, `npm test` and `npm run build`. Report failures honestly, including whether you can reproduce them on the supplied starting commit. Do not weaken tests or increase timeouts to hide a failure.

Use existing patterns where appropriate. New dependencies are optional, not a scoring requirement. Explain any added dependency, the simpler alternative and why the cost is justified. No particular query implementation or index is prescribed; justify your choice and its limits.

Open a PR against the base branch supplied by the maintainer. Use the PR template to explain the data flow, technical decisions, alternative, verification, trade-offs, AI/tool use and time spent. AI assistance is permitted; you must be able to explain and change your submission.
