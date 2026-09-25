# Contributing to CogCMS

Bug fixes, documentation, accessibility work and product improvements are welcome. Participation follows our [Code of Conduct](CODE_OF_CONDUCT.md). For setup questions, see [Support](SUPPORT.md). Report vulnerabilities through the [security policy](SECURITY.md), without posting exploit details in public issues or pull requests.

## Before you start

Search existing issues and pull requests first. Use the bug-report form for a reproducible defect, or the feature-request form to explain a new need. Discuss substantial behavior, schema, dependency or architecture changes before investing in an implementation. Small, focused fixes can go straight to a pull request.

## Set up and make a change

1. Fork [CogCMS](https://github.com/mundra-aman/CogCMS), clone your fork, and create a branch from `main`, for example `git switch -c fix/short-description`.
2. Follow [local setup](README.md#local-setup): Node 22, npm and a local MongoDB replica set. Use the fictional demo data and your own local credentials. Cloud accounts and paid services are not required.
3. Read [architecture](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md). Keep the patch focused. Preserve site isolation, published-only consumer reads and the `/api/v1` contract.
4. Add a regression test for a bug fix or focused tests for changed behavior. Update affected documentation. Explain database/index changes and any compatibility or migration requirements.

## Verify your work

Run these from the repository root, in order:

```sh
npm run typecheck
npm test
npm run build
```

Integration tests create a disposable MongoDB replica set; they do not use your application database. The test runner may download MongoDB if it is not cached. Run a relevant subset while iterating, for example `npm run test:unit -- scripts/seed-demo.test.ts`, then run the full checks before submitting code changes. Documentation-only changes need link, wording and formatting checks rather than unrelated application tests.

Use the existing Prettier configuration on files you change. Avoid formatting the entire repository in an unrelated patch. For UI changes, check keyboard use, narrow screens and relevant empty/error states; include screenshots using fictional data.

## Submit and review

Open a pull request from your branch to `main` and fill out the PR template. Include the related issue, what changed, exact checks and results, and known limitations. Distinguish an environment or starting-commit failure from a failure introduced by your change. Do not include credentials, real customer records, local environment files, provider linkage or build output.

Maintainers assess behavior, site isolation, compatibility, tests and clarity. They may ask for revisions, defer a proposal or close work outside the project's scope. An open issue or passing CI does not guarantee acceptance. Maintainers decide when to merge; there is no guaranteed review time.

Disclose material AI/tool assistance and verify its output. You remain responsible for understanding and maintaining the submitted code. Submit only material you have the right to contribute, preserve third-party notices, and use this project's [MIT licence](LICENSE) for your contribution. There is currently no separate CLA or DCO signing process.

The optional [assignment](ASSIGNMENT.md) has additional timebox and submission instructions. It is one contribution path, not a requirement for participation.
