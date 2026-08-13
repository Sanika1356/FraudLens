# FraudLens — Planned Work

This list contains only FraudLens work that remains to be implemented.

## Identity, Access, and Workspaces


## Investigation Workflow and Data Operations


## Alerts, Reporting, and Model Oversight

- [ ] Add reporting with filtered CSV exports, scheduled weekly risk summaries, case-resolution metrics, analyst-workload metrics, and downloadable report files.
- [ ] Add a versioned public API with scoped API keys, rate limits, input validation, request logs, and documentation for programmatic transaction submission.

## Deployment, Reliability, and Engineering Quality

- [ ] Deploy FraudLens to Railway from GitHub with production environment variables, a managed database connection, custom domain support, and release verification.
- [ ] Configure Sentry monitoring for both the React client and Express server, including error capture, performance traces, structured logs, and privacy-safe event filtering.
- [ ] Add GitHub Actions continuous integration to run formatting, type checks, unit tests, and production builds on pull requests and before deployment.
- [ ] Add production hardening: secure environment-variable management, request-rate limiting, secure HTTP headers, audit-log retention rules, database backups, and a disaster-recovery runbook.
- [ ] Document setup, deployment, team-role rules, API usage, alert configuration, and operational troubleshooting in the README and administrator guide.
