# Security policy

## Reporting a vulnerability

Do not disclose vulnerability details in a public issue, discussion, pull request or attached log. This includes suspected cross-site data access, authentication bypass, unsafe content rendering and exposed credentials.

**Release preparation: a private reporting contact must be confirmed before publication.** GitHub private vulnerability reporting has not yet been enabled for this repository. Maintainers must replace this paragraph with a working private reporting channel before the initial source release.

A useful private report includes the affected commit or release, a minimal reproduction using fictional data, the expected and observed behavior, likely impact, and relevant environment details. Do not send live credentials or another person's data. Test only systems and data you own or have explicit permission to test.

## Scope and maintenance

CogCMS is preparing its initial public source release. There are no published release support windows or promised long-term maintenance branches yet. Include your exact commit in a report; fixes will target the current development line unless maintainers announce otherwise.

Deployment operators are responsible for their infrastructure, secrets, access controls, backups and dependency updates. See [deployment guidance](docs/DEPLOYMENT.md). The project does not offer a guaranteed security response time or a bug-bounty programme. Maintainers and the reporter should coordinate a fix and disclosure before sharing reproduction details publicly.

## Known dependency advisory

As of 2026-09-25, the production dependency audit reports [CVE-2025-15056 / GHSA-v3m3-f69x-jf25](https://github.com/advisories/GHSA-v3m3-f69x-jf25) in Quill 2.0.3, also attributed to its `react-quill-new` wrapper. GitHub rates the HTML-export issue low severity and lists no patched version. CogCMS sanitizes blog HTML in its rendering pipeline; this does not establish that every editor path is unaffected. Track the upstream advisory and review editor changes before deploying an upgrade. Do not apply a forced dependency downgrade solely to clear an audit count.
