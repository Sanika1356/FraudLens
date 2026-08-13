# FraudLens — Planned Work

This list contains only FraudLens work that remains to be implemented.

## Identity, Access, and Workspaces

- [ ] Add organization workspaces so each company or fraud team has isolated users, transactions, cases, metrics, and configuration.
- [ ] Add administrator user-management controls for role changes, team invitations, account deactivation, and session revocation.

## Investigation Workflow and Data Operations

- [ ] Add case assignment, priority, due dates, queues, and workload views for analysts and managers.
- [ ] Add an immutable audit log for case status changes, analyst assignments, notes, resolutions, authentication events, and administrative actions.
- [ ] Expand the investigator workspace with case comments, tags, evidence links, attachments, resolution reason codes, and a chronological activity timeline.
- [ ] Build CSV transaction import with schema validation, row-level error reporting, import summaries, duplicate detection, and bulk risk scoring.
- [ ] Add secure evidence-file storage for investigator attachments, imported files, and exported reports using Amazon S3 or Cloudflare R2.

## Alerts, Reporting, and Model Oversight

- [ ] Add notification preferences and external high-risk alerts through email and Slack or Microsoft Teams webhooks, with configurable alert thresholds.
- [ ] Add a feedback loop that records confirmed fraud and legitimate outcomes, tracks false positives and false negatives, and surfaces model-quality trends.
- [ ] Add reporting with filtered CSV exports, scheduled weekly risk summaries, case-resolution metrics, analyst-workload metrics, and downloadable report files.
- [ ] Add a versioned public API with scoped API keys, rate limits, input validation, request logs, and documentation for programmatic transaction submission.

## Deployment, Reliability, and Engineering Quality

- [ ] Deploy FraudLens to Railway from GitHub with production environment variables, a managed database connection, custom domain support, and release verification.
- [ ] Configure Sentry monitoring for both the React client and Express server, including error capture, performance traces, structured logs, and privacy-safe event filtering.
- [ ] Add GitHub Actions continuous integration to run formatting, type checks, unit tests, and production builds on pull requests and before deployment.
- [ ] Add production hardening: secure environment-variable management, request-rate limiting, secure HTTP headers, audit-log retention rules, database backups, and a disaster-recovery runbook.
- [ ] Document setup, deployment, team-role rules, API usage, alert configuration, and operational troubleshooting in the README and administrator guide.
