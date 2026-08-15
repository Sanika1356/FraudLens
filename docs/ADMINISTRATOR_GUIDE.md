# FraudLens Administrator Guide

## Scope and safety

FraudLens is a transaction-risk intelligence workspace for investigator-led review. The repository is a portfolio demonstration with synthetic records and non-sensitive inputs. It must not be used as the sole basis for account restrictions or other high-impact decisions. Before loading real customer data, obtain an independent security review, approve data governance and retention rules, and involve the organization’s legal or compliance reviewer.

This guide describes the implemented application behavior. It does not replace the [production operations runbook](./OPERATIONS.md), which contains the detailed security, retention, backup, and disaster-recovery procedures.

## First-time setup

### Local development

Install Node.js and pnpm, clone the repository, install dependencies, and copy the safe environment template:

```powershell
git clone https://github.com/Sanika1356/FraudLens.git
cd FraudLens
pnpm install
Copy-Item .env.example .env
pnpm db:push
pnpm dev
```

On macOS or Linux, use `cp .env.example .env` instead of `Copy-Item`. The local server runs at `http://localhost:3000`. The development launcher is portable across Windows PowerShell, macOS, and Linux; do not replace it with a shell-specific `NODE_ENV=development` command.

Populate `.env` using the variable table below. Keep `.env` local and never commit it. Use test or development Clerk keys during local development. `DATABASE_URL` must include the TLS options required by TiDB Cloud Serverless. The `pnpm db:push` command generates and applies Drizzle migrations; inspect migration changes before applying them to any shared environment.

### Required environment variables

| Variable                     | Scope                         | Purpose                                                            |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser build                 | Clerk publishable key compiled into the React client.              |
| `CLERK_PUBLISHABLE_KEY`      | Server                        | Clerk publishable key used by Express authentication middleware.   |
| `CLERK_SECRET_KEY`           | Server-only                   | Clerk server secret. Never expose it through a `VITE_` variable.   |
| `OWNER_OPEN_ID`              | Server                        | Clerk user ID bootstrapped as the initial FraudLens administrator. |
| `DATABASE_URL`               | Server and migration commands | TiDB Cloud MySQL-compatible connection string with TLS parameters. |
| `SUPABASE_URL`               | Server                        | Supabase project URL for private evidence storage.                 |
| `SUPABASE_SERVICE_ROLE_KEY`  | Server-only                   | Supabase service-role credential for private evidence files.       |
| `SUPABASE_STORAGE_BUCKET`    | Server                        | Private evidence bucket, normally `fraudlens-evidence`.            |

The server requires `DATABASE_URL`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `OWNER_OPEN_ID` before accepting production traffic. `CLERK_PUBLISHABLE_KEY` should also be configured because the authentication middleware uses it. Supabase variables are required for evidence workflows; Resend, Sentry, and Slack or Teams alerting remain optional integrations.

### Optional environment variables

| Variable                                                      | Purpose                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `MANAGER_OPEN_IDS`                                            | Comma-separated Clerk user IDs that receive manager bootstrap access.                |
| `RESEND_API_KEY`                                              | Enables email alerts and scheduled weekly summaries.                                 |
| `RESEND_FROM_EMAIL`                                           | Verified Resend sender; omit for limited `onboarding@resend.dev` testing.            |
| `TRUST_PROXY_HOPS`                                            | Number of trusted proxy hops; keep `1` for the Railway deployment.                   |
| `API_RATE_LIMIT_WINDOW_MINUTES`                               | Global `/api` rate-limit window; default `15`.                                       |
| `API_RATE_LIMIT_MAX`                                          | Global `/api` requests per IP per window; default `300`.                             |
| `REQUEST_BODY_LIMIT_BYTES`                                    | JSON/form body limit; default `1,000,000`. Keep evidence uploads on private storage. |
| `VITE_SENTRY_DSN`, `SENTRY_DSN`                               | Optional browser and server Sentry destinations.                                     |
| `VITE_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`               | Monitoring environment label, normally `production`.                                 |
| `VITE_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE` | Trace sample rates between `0` and `1`; production defaults to `0.1`.                |

The complete variable examples are maintained in [`.env.example`](../.env.example). Never paste secret values into issues, pull requests, chat, screenshots, or the repository.

## Workspace access and roles

A user must be authenticated with Clerk and must select an active Clerk organization before accessing workspace data. Every organization-scoped query is filtered by the active organization ID. A user’s FraudLens role and Clerk organization membership role are separate controls; administrator operations require both FraudLens administrator access and Clerk organization administrator membership.

| Role          | Primary responsibilities                                                 | Main access                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Analyst       | Review alerts and cases, add investigation context, and record outcomes. | Risk overview, transaction list and detail, assessments, case updates, comments, tags, evidence links and uploads, and case claiming.                                                                        |
| Manager       | Operate the workspace and supervise review quality.                      | All analyst actions plus CSV import, assignments, queues, workload views, reports and exports, model health, drift, audit review, API keys and request logs, notification preferences, and weekly summaries. |
| Administrator | Manage membership and security-sensitive organization controls.          | All manager actions plus directory, invitations, role changes, member deactivation, session revocation, and invitation revocation. Clerk organization administrator membership is also required.             |

The initial administrator is selected by matching the signed-in Clerk user ID against `OWNER_OPEN_ID`. Users listed in `MANAGER_OPEN_IDS` bootstrap as managers unless they are the owner. After bootstrap, administrators should use the dashboard controls to manage membership and roles. If a user can sign in but sees a workspace authorization error, confirm that the user belongs to the selected Clerk organization and that the organization membership role satisfies the requested operation.

### Membership administration

Administrators can open the workspace directory to invite members, change a member’s Clerk organization membership role, change the FraudLens role, deactivate a member, revoke the member’s sessions, or revoke an invitation. Use deactivation and session revocation together when access must end immediately. Review the audit log after every membership change. Do not share invitation links outside the intended recipient.

## Investigator workflow

Analysts start in the Command Center, review the priority queue, and open a transaction detail view to inspect the deterministic score, factors, case status, notes, tags, assignment, priority, and due date. A risk label supports review; it is not a final decision. Record a concise case note and a resolution reason when marking a case as confirmed fraud or legitimate. Keep the evidence trail factual and avoid copying unnecessary personal data into notes.

Managers can assign cases, set priorities and due dates, claim unassigned work, inspect workload distribution, import transaction CSVs, and review operational reports. CSV import validates the schema and risk inputs before persistence; test an import with a small synthetic file before using a larger batch. Evidence uploads use private Supabase storage and organization-scoped storage keys. Never make the evidence bucket public or place service-role credentials in browser code.

## Alert configuration

Open **Notification Preferences** as a manager or administrator. Configure the risk threshold and enable any supported delivery channel only after its recipient or webhook has been supplied. The application validates Slack incoming-webhook URLs and Teams or Power Automate workflow URLs before saving them.

| Channel         | Configuration                                                                                                            | Operational notes                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Email           | Enable email and enter a recipient. Configure `RESEND_API_KEY`; use `RESEND_FROM_EMAIL` only after verifying the sender. | Resend’s limited testing sender may restrict recipients. Start with the Resend account email and confirm delivery before broader testing. |
| Slack           | Enable Slack and enter the organization’s approved incoming webhook URL.                                                 | Treat the webhook like a secret. Rotate it in Slack if it is exposed.                                                                     |
| Microsoft Teams | Enable Teams and enter the approved Teams or Power Automate workflow URL.                                                | Treat the workflow URL like a secret and rotate it when necessary.                                                                        |

Use the manager-only **Test Alert** action after saving preferences. The test uses a synthetic high-risk transaction and does not send real transaction data. Inspect the audit event and the provider response when diagnosing delivery. Alert delivery is resilient: a provider failure is logged and does not prevent the risk decision from being stored.

### Weekly summaries

Open **Weekly Summaries** as a manager or administrator, enable the schedule, and provide a valid recipient email. The GitHub Actions workflow sends the previous completed calendar week’s operational risk summary every Monday at 08:00 UTC. It is idempotent, so a retry does not intentionally duplicate a delivery for the same organization and week.

The scheduled workflow requires the repository secrets `DATABASE_URL` and `RESEND_API_KEY`; `RESEND_FROM_EMAIL` is optional. Add them under **GitHub → Settings → Secrets and variables → Actions** without placing the values in source control. Run the workflow manually from the Actions page after configuration, then verify the delivery record and recipient inbox. Keep the GitHub Actions spending limit at zero when the no-cost safeguard is required.

## Public transaction API

Managers create and revoke organization-scoped keys under **API Keys**. A newly created secret is shown once; copy it into the calling service’s secret manager immediately. FraudLens stores only a hash and a short prefix. Revoke a key if it is exposed, and create a replacement rather than reusing the leaked secret.

The public endpoint is `POST /api/v1/transactions/assess`. It requires a Bearer key with the `transactions:write` scope and accepts the same validated risk inputs used by the dashboard. A reference is optional but recommended for idempotent client behavior; it must contain 3–32 uppercase letters, numbers, underscores, or hyphens. A duplicate reference within the same organization returns `409`.

```powershell
$headers = @{
  Authorization = "Bearer $env:FRAUDLENS_API_KEY"
  "Content-Type" = "application/json"
}
$body = @{
  reference = "TXN_DEMO_001"
  amount = 249.50
  merchantCategory = "electronics"
  transactionCountry = "US"
  accountCountry = "GB"
  deviceStatus = "new"
  transactionHour = 2
  recentTransactionCount = 4
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "https://YOUR-RAILWAY-DOMAIN/api/v1/transactions/assess" `
  -Headers $headers `
  -Body $body
```

The API returns `201` with a request ID and transaction risk result. Invalid input returns `400`, missing or invalid keys return `401`, insufficient scope returns `403`, duplicate references return `409`, rate limiting returns `429`, and unexpected failures return `500` with a request ID. The API rejects request bodies above 20 KB and limits each API key to 60 requests per minute. The broader server `/api` rate limiter also applies per client IP, so integrators should implement exponential backoff and preserve the response request ID in their logs.

## Reporting and audit review

Managers can open the reporting dashboard and export an operational report as CSV or text. Filters include risk level, case status, assignee, and date range. Reports should be used to monitor queue age, outcomes, risk distribution, analyst workload, and alert quality; they are not substitutes for case-level review.

Managers can inspect audit events and public API request logs for the active organization. Audit records are append-only application records and should not be deleted casually. Follow the retention and export procedure in [`docs/OPERATIONS.md`](./OPERATIONS.md) before archival or destructive maintenance. Keep exports encrypted and access-controlled.

## Deployment to Railway

Deploy the `main` branch from the GitHub repository using the checked-in [`railway.toml`](../railway.toml). Configure the required variables in Railway’s service-variable manager, deploy, and verify `GET /health` returns HTTP 200 with `{"status":"ok"}`. Then configure Clerk allowed origins and redirect URLs for the generated Railway domain before testing sign-in.

The deployment runs the production build, applies committed Drizzle migrations before startup, and uses the Railway-assigned `PORT`. Do not run migrations manually against production unless the change window and backup/export procedure have been approved. Review [Railway deployment guidance in the README](../README.md#deploying-on-railway) and the [operations runbook](./OPERATIONS.md) for health checks, cost safeguards, backup limitations, and recovery.

## Troubleshooting matrix

| Symptom                                         | Likely cause                                                                                                   | Administrator action                                                                                                  |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Deployment exits immediately                    | Required production variable is missing or malformed.                                                          | Read the startup log, add the missing Railway variable, and redeploy. Never disable startup validation.               |
| `/health` is unavailable                        | Build failed, the server is not listening on Railway’s `PORT`, or the migration step failed.                   | Inspect the deploy log, confirm the service port and database connection, and verify the latest migration is present. |
| Clerk redirects repeatedly                      | Allowed origins, redirect URLs, or publishable/secret keys do not match the deployed domain or Clerk instance. | Add the exact `https://` Railway domain in Clerk and confirm both publishable-key variables match.                    |
| User can sign in but cannot open workspace data | No active organization or insufficient Clerk membership/FraudLens role.                                        | Ask the user to select an organization; an administrator should inspect directory membership and roles.               |
| Evidence upload or download fails               | Supabase variables are missing, the bucket is public/misnamed, or the service-role credential is invalid.      | Confirm private bucket configuration and server-only Supabase variables; do not expose the service-role key.          |
| Email, Slack, or Teams alert fails              | Provider credential, recipient, webhook, or sender configuration is invalid.                                   | Use the manager-only Test Alert, inspect provider-safe logs, rotate exposed webhooks, and verify Resend sender rules. |
| Weekly summary is not delivered                 | Workflow secrets are missing, preferences are disabled, recipient is invalid, or the Monday job has not run.   | Inspect GitHub Actions, run the workflow manually, verify organization preferences, and check the delivery record.    |
| Public API returns `401` or `403`               | Key is invalid, expired, revoked, or lacks `transactions:write`.                                               | Revoke the compromised key and create a replacement with the required scope.                                          |
| Public API returns `409`                        | The transaction reference already exists in the organization.                                                  | Treat it as an idempotency response and reconcile using the returned request ID and existing reference.               |
| Public API returns `429`                        | Per-key or global IP rate limit exceeded.                                                                      | Back off, reduce concurrency, and request a manager review before changing limits.                                    |
| Sentry has no event                             | DSN is absent, environment variables were added after the build, or the event was intentionally filtered.      | Confirm client/server DSNs in the correct scope, redeploy, and use only a synthetic staging error for testing.        |
| CI blocks a merge                               | Formatting, type checking, tests, or production build failed.                                                  | Open the failed workflow log, reproduce the same `pnpm` command locally, correct the source, and push a new commit.   |

For suspected data loss, corruption, credential exposure, or unauthorized access, stop unreviewed changes and follow the [disaster-recovery procedure](./OPERATIONS.md#disaster-recovery-runbook). Preserve relevant logs and snapshots before attempting a restore.

## References

[1]: https://clerk.com/docs "Clerk documentation"
[2]: https://docs.railway.com/deployments/healthchecks "Railway health checks"
[3]: https://resend.com/docs "Resend documentation"
[4]: https://supabase.com/docs/guides/storage "Supabase Storage documentation"
[5]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions "GitHub Actions security hardening"
