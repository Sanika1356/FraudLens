# FraudLens

**FraudLens** is a transaction-risk intelligence workspace for investigator-led fraud review. It brings prioritised alerts, transparent scoring, case decisions, evidence, and model-health context into one focused analyst console.

> **Demonstration only.** FraudLens uses synthetic UI records and non-sensitive inputs. It is not a production fraud-decision system, does not use real customer data, and must not be used as the sole basis for account restrictions or other high-impact decisions.

## Product capabilities

| Capability | What it demonstrates |
|---|---|
| Command Center | Priority review queue, high-risk alert emphasis, open-case counts, and assessed activity overview |
| Instant Assessment | Immediate risk probability, low/medium/high label, contributing signals, and reviewer-friendly rationale |
| Transaction History | Filters for risk level, case outcome, merchant category, and date range; refreshes periodically for new alerts |
| Casework | Investigation notes and controlled case outcomes: under review, confirmed fraud, or legitimate |
| Investigator Summaries | Clear risk-factor rationale and concise, review-ready next-step guidance |
| Model Health | Precision, recall, F1 score, PR-AUC, decision threshold, and confusion-matrix counts from a public evaluation artifact |
| Drift Monitor | Baseline-versus-recent comparisons for amount, new-device rate, cross-border rate, and night-time activity |

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

## Local development

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Before starting the application, add your Clerk publishable key and secret key to the local `.env` file. Set both `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` to the publishable key; the former is used by the React client and the latter by the Express middleware. Set `CLERK_SECRET_KEY` only on the server. The `.env` file is ignored by Git and must never be committed. The `pnpm dev` command works unchanged in Windows PowerShell, macOS, and Linux.

Authentication is required for every FraudLens workspace route and risk-management API. Clerk provides sign-up, sign-in, password recovery, and any enabled social-login flow at `/sign-in` and `/sign-up`.

Run type validation and tests with:

```bash
pnpm check
pnpm test
```

## Key routes

| Route | Purpose |
|---|---|
| `/` | Command Center |
| `/transactions` | Filterable transaction history |
| `/assess` | Manual instant assessment |
| `/casework` | Review workflow and case notes |
| `/model-health` | Evaluation metrics and confusion matrix |
| `/drift` | Data-drift monitoring |

## Product design notes

FraudLens is designed around a few practical review principles:

1. **Evidence before outcome:** Risk levels support review; they do not replace the investigator’s final decision.
2. **Metrics with context:** The Model Health view exposes precision, recall, F1, PR-AUC, and the confusion matrix instead of relying on accuracy alone.
3. **Clear separation:** The transparent assessment policy and anonymized benchmark evaluation are shown as distinct evidence sources.
4. **Focused workflow:** The workspace captures case notes, updates alert queues, validates analyst input, and surfaces input-distribution changes for review.

## Deploying on Railway

FraudLens includes a [`railway.toml`](./railway.toml) configuration for Railpack builds, database migrations before each release, a production start command, safe restart behavior, and a `/health` endpoint that returns HTTP 200. Railway must build with the same `VITE_CLERK_PUBLISHABLE_KEY` used by the client and run with the server-only variables below. Add these in **Railway → Project → Service → Variables**; never commit them to Git.

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk public key compiled into the React client during the Railway build. |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key used by the Express authentication middleware. |
| `CLERK_SECRET_KEY` | Yes | Server-only Clerk secret key. |
| `OWNER_OPEN_ID` | Yes | Clerk user ID that receives the initial administrator role. |
| `DATABASE_URL` | Yes | TiDB Cloud MySQL connection string, including its TLS parameters. |
| `SUPABASE_URL` | Yes | Supabase project URL for private evidence storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase service-role key. |
| `SUPABASE_STORAGE_BUCKET` | Yes | Private evidence bucket name, normally `fraudlens-evidence`. |
| `RESEND_API_KEY` | No | Enables email alerts and weekly risk summaries. |
| `RESEND_FROM_EMAIL` | No | Verified Resend sender; omit it for limited `onboarding@resend.dev` testing. |
| `MANAGER_OPEN_IDS` | No | Comma-separated Clerk user IDs that should start with manager access. |

To release, create a Railway project from the GitHub repository and select the `main` branch. The checked-in deployment configuration performs `pnpm install --frozen-lockfile && pnpm build`, then applies committed Drizzle migrations before it starts the production server. Generate a Railway domain after the first successful deployment. For a custom domain, add it under the service's networking settings, then create the DNS record Railway provides and add the final `https://` domain to Clerk's production allowed origins and redirect URLs.

> **Cost safeguard:** Railway's free plan and trial limits can change. Before enabling a service, confirm the active plan, configure a Compute Usage hard limit in Railway's Workspace Usage settings, and enable Serverless/app sleep if cold starts are acceptable. A hard limit stops the workload when the threshold is reached. Consult Railway's current [pricing](https://railway.com/pricing) and [cost-control documentation](https://docs.railway.com/pricing/cost-control) before release.

After deployment, verify the Railway domain returns `{"status":"ok"}` at `/health`, sign in through Clerk, create or select an organization, review a dashboard route, and confirm a public API request or scheduled summary only after its secrets are configured. Railway will not direct traffic to a new deployment until the configured health endpoint returns HTTP 200.[^railway-health]

[^railway-health]: [Railway health checks](https://docs.railway.com/deployments/healthchecks)

## Current limitations and next steps

The app is a polished portfolio demonstration, not a production deployment. A production version would require approved data governance, security reviews, role-based authorization, audit trails, calibrated alerts, retraining governance, formal fairness assessment, and integration with a secure event stream.
