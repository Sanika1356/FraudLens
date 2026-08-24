# FraudLens Security Audit and Hardening Report

## Executive summary

This review assessed the FraudLens repository and the attached security requirements before making changes. FraudLens is a demonstration application for investigator-led fraud review and uses synthetic, non-sensitive records. The application is not suitable for real-customer or regulated data without an independent security review, approved data governance, and production identity, storage, and monitoring configuration.

The most significant confirmed application vulnerability was **cross-organization privilege inheritance**: the FraudLens role was stored in the global `users.role` field, while authorization was evaluated from that field after a user selected any active Clerk organization. A manager or administrator who belonged to multiple organizations could therefore carry that application privilege into every organization. This has been corrected by introducing organization-scoped application roles and resolving the active organization’s role in the authenticated request context.

A second confirmed issue was **fail-open persistence behavior**. Production startup required a database variable, but transaction persistence caught and swallowed database-write errors, and the database helper retained development-style in-memory fallbacks. Production now fails closed when no database connection is configured, and transaction persistence errors are propagated rather than silently ignored.

The repository contains strong existing controls for organization-filtered queries, server-side tRPC gates, private evidence storage, signed download URLs, API-key hashing, webhook allowlists, bounded request parsing, audit events, and CI validation. The remaining risks are primarily deployment- and provider-configuration-dependent: Clerk’s MFA and account-recovery configuration, Supabase bucket policy, a deployment-specific Content-Security-Policy, and a shared production rate-limit store or edge control.

## Architecture and security boundaries

The frontend is a React and TypeScript single-page application. Clerk provides the browser authentication components and session token acquisition. The tRPC client sends a Clerk bearer token to `/api/trpc` and includes browser credentials. The client routes workspace pages only after sign-in and active organization selection; these UI guards are supplementary and are not relied on as the authorization boundary.

The backend is an Express server. It installs Helmet, disables the Express fingerprint header, applies bounded JSON and URL-encoded body parsing, applies a global `/api` IP-based limiter, registers the public REST API, attaches Clerk middleware, registers the private storage proxy, and then exposes the tRPC router. The server also serves the Vite-built client in production. `GET /health` is intentionally unauthenticated for deployment health checks. The backend uses Drizzle ORM with MySQL/TiDB and Supabase Storage through a server-only service-role credential. Optional integrations include Resend, Slack, Teams/Power Automate, Sentry, and the project-owner notification service.

> Every sensitive dashboard operation follows the intended shape: authenticated request, active organization, application-role check, resource lookup scoped to that organization, and operation. The active organization role is now resolved independently of the legacy global user record.

## Authentication mechanisms currently implemented

The dashboard uses Clerk authentication through `@clerk/express` on the server and `@clerk/react` in the browser. The repository delegates sign-in, sign-up, password recovery, session issuance, session expiry, logout, email verification, and enabled social-login flows to Clerk. No local password hashing, password-reset token, refresh-token, or JWT-secret implementation is present in the application code.

The public transaction API uses a separate bearer API-key mechanism. Managers create organization-scoped keys; only a SHA-256 digest, display prefix, scopes, expiry, revocation time, and audit metadata are stored. The plaintext key is returned once at creation. The only supported public scope is `transactions:write`. Requests require a syntactically valid `fl_live_...` bearer credential, an active non-expired non-revoked key, the required scope, and a valid strict Zod payload. The key is rate-limited through organization-independent request-log counts tied to the key ID.

MFA, password policy, recovery-factor policy, breached-password controls, session duration, session revocation semantics, email verification enforcement, and login anomaly detection must be confirmed in the Clerk production instance. They cannot be proven from this repository alone.

## API and route inventory

The unauthenticated operational surface consists of `GET /health`, `GET /api/v1`, `GET /api/v1/docs`, and the tRPC `system.health` and `auth.me` procedures. `auth.me` returns the local authenticated user when a valid context exists and otherwise returns null; it does not enumerate users. `GET /api/v1` and `/api/v1/docs` expose only public API metadata. `POST /api/v1/transactions/assess` is authenticated by the organization-scoped API-key mechanism and returns assessment metadata only.

| Router            | Procedures                                                                                                                                                                                                                         | Required server-side access                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `system`          | `health`, `notifyOwner`                                                                                                                                                                                                            | Public health; owner notification requires FraudLens administrator status, active organization, and Clerk `org:admin` membership |
| `auth`            | `me`                                                                                                                                                                                                                               | Public procedure; response is null or the current local user                                                                     |
| `notifications`   | `get`, `update`, `testAlert`                                                                                                                                                                                                       | Manager or administrator plus active organization                                                                                |
| `weeklySummaries` | `get`, `update`                                                                                                                                                                                                                    | Manager or administrator plus active organization                                                                                |
| `apiKeys`         | `list`, `create`, `revoke`, `requestLogs`                                                                                                                                                                                          | Manager or administrator plus active organization                                                                                |
| `audit`           | `list`                                                                                                                                                                                                                             | Manager or administrator plus active organization                                                                                |
| `administration`  | `directory`, `invite`, `updateOrganizationRole`, `updateFraudLensRole`, `deactivateMember`, `revokeSessions`, `revokeInvitation`                                                                                                   | FraudLens administrator plus Clerk `org:admin` membership and active organization                                                |
| `reports`         | `overview`, `downloadCsv`, `downloadSummary`                                                                                                                                                                                       | Manager or administrator plus active organization                                                                                |
| `risk`            | `overview`, `list`, `detail`, `assess`, `updateCase`, `evidenceStorageStatus`, `collaboration`, `addComment`, `setTags`, `addEvidenceLink`, `uploadEvidenceAttachment`, `assignees`, `claimCase`, `summarize`, `persistenceStatus` | Authenticated analyst, manager, or administrator plus active organization                                                        |
| `risk`            | `importCsv`, `updateWorkflow`, `workload`, `modelHealth`, `drift`                                                                                                                                                                  | Manager or administrator plus active organization                                                                                |
| `storage`         | `GET /storage/*`                                                                                                                                                                                                                   | Valid Clerk user, active organization, organization-prefixed storage key, and matching attachment record                         |

The public API also applies the global `/api` limiter before route handling. The per-key public API limit is shared through database request logs, while the global IP limiter is process-local.

## Database tables and ownership relationships

| Table                      | Sensitive content                                                     | Ownership relationship and enforcement                                                                                                       |
| -------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                    | Clerk identity, name, email, login method, legacy role                | Global identity record keyed by Clerk `openId`; its legacy role is not used for production authorization after this hardening                |
| `organizationRoles`        | FraudLens application role                                            | New table keyed by `(orgId, openId)`; the active organization’s mapping is used by request authorization                                     |
| `transactions`             | Risk inputs, scores, rationale, case status, notes, assignee metadata | Tenant-owned by `orgId`; `(orgId, reference)` is unique                                                                                      |
| `caseNotes`                | Investigator comments and author metadata                             | Tenant- and case-owned by `(orgId, transactionId)`                                                                                           |
| `caseTags`                 | Case labels                                                           | Tenant- and case-owned by `(orgId, transactionId)`                                                                                           |
| `caseEvidence`             | External links and attachment metadata/storage keys                   | Tenant- and case-owned by `(orgId, transactionId)`; attachment downloads additionally require an exact active-organization storage-key match |
| `auditEvents`              | Security and workflow activity                                        | Append-only application records filtered by `orgId`                                                                                          |
| `notificationPreferences`  | Recipients and webhook URLs                                           | One configuration per `orgId`; returned only to manager-level procedures                                                                     |
| `outcomeFeedback`          | Human-confirmed case outcomes and classifications                     | Tenant-owned by `orgId`; unique per organization and transaction                                                                             |
| `apiKeys`                  | Key prefix, digest, scopes, lifecycle timestamps                      | Tenant-owned by `orgId`; plaintext secrets are never persisted                                                                               |
| `apiRequestLogs`           | Key/organization, endpoint, status, reference, risk level, timestamps | Tenant-owned by `orgId`; request bodies are not retained                                                                                     |
| `weeklySummaryPreferences` | Report recipient and enablement                                       | One configuration per `orgId`                                                                                                                |
| `weeklySummaryDeliveries`  | Recipient, period, delivery ID, timestamps                            | Tenant-owned by `orgId`; one delivery per organization and period                                                                            |
| `modelMetricSnapshots`     | Aggregate model-quality metrics                                       | Carries `orgId`; manager-only view                                                                                                           |
| `driftSnapshots`           | Aggregate feature-drift values                                        | Carries `orgId`; manager-only view                                                                                                           |

The repository does not define foreign-key constraints or row-level security policies in Drizzle. Tenant isolation is implemented through server-side procedure gates and organization-filtered query helpers. Production database permissions and backups should therefore be configured so the application account cannot bypass the intended application boundary unnecessarily.

## Storage and fraud-evidence review

Evidence uploads are accepted only through an authenticated organization procedure. The backend validates the filename, extension/MIME agreement, base64 syntax, maximum size of 5 MB, UTF-8 content for text/CSV, and magic bytes for PDF, PNG, and JPEG. Storage keys are generated server-side under `evidence/<encoded-orgId>/<transactionId>/...`, normalized to reject empty, dot, dot-dot, and backslash path segments, and suffixed with a random value to avoid object-name collisions.

The configured Supabase bucket is intended to be private. The server uses the Supabase service-role key only in backend code, creates a 60-second signed URL clamped to 10–300 seconds, and redirects through `/storage/*` only after checking the active Clerk organization and a matching attachment row. The tRPC router has no user-controlled evidence-delete procedure. Storage deletion is used only as cleanup if an upload succeeds but its database record cannot be written.

The Supabase dashboard policy cannot be verified from the repository. Before production use, confirm that the evidence bucket is private, public listing is disabled, service-role credentials are restricted to the backend, and any existing public object URLs are revoked or removed.

Saved external evidence links are intentionally supported and must remain treated as untrusted content. The interface now warns that external destinations leave FraudLens and adds explicit `noopener` isolation to new-tab links. The server accepts HTTPS links but does not claim that an arbitrary HTTPS host is trusted.

## Findings before hardening

| ID     | Severity | Finding                                                                                                                                                                 | Status                                                                                                                                |
| ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | High     | FraudLens application roles were global in `users.role`; manager/admin access could carry into another organization where the same user was a Clerk member.             | Fixed with `organizationRoles`, active-organization role resolution, and organization-scoped directory/role updates                   |
| SEC-02 | Medium   | Transaction persistence caught database-write failures and continued, which could create a false impression that a case or assessment was durably stored.               | Fixed by propagating transaction persistence failures                                                                                 |
| SEC-03 | Medium   | Production database absence was not independently fail-closed in the database helper, despite startup validation.                                                       | Fixed: `getDb()` now throws in production without `DATABASE_URL`; development/test fallback remains available only outside production |
| SEC-04 | Medium   | The project-owner notification procedure used a global administrator gate rather than requiring an active organization and Clerk organization administrator membership. | Fixed by moving it to the organization-administrator procedure, bounding input, and recording a minimal audit event                   |
| SEC-05 | Medium   | Content Security Policy was disabled because the current frontend/authentication flow needs a deployment-specific allowlist.                                            | Not changed blindly; requires staging compatibility work and a reviewed CSP policy                                                    |
| SEC-06 | Medium   | The general `/api` IP limiter is in-memory and therefore does not provide a single shared budget across horizontally scaled instances.                                  | Not fully fixed; public API per-key limiting remains database-backed. Add a shared limiter or edge/WAF control before scaling         |
| SEC-07 | Low      | Password-reset, MFA, email-verification, session-expiry, brute-force, and login-anomaly controls are provider-managed and are not verifiable from source.               | Requires Clerk production configuration and operational verification                                                                  |
| SEC-08 | Low      | Arbitrary HTTPS evidence links can point to phishing destinations.                                                                                                      | Reduced with an in-app warning and `noopener`; destination trust still requires investigator judgment or an approved-host policy      |

No committed `.env`, private-key, credential, or token-named files were found in the repository history scan. The checked-in `.env.example` contains placeholders and documentation only. Secret values were not included in this report or generated files.

## Fixes implemented

The authorization hardening adds the `organizationRoles` table and migration `0012_tranquil_retro_girl`. On authenticated organization requests, the server resolves or initializes the user’s FraudLens role for the active organization. Production tRPC gates use that resolved role and do not use the legacy global `users.role` field. Administrator role changes now update only the selected organization mapping after re-validating that the target is an active Clerk organization member. Workspace-directory display uses the same mapping.

The persistence hardening makes missing production database configuration an error and makes transaction persistence failures visible to the request rather than silently swallowed. This preserves the database-free behavior used by local development and tests without allowing production to pretend that writes succeeded.

The owner-notification procedure now requires an active organization, manager-level application authorization through the administrator procedure, and Clerk organization administrator membership. Its input is bounded and the event records only delivery status and actor metadata, not the notification body.

The frontend now labels saved evidence destinations as external and uses `rel="noreferrer noopener"` on new-tab evidence links. Package hardening removed the unused direct Axios dependency, upgraded the AWS SDK, tRPC, Drizzle ORM, and Streamdown packages, and aligned the tRPC client versions.

## Files changed

| Area                          | Files                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Authorization and persistence | `server/_core/context.ts`, `server/_core/trpc.ts`, `server/adminManagement.ts`, `server/db.ts`, `server/_core/systemRouter.ts` |
| Data model and migration      | `drizzle/schema.ts`, `drizzle/0012_tranquil_retro_girl.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0012_snapshot.json`   |
| Tests                         | `server/auth.protection.test.ts`                                                                                               |
| Frontend safety messaging     | `client/src/pages/FraudLensPages.tsx`                                                                                          |
| Dependency hardening          | `package.json`, `pnpm-lock.yaml`                                                                                               |
| Operations documentation      | `README.md`, `docs/ADMINISTRATOR_GUIDE.md`                                                                                     |

## Tests and validation

| Check               | Result                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`        | Passed                                                                                                                                                                                                                                                                                                  |
| `pnpm test`         | Passed: 6 test files, 61 tests                                                                                                                                                                                                                                                                          |
| `pnpm build`        | Passed: Vite client and bundled Express server built successfully                                                                                                                                                                                                                                       |
| `pnpm format:check` | Passed                                                                                                                                                                                                                                                                                                  |
| `git diff --check`  | Passed                                                                                                                                                                                                                                                                                                  |
| `pnpm audit --prod` | Improved from 81 advisories with 1 critical and 21 high before dependency changes to 14 advisories with 0 critical, 4 high, 8 moderate, and 2 low after targeted changes; the command still exits nonzero because remaining advisories require additional major upgrades or upstream dependency changes |

New security coverage verifies that an active organization role overrides a stale global role, and that analyst, manager, or Clerk organization-member-admin contexts cannot invoke the owner-notification procedure. Existing tests continue to cover unauthenticated access, missing organization context, cross-organization transaction isolation, evidence/collaboration isolation, role gates, API-key isolation, invalid uploads, and organization-scoped audit and reporting behavior.

## Remaining risks and manual actions

First, apply the new Drizzle migration to each production database during an approved change window. After migration, the configured bootstrap owner should review and reassign every existing non-owner manager or administrator in each organization. Existing global role values are intentionally not imported automatically because doing so could recreate cross-organization privilege inheritance.

Second, configure Clerk production controls. Require email verification where appropriate, enable MFA or stronger authentication for administrators and managers, set session lifetime and reauthentication rules for sensitive changes, verify password-reset links are single-use and short-lived, enable account-protection and rate-limit controls, and test logout and member-session revocation in a staging organization.

Third, keep Supabase evidence storage private and validate object policies from the Supabase dashboard. Rotate any service-role key, webhook, Resend key, Clerk secret, database credential, Sentry auth token, or notification-service credential if it has ever been exposed outside the intended secret manager. No such values were found in the repository scan.

Fourth, add a deployment-specific Content-Security-Policy in staging after enumerating Clerk, font, Sentry, and application origins. Do not enable a permissive wildcard policy merely to clear the finding. Verify that the policy blocks inline script injection without breaking sign-in or the dashboard.

Fifth, use a shared rate-limit store or a trusted edge/WAF limiter before running multiple application instances. Keep the database-backed per-key public API limit, and monitor failed authentication, permission failures, reset requests, API abuse, suspicious storage access, role changes, and webhook delivery failures without logging credentials, tokens, request bodies, or unnecessary personal data.

The dependency audit still reports four high, eight moderate, and two low production advisories. The remaining high findings include route-pattern DoS exposure through the current Express dependency chain, lodash/lodash-es advisories in chart/parser dependency paths, and a nanoid advisory. The current application does not pass attacker-controlled template keys to lodash, does not use negative nanoid sizes, and does not expose arbitrary route construction, but the dependency tree should be revisited in a planned upgrade. Do not claim the application is fully secure solely because these code paths appear non-reachable.

## Deployment checklist

| Check           | Required before production                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository      | Confirm no `.env`, private key, credential, token, database URL, or service-role value is committed; keep secret scanning enabled                                                          |
| Database        | Apply migration `0012_tranquil_retro_girl`; use TLS; restrict database permissions; verify backups and restore procedures                                                                  |
| Organizations   | Verify every workspace member is present in Clerk; review organization membership roles and FraudLens application roles independently                                                      |
| Clerk           | Configure allowed origins and redirect URLs for the exact HTTPS domain; require verification/MFA according to risk; test reset, logout, expiry, and revocation                             |
| Storage         | Confirm the evidence bucket is private, listing is disabled, service-role key is server-only, signed URLs are short-lived, and object access is organization-scoped                        |
| Transport       | Serve only HTTPS; verify HSTS, secure cookies, referrer policy, frame protection, content-type protection, and the final CSP in staging                                                    |
| Rate limiting   | Configure a shared limiter or WAF policy; keep the public API per-key limit and test 429 behavior                                                                                          |
| Notifications   | Verify Resend sender/domain, Slack/Teams webhook rotation policy, recipient authorization, and the warning that external evidence links are untrusted                                      |
| Observability   | Enable privacy-safe monitoring and alerts for failed login/authorization, role changes, storage denials, API abuse, and delivery failures; never send secrets or raw personal data to logs |
| Release gates   | Require formatting, type check, tests, build, dependency review, migration review, and an independent security review before loading real customer data                                    |
| Data governance | Obtain legal/compliance approval for retention, access, export, deletion, backup, and incident-response procedures                                                                         |

## References

[1]: README.md "Project architecture, deployment, production hardening, monitoring, and limitations"
[2]: server/_core/context.ts "Clerk identity and active-organization request context"
[3]: server/_core/trpc.ts "Server-side authentication, role, and organization middleware"
[4]: server/routers.ts "tRPC procedure inventory, validation, and case/evidence operations"
[5]: server/publicApi.ts "Public REST API authentication, validation, rate limiting, and response fields"
[6]: server/storage.ts "Private evidence storage keys and signed URL handling"
[7]: server/_core/storageProxy.ts "Private evidence download authorization"
[8]: server/db.ts "Organization-scoped persistence helpers"
[9]: drizzle/schema.ts "Database tables and ownership fields"
[10]: server/_core/security.ts "Helmet, body limits, proxy handling, and global API rate limiting"
[11]: docs/ADMINISTRATOR_GUIDE.md "Operator controls, secrets, and workspace roles"
[12]: docs/OPERATIONS.md "Retention, backups, and recovery"
[13]: package.json "Dependency declarations"
[14]: pnpm-lock.yaml "Locked dependency tree used for the production audit"
