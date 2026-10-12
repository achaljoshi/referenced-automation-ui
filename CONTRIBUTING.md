# Contributing to referenced-automation-ui

The shared rules (tests with negative controls, no hard waits, no secrets, ADRs, review checklist, deprecation policy) are in
[`referenced-automation-utils/docs/governance/CONTRIBUTING.md`](../referenced-automation-utils/docs/governance/CONTRIBUTING.md).
Release and upgrade steps: [`RELEASING.md`](../referenced-automation-utils/docs/governance/RELEASING.md). Decisions: [`docs/adr`](../referenced-automation-utils/docs/adr/README.md).

## Before you push
```bash
npm run lint && npm run typecheck && npm test && npm run security
```
(Windows PowerShell 5.1 has no `&&`: run the four commands on separate lines, or use PowerShell 7.)

A new environment variable, or a changed default, goes into `.env.example` (all the metadata lines), the README "Configuration reference" table and, for a secret, `.env.local.example`; `tests/envDocs.spec.ts` fails until they agree with the code. In examples, use `npm run codegen-to-tests -- <recording>` inside this repo (`npx ui-codegen-to-playwright` works only from a project that depends on this package), show a PowerShell form beside any POSIX `NAME=value command` line, and select test files with forward slashes (`tests/windowsDocs.spec.ts` checks this).

Update `CHANGELOG.md`. This repo is in the chain `utils` -> `api`/`ui` -> `sap` -> `ui-api`: repackage after a change and re-test `sap` and `ui-api`.
