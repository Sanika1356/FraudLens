# Project TODO

- [x] Write the FraudLens product requirements document and implementation decisions.
- [x] Define transaction, prediction, case-note, and monitoring domain models in the database schema.
- [x] Implement deterministic transaction risk scoring with low, medium, and high labels and probability output.
- [x] Persist submitted transactions, scores, feature drivers, analyst status, and case notes.
- [x] Implement typed server procedures for dashboard data, transaction submission, filtering, case updates, and monitoring metrics.
- [x] Implement an LLM explanation contract that translates risk factors into investigator-friendly language with deterministic fallback text.
- [x] Create a polished dashboard shell using the template DashboardLayout component and an analyst-focused navigation structure.
- [x] Build the transaction risk scoring dashboard with high-risk alert emphasis, probability scores, and key risk factors.
- [x] Build the manual transaction submission form with immediate prediction results and validation.
- [x] Build a transaction detail and risk-explanation view with plain-English contributing-factor explanations.
- [x] Build case-management controls for confirmed fraud, legitimate, and under-review statuses with analyst notes.
- [x] Build a filterable transaction history table for risk level, status, date range, and merchant category.
- [x] Build a model-performance view with precision, recall, F1-score, and a confusion matrix.
- [x] Build a data-drift monitoring view comparing recent feature distributions with the training baseline.
- [x] Add high-risk notification behavior that surfaces newly flagged transactions in the dashboard.
- [x] Write and run Vitest coverage for scoring rules, explanation fallback behavior, and case-management validation.
- [x] Verify desktop and mobile dashboard views, then refine visual hierarchy, spacing, accessibility, and loading/empty/error states.
- [x] Document architecture, mock-data limitations, and portfolio presentation guidance in the README.
- [x] Add visible manual-assessment validation states and test invalid inputs.
- [x] Add a dedicated transaction detail view with individual plain-English risk explanations.
- [x] Add an in-dashboard new-alert notification treatment for freshly created high-risk assessments.
- [x] Add Vitest coverage for case-status updates, note validation, and invalid workflow inputs.
- [x] Audit and verify loading, empty, error, keyboard-focus, and responsive states across the analyst workspace.
- [x] Add and verify explicit keyboard-focus styling and empty, loading, and error-state treatments for major analyst views.
- [x] Add automated verification or documented QA evidence for the accessibility and workflow state audit.
- [x] Audit public-facing files for platform-specific labels, metadata, and project-presentation wording.
- [x] Update public-facing visual branding, browser metadata, and product copy for a consistent FraudLens identity.
- [x] Rewrite public README wording for a concise, product-focused portfolio presentation.
- [x] Verify the rebranded dashboard and documentation, then save an updated project checkpoint.
- [x] Save a new FraudLens checkpoint that captures the completed public rebrand and documentation update.

## Product Roadmap — Multi-User and Production Readiness

### Identity, Access, and Workspaces
- [ ] Add Clerk authentication with protected application routes, sign-up, sign-in, sign-out, password recovery, and social login.
- [ ] Add `analyst`, `manager`, and `admin` roles with server-side authorization for transactions, cases, and model-monitoring views.
- [ ] Add organization workspaces so each company or fraud team has isolated users, transactions, cases, metrics, and configuration.
- [ ] Add administrator user-management controls for role changes, team invitations, account deactivation, and session revocation.

### Investigation Workflow and Data Operations
- [ ] Add case assignment, priority, due dates, queues, and workload views for analysts and managers.
- [ ] Add an immutable audit log for case status changes, analyst assignments, notes, resolutions, authentication events, and administrative actions.
- [ ] Expand the investigator workspace with case comments, tags, evidence links, attachments, resolution reason codes, and a chronological activity timeline.
- [ ] Build CSV transaction import with schema validation, row-level error reporting, import summaries, duplicate detection, and bulk risk scoring.
- [ ] Add secure evidence-file storage for investigator attachments, imported files, and exported reports using Amazon S3 or Cloudflare R2.

### Alerts, Reporting, and Model Oversight
- [ ] Add notification preferences and external high-risk alerts through email and Slack or Microsoft Teams webhooks, with configurable alert thresholds.
- [ ] Add a feedback loop that records confirmed fraud and legitimate outcomes, tracks false positives and false negatives, and surfaces model-quality trends.
- [ ] Add reporting with filtered CSV exports, scheduled weekly risk summaries, case-resolution metrics, analyst-workload metrics, and downloadable report files.
- [ ] Add a versioned public API with scoped API keys, rate limits, input validation, request logs, and documentation for programmatic transaction submission.

### Deployment, Reliability, and Engineering Quality
- [ ] Deploy FraudLens to Railway from GitHub with production environment variables, a managed database connection, custom domain support, and release verification.
- [ ] Configure Sentry monitoring for both the React client and Express server, including error capture, performance traces, structured logs, and privacy-safe event filtering.
- [ ] Add GitHub Actions continuous integration to run formatting, type checks, unit tests, and production builds on pull requests and before deployment.
- [ ] Add production hardening: secure environment-variable management, request-rate limiting, secure HTTP headers, audit-log retention rules, database backups, and a disaster-recovery runbook.
- [ ] Document setup, deployment, team-role rules, API usage, alert configuration, and operational troubleshooting in the README and administrator guide.

## Recommended Implementation Order
- [ ] Batch 1: Implement authentication, role-based authorization, and case assignment with audit logs.
- [ ] Batch 2: Implement CSV imports, evidence storage, and notification preferences with high-risk alert delivery.
- [ ] Batch 3: Implement investigator collaboration, model-outcome feedback, and reporting/export workflows.
- [ ] Batch 4: Implement organization workspaces, public API access, and administrator user-management controls.
- [ ] Batch 5: Configure Railway deployment, Sentry monitoring, GitHub Actions CI, production hardening, and operational documentation.
