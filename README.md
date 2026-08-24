# FraudLens

**FraudLens** is a transaction-risk intelligence workspace for investigator-led fraud review. It brings prioritised alerts, transparent scoring, case decisions, evidence, and model-health context into one focused analyst console.

> **Demonstration only.** FraudLens uses synthetic UI records and non-sensitive inputs. It is not a production fraud-decision system, does not use real customer data, and must not be used as the sole basis for account restrictions or other high-impact decisions.

## Product capabilities

| Capability             | What it demonstrates                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Command Center         | Priority review queue, high-risk alert emphasis, open-case counts, and assessed activity overview                      |
| Instant Assessment     | Immediate risk probability, low/medium/high label, contributing signals, and reviewer-friendly rationale               |
| Transaction History    | Filters for risk level, case outcome, merchant category, and date range; refreshes periodically for new alerts         |
| Casework               | Investigation notes and controlled case outcomes: under review, confirmed fraud, or legitimate                         |
| Investigator Summaries | Clear risk-factor rationale and concise, review-ready next-step guidance                                               |
| Model Health           | Precision, recall, F1 score, PR-AUC, decision threshold, and confusion-matrix counts from a public evaluation artifact |
| Drift Monitor          | Baseline-versus-recent comparisons for amount, new-device rate, cross-border rate, and night-time activity             |

## Technical architecture

```text
React + TypeScript dashboard
        │
        ├── tRPC client and typed mutations/queries
        │
Express + tRPC server
        ├── deterministic risk engine
        ├── investigator-summary service with safe fallback guidance
        ├── model-health and drift data contracts
        └── Drizzle query helpers
                │
          MySQL / TiDB database
          transactions · case notes · metrics · drift snapshots
```

The user-facing manual score is intentionally **deterministic and transparent**, based on displayed evidence such as unusual amount, new device, country mismatch, velocity, and unusual time. The evaluation page is deliberately separated from this policy score because the public benchmark contains anonymized numerical features and cannot support realistic merchant, country, or device explanations.

## Public model-evaluation artifact

The model-health view displays a reproducible Logistic Regression baseline trained against a sampled evaluation of the [OpenML 42175 anonymized credit-card benchmark](https://www.openml.org/d/42175). The training script is located outside the deployed web application at `/home/ubuntu/fraudlens-ml/train_fraudlens_metrics.py`; it exports aggregate metrics only and never places raw benchmark records in the web UI.

The baseline uses robust scaling, class balancing, and a threshold selected on a separate calibration split. Current evaluation values shown in the application are **precision 0.398**, **recall 0.823**, **F1 0.537**, and **PR-AUC 0.607** on a 120,000-row sample containing 247 positive examples. These values are useful for demonstrating methodology and trade-offs; they are not a claim of production readiness.

## Administrator documentation

The consolidated [administrator guide](./docs/ADMINISTRATOR_GUIDE.md) covers local setup, environment variables, deployment, Clerk organization roles, investigator workflow, API keys and request examples, notification channels, weekly summaries, reporting, and troubleshooting. Use the [production operations runbook](./docs/OPERATIONS.md) for retention, backups, and disaster recovery.

## Local development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Before starting the application, add your Clerk publishable key and secret key to the local `.env` file. Set both `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` to the publishable key; the former is used by the React client and the latter by the Express middleware. Set `CLERK_SECRET_KEY` only on the server. The `.env` file is ignored by Git and must never be committed. The `pnpm dev` command works unchanged in Windows PowerShell, macOS, and Linux.

Authentication is required for every FraudLens workspace route and risk-management API. Clerk provides sign-up, sign-in, password recovery, and any enabled social-login flow at `/sign-in` and `/sign-up`. FraudLens application roles are stored per Clerk organization in the `organizationRoles` table; the legacy global role field on `users` is not an authorization source.

Run type validation and tests with:

```bash
pnpm check
pnpm test
```

## Key routes

| Route           | Purpose                                 |
| --------------- | --------------------------------------- |
| `/`             | Command Center                          |
| `/transactions` | Filterable transaction history          |
| `/assess`       | Manual instant assessment               |
| `/casework`     | Review workflow and case notes          |
| `/model-health` | Evaluation metrics and confusion matrix |
| `/drift`        | Data-drift monitoring                   |

## Product design notes

FraudLens is designed around a few practical review principles:

1. **Evidence before outcome:** Risk levels support review; they do not replace the investigator’s final decision.
2. **Metrics with context:** The Model Health view exposes precision, recall, F1, PR-AUC, and the confusion matrix instead of relying on accuracy alone.
3. **Clear separation:** The transparent assessment policy and anonymized benchmark evaluation are shown as distinct evidence sources.
4. **Focused workflow:** The workspace captures case notes, updates alert queues, validates analyst input, and surfaces input-distribution changes for review.

## Deploying on Railway

FraudLens includes a [`railway.toml`](./railway.toml) configuration for Railpack builds, database migrations before each release, a production start command, safe restart behavior, and a `/health` endpoint that returns HTTP 200. Railway must build with the same `VITE_CLERK_PUBLISHABLE_KEY` used by the client and run with the server-only variables below. Add these in **Railway → Project → Service → Variables**; never commit them to Git.

| Variable                     | Required | Purpose                                                                      |
| ---------------------------- | -------: | ---------------------------------------------------------------------------- |
| `VITE_CLERK_PUBLISHABLE_KEY` |      Yes | Clerk public key compiled into the React client during the Railway build.    |
| `CLERK_PUBLISHABLE_KEY`      |      Yes | Clerk publishable key used by the Express authentication middleware.         |
| `CLERK_SECRET_KEY`           |      Yes | Server-only Clerk secret key.                                                |
| `OWNER_OPEN_ID`              |      Yes | Clerk user ID that receives the initial administrator role.                  |
| `DATABASE_URL`               |      Yes | TiDB Cloud MySQL connection string, including its TLS parameters.            |
| `SUPABASE_URL`               |      Yes | Supabase project URL for private evidence storage.                           |
| `SUPABASE_SERVICE_ROLE_KEY`  |      Yes | Server-only Supabase service-role key.                                       |
| `SUPABASE_STORAGE_BUCKET`    |      Yes | Private evidence bucket name, normally `fraudlens-evidence`.                 |
| `RESEND_API_KEY`             |       No | Enables email alerts and weekly risk summaries.                              |
| `RESEND_FROM_EMAIL`          |       No | Verified Resend sender; omit it for limited `onboarding@resend.dev` testing. |
| `MANAGER_OPEN_IDS`           |       No | Comma-separated Clerk user IDs that should start with manager access.        |

To release, create a Railway project from the GitHub repository and select the `main` branch. The checked-in deployment configuration performs `pnpm install --frozen-lockfile && pnpm build`, then applies committed Drizzle migrations before it starts the production server. Generate a Railway domain after the first successful deployment. For a custom domain, add it under the service's networking settings, then create the DNS record Railway provides and add the final `https://` domain to Clerk's production allowed origins and redirect URLs.

> **Cost safeguard:** Railway's free plan and trial limits can change. Before enabling a service, confirm the active plan, configure a Compute Usage hard limit in Railway's Workspace Usage settings, and enable Serverless/app sleep if cold starts are acceptable. A hard limit stops the workload when the threshold is reached. Consult Railway's current [pricing](https://railway.com/pricing) and [cost-control documentation](https://docs.railway.com/pricing/cost-control) before release.

After deployment, verify the Railway domain returns `{"status":"ok"}` at `/health`, sign in through Clerk, create or select an organization, review a dashboard route, and confirm a public API request or scheduled summary only after its secrets are configured. Railway will not direct traffic to a new deployment until the configured health endpoint returns HTTP 200.[^railway-health]

[^railway-health]: [Railway health checks](https://docs.railway.com/deployments/healthchecks)

## Production hardening and recovery

FraudLens applies production-safe HTTP headers, removes the Express fingerprint header, uses bounded API request parsing, limits `/api` traffic by client IP, retains the existing per-key public API limit, scopes application roles to the active organization, and refuses production startup when its database or required Clerk variables are missing. The `0012_tranquil_retro_girl` migration creates the organization-role table; deploy it before relying on dashboard-managed role changes. The full [production operations runbook](./docs/OPERATIONS.md) explains the security variables, immutable audit-log handling, TiDB Cloud export procedure, and a tested restore-to-new-instance recovery process.

The case queue now supports saved private or shared views, organization-scoped SLA states (`on track`, `due soon`, `overdue`, and `no deadline`), and richer event-type labels in the case activity timeline. Public API clients may send an `Idempotency-Key` header; an identical request replays its successful response for 24 hours, while a changed payload using the same key is rejected. The API integrations page also summarizes recent accepted, rejected, duplicate, and rate-limited attempts.

Transaction detail now includes explainable related activity based on synthetic merchant-category, country-route, and device-cohort signals. Assessments also expose separate operational policy signals without changing the authoritative model score. Managers can use the Model Health threshold simulator to preview queue-volume and reviewed-outcome tradeoffs; it never changes the live threshold. The `0014_fantastic_sumo` migration creates the related-activity tables and persists policy signals.

The Security Center provides manager-level visibility into masked API-key inventory, notification destination hostnames, recent security events, and the last recorded access review. Only a FraudLens administrator who is also a Clerk organization administrator can record an access review. The page intentionally reports provider-managed MFA/recovery and shared-rate-limit actions as deployment follow-ups rather than claiming they are enforced by application code.

Transaction imports now use a preview-first workflow. Managers can inspect ready, invalid, and duplicate row counts plus sample risk outcomes before committing. The commit is bound to a SHA-256 hash of the previewed file, so changing the file after preview requires a new preview. Recent import batches are retained as organization-scoped metadata without storing raw CSV contents. Migration `0015_curvy_mentor` creates the import-batch table.

> **Operational and compliance note:** These controls reduce common deployment risk, but do not by themselves make a demonstration application suitable for regulated or real-customer data. Retention and preservation requirements require approval from the organization’s legal or compliance reviewer.

## Monitoring with Sentry

FraudLens supports optional, privacy-safe monitoring through Sentry. The client and server initialize independently only when their DSNs are configured, so the application continues to run normally without Sentry. The checked-in configuration captures unhandled React, React Query, Express, tRPC, and public-API failures, sends a small sample of performance traces, and records fixed-metadata server error logs. Sentry's Developer plan is currently **$0** for one user and includes Error Monitoring, Tracing, email alerts, and up to 10 custom dashboards; confirm its current limits and avoid upgrading or enabling paid overages if you need to remain on the free tier.[^sentry-pricing]

> **Privacy policy enforced in code:** FraudLens disables automatic user information, cookies, HTTP headers, HTTP bodies, URL query parameters, stack-frame local variables, and session breadcrumbs. A second filter removes user, request, and arbitrary diagnostic payloads from every captured event and redacts email addresses, Bearer credentials, query values, and sensitive attribute names before delivery. Do not add transaction data, names, email addresses, API keys, webhook URLs, or raw request objects to Sentry context.

| Variable                                                       | Scope                   |                    Required | Purpose                                                                                                                                                    |
| -------------------------------------------------------------- | ----------------------- | --------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_SENTRY_DSN`                                              | Client-visible          | Yes, for browser monitoring | DSN for a Sentry React project. A DSN is safe to expose in the browser; it identifies the reporting destination but does not grant project administration. |
| `SENTRY_DSN`                                                   | Server-only             |  Yes, for server monitoring | DSN for a separate Sentry Node/Express project.                                                                                                            |
| `VITE_SENTRY_ENVIRONMENT` / `SENTRY_ENVIRONMENT`               | Client / server         |                          No | Environment label, such as `production`.                                                                                                                   |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_TRACES_SAMPLE_RATE` | Client / server         |                          No | Decimal trace sample rate between `0` and `1`; FraudLens defaults to `0.1` in production and `0` outside it.                                               |
| `VITE_SENTRY_RELEASE` / `SENTRY_RELEASE`                       | Client / server / build |                          No | Shared release name, such as `fraudlens@<commit-sha>`. Set both values to match uploaded browser source maps to client events.                             |
| `SENTRY_ORG` and `SENTRY_PROJECT`                              | Build-only              |                          No | Organization and React project slugs used only for source-map upload.                                                                                      |
| `SENTRY_AUTH_TOKEN`                                            | Build-only, secret      |                          No | Sentry organization or personal token with the documented source-map upload permissions. Never use a `VITE_` prefix or commit this value.                  |

To activate monitoring, create two projects in your Sentry account: a **React** project for the client and a **Node/Express** project for the server. Copy the React project DSN into `VITE_SENTRY_DSN` and the server project's DSN into `SENTRY_DSN`. Add the same values to Railway service variables. Set both environment labels to `production` and begin with the default `0.1` trace rate to minimize free-tier event volume. Sentry documents both browser and Node initialization, including the requirement that each SDK initializes before the rest of the corresponding application entry point.[^sentry-react] [^sentry-node]

For readable production browser stack traces, create a source-map upload token in Sentry with **Project: Read & Write** and **Release: Admin** permissions. Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and the React `SENTRY_PROJECT` only to Railway's build environment. The Vite configuration enables hidden source maps only when all three values are present, uploads them as part of the production build, and deletes the generated `.map` files afterward so source maps are not publicly served.[^sentry-vite]

After deployment, visit the dashboard, invoke a deliberately safe error test only in a development or staging environment, and confirm that Sentry shows the event with the appropriate client or server project, `production` environment, and no user, request, body, cookie, query, or breadcrumb fields. Do not trigger errors with real transaction or customer data.

[^sentry-pricing]: [Sentry pricing](https://sentry.io/pricing/)

[^sentry-react]: [Sentry React SDK setup](https://docs.sentry.io/platforms/javascript/guides/react/)

[^sentry-node]: [Sentry Node SDK setup](https://docs.sentry.io/platforms/javascript/guides/node/)

[^sentry-vite]: [Sentry Vite source-map uploads](https://docs.sentry.io/platforms/javascript/sourcemaps/uploading/vite/)

## Continuous integration

The `Continuous integration` GitHub Actions workflow runs on every pull request targeting `main`, every push to `main`, and manual dispatch. It installs the dependency lockfile exactly and then runs the same quality gates required locally.

| Gate             | Command             | Purpose                                                                  |
| ---------------- | ------------------- | ------------------------------------------------------------------------ |
| Formatting       | `pnpm format:check` | Detects files that are not formatted by Prettier without modifying them. |
| Type safety      | `pnpm check`        | Runs the TypeScript compiler without emitting files.                     |
| Unit tests       | `pnpm test`         | Runs the Vitest suite.                                                   |
| Production build | `pnpm build`        | Builds the Vite client and bundled Express server used by Railway.       |

The workflow has read-only repository permissions, uses the committed pnpm lockfile, times out after 15 minutes, and cancels superseded checks for the same branch. It does not use production secrets, so pull-request checks remain safe for ordinary source changes.

To make CI a mandatory release gate, open the repository’s **Settings → Rules → Rulesets** (or **Branches** for legacy branch protection), create a rule for `main`, enable required status checks, and select **Format, type check, test, and build**. GitHub documents that required status checks must complete successfully, be skipped, or be neutral before a protected branch can be changed.[^github-protection]

[^github-protection]: [GitHub: About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Roadmap release 5: governed Policy Studio

FraudLens now includes an organization-scoped **Policy Studio** at `/policy`. Managers can edit bounded score, amount, velocity, and operational-signal thresholds, run a read-only preview against synthetic cases, and create a draft with a required change note. Activation and rollback are server-enforced operations requiring both the FraudLens administrator role and `org:admin` membership in the active Clerk organization.

Policy changes apply only to future assessments; historic transactions retain their stored `policyVersion`, and no policy automatically blocks an account or closes a case. Every draft, approval, and rollback is recorded in the organization-scoped audit history. Migration `0016_cultured_wind_dancer.sql` creates the version table and adds the transaction policy-version field. Apply it through the approved staging/production migration process; it has not been applied by this sandbox. See [`ROADMAP_RELEASE_5.md`](ROADMAP_RELEASE_5.md) for the workflow, security boundary, validation, and verification details.

## Roadmap release 6: guided review checklist

Transaction detail pages now include a **Guided review checklist** for identity and account context, device/access context, merchant/payment context, related activity, and evidence quality. Investigators can complete or reopen items and save bounded notes; updates remain separate from the final case outcome and are written to the organization-scoped audit stream.

The checklist is advisory and human-in-the-loop. It does not make fraud decisions, automatically close cases, or treat related activity as proof. Migration `0017_slippery_the_call.sql` creates the organization-scoped checklist table. It was generated and inspected locally but has not been applied to production; apply it through the approved staging and production migration process. See [`ROADMAP_RELEASE_6.md`](ROADMAP_RELEASE_6.md) and [`docs/ADMINISTRATOR_GUIDE.md`](docs/ADMINISTRATOR_GUIDE.md) for operating details.

## Roadmap release 7: secure investigator exports

Operational CSV and summary downloads now require a concise export reason and a server-enforced row limit between 1 and 1,000. Export audit events retain the active organization, actor, filters, row count, requested limit, and bounded reason. Existing manager authorization, organization isolation, and formula-safe CSV escaping remain in effect. This release uses the existing audit infrastructure and requires no new migration. See [`ROADMAP_RELEASE_7.md`](ROADMAP_RELEASE_7.md) for the security boundary, workflow, validation, and residual risks.

## Roadmap release 8: governed retention policies

FraudLens now provides an organization-scoped **Retention Policies** workspace. Managers can preview and draft transaction, evidence, and audit-event retention windows; activation and rollback require both the FraudLens administrator role and `org:admin` membership in the active Clerk organization. This release records effective dates and governance events but intentionally performs no automatic deletion. Migration `0018_fat_pestilence.sql` creates the versioned retention-policy table and has not been applied by this sandbox. See [`ROADMAP_RELEASE_8.md`](ROADMAP_RELEASE_8.md) for operating guidance and residual risks.

## Roadmap release 9: governed model registry

FraudLens now includes an organization-scoped **Model Registry** for recording evaluated challengers and the human approval decision that promotes a challenger to champion. Managers can compare bounded aggregate precision, recall, F1, PR-AUC, threshold, and reviewed-row metadata before registration. Promotion and rollback require both the FraudLens administrator role and `org:admin` membership in the active Clerk organization. Registry promotion does not change the deterministic manual scoring engine in this release. Migration `0019_flashy_thundra.sql` creates the registry table and has not been applied by this sandbox. See [`ROADMAP_RELEASE_9.md`](ROADMAP_RELEASE_9.md) for governance boundaries and residual risks.

## Roadmap release 10: incident mode

FraudLens now includes an organization-scoped **Incident Mode** in Security Center. An organization administrator can pause server-side workspace mutations and public transaction ingestion with a required incident note while preserving read-only investigation and an administrator recovery path. Activation and deactivation are audited; API ingestion returns a retryable 503 response while the mode is active. Migration `0020_sad_thunderball.sql` creates the control table and has not been applied by this sandbox. See [`ROADMAP_RELEASE_10.md`](ROADMAP_RELEASE_10.md) for operating guidance and residual risks.

## Current limitations and next steps

The app remains a polished portfolio demonstration. Its deployment, monitoring, authorization, audit, and recovery controls provide a stronger operational baseline, but a real-customer or regulated rollout still requires approved data governance, an independent security review, calibrated alert policy, retraining governance, formal fairness assessment, and integration with a secure event stream.
