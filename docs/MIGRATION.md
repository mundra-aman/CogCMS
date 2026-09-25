# Legacy website migration

`npm run migrate:website` is an optional adapter for the legacy CogNerd website schema. It is not a general WordPress or arbitrary MongoDB importer. Inspect `scripts/migration/types.ts`, `scripts/migration/prepare.ts` and `scripts/migrate-from-website.ts` before using it. Source collections retain their legacy `cognerd-*` names; those names describe the format, not a configured database target.

Use a read-only source credential and a separate target database. Supply these through the environment or an ignored local `.env`:

- `SOURCE_MONGODB_URI`: read-only source, including its database name.
- `MONGODB_URI` and `MONGODB_DB_NAME`: explicit target connection/database.
- `MIGRATION_SITE_SLUG`, `MIGRATION_SITE_NAME`, `MIGRATION_SITE_ORIGIN`: target site identity and HTTP(S) origin. `--site` may override the slug. There is no company target default.
- `RELEASE_NOTES_DIR` and `WHITEPAPERS_DIR`: Markdown input directories required when their respective groups are selected. The default selects both groups.
- Optional `FAQ_SEED_JSON`: an authoritative fictional or operator-approved FAQ array. Supplying it also removes target FAQs for that site that are absent from the supplied array; omit it to retain source-collection behavior.

Start with `npm run migrate:website -- --dry-run` after supplying both Markdown directories, or select only the available inputs, for example `npm run migrate:website -- --dry-run --only authors,posts`. `--only` accepts a comma-separated subset of `authors,posts,whitepapers,faqs,faq-submissions,subscribers,release-notes`. Inspect counts and warnings before applying without `--dry-run`, then run `npm run ensure:indexes` and check content in the CMS and consumer website.

The adapter checks source/target identity, validates selected input and target collisions before writing, and preserves document identities on rerun. Existing target-site settings are preserved. The whole import is not one transaction: a runtime interruption can leave partial progress. Back up the target, stop competing editorial writes, and validate reruns before use with valuable data. Never infer successful website publication from import counts alone.
