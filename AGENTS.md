# Contributor instructions

This repository is a reusable multi-site CMS. Keep contributions scoped to their issue or agreed proposal. `ASSIGNMENT.md` is an optional exercise, not the scope of the product.

- Read `README.md` and `docs/ARCHITECTURE.md` before editing. Preserve active-site isolation and the existing `/api/v1` consumer contract.
- Every `/api/admin/*` handler uses `withAdmin`; every `/api/v1/*` handler uses `requireApiKey` and a published-only filter. Content models carry `siteId` and slugs are unique per site.
- Do not add real data, credentials, `.env` values or deployment links. Use the disposable local demo database.
- Write focused tests for changed behavior. Run `npm run typecheck`, `npm test` and `npm run build` sequentially; report exact results and existing failures.
- New dependencies are optional. Explain any addition and the simpler alternative in your PR.
- Use your own isolated resources for deployment verification. Never operate another installation or use maintainer credentials. Review and submit changes through a PR using the template.
