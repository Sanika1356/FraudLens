# FraudLens Production Operations Runbook

> **Retention note:** This runbook defines an operational baseline, not legal advice. Fraud-monitoring, privacy, and record-preservation obligations vary by jurisdiction and contract. Have qualified counsel or a compliance professional approve the retention schedule before relying on it for a regulated deployment.

## Operating baseline

FraudLens is deployed as one Railway service with TiDB Cloud Starter as its managed database and Supabase Storage for private evidence. The application now starts fail-closed in production if its database or Clerk authentication variables are absent. It also applies security-focused HTTP headers, disables the Express fingerprint header, accepts only simple query strings, caps JSON and form payloads at **1 MB** by default, and limits `/api` traffic per client IP [3].

| Control                   |               Default | Operator action                                                                                                                          |
| ------------------------- | --------------------: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted proxy hops        |                   `1` | Keep this value at `1` for the Railway service. Change it only after validating the proxy topology.                                      |
| API request window        |            15 minutes | Use `API_RATE_LIMIT_WINDOW_MINUTES` only for a bounded operational adjustment.                                                           |
| API requests per IP       |        300 per window | Use `API_RATE_LIMIT_MAX` only after reviewing legitimate traffic and abuse telemetry.                                                    |
| JSON/form request body    |       1,000,000 bytes | Leave this bound in place. Evidence files are transferred directly to private object storage rather than through the application server. |
| Public API key rate limit | 60 per minute per key | This existing database-backed limit remains in addition to the broader IP protection.                                                    |

The HTTP rate limiter is intentionally an in-memory control, which is appropriate for the current single Railway service. It does not coordinate counters across multiple running instances. Before horizontally scaling the service, replace it with a shared rate-limit store and repeat load and abuse testing.

## Scheduled Supabase evidence-storage health check

The repository workflow `.github/workflows/supabase-storage-keepalive.yml` runs every third day at 06:23 UTC and may also be started manually from the Actions page. It performs a metadata-only `GET` request for the configured private evidence bucket. The check neither lists, downloads, uploads, nor deletes evidence files. Its purpose is to confirm that the storage integration remains reachable and to provide regular project activity; it is an operational best effort rather than a provider guarantee against free-plan pausing.[4]

Create the following **repository secrets** in GitHub under **Settings → Secrets and variables → Actions**. Copy the existing production values from the secure environment where FraudLens is configured; never place any value in source code, workflow YAML, a ticket, or a chat message.

| Secret name                 | Source                             | Required value                                                                         |
| --------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project settings          | The project URL only, without a trailing slash.                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project API-key settings  | The existing server-side key. It must remain encrypted in the repository secret store. |
| `SUPABASE_STORAGE_BUCKET`   | FraudLens production configuration | The private evidence-bucket identifier, normally `fraudlens-evidence`.                 |

After adding all three secrets, run **Check Supabase evidence storage** manually from the Actions page once. A successful run logs only a generic success message. If it fails, verify that the names and values were copied correctly and that the bucket still exists; do not paste the key into logs or issue comments. Supabase treats secret and service-role keys as elevated credentials and requires that they remain in secure server-side environments.[5]

## Secure deployment procedure

Configure only production values in Railway’s service-variable manager. Never commit `.env`, connection strings, API keys, Supabase service-role keys, Clerk secret keys, or Sentry tokens. Railway must provide `DATABASE_URL`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, and `OWNER_OPEN_ID`; the application refuses to start in production when any one is missing. The remaining configured integrations, such as Supabase evidence storage, Resend, and Sentry, retain their documented graceful-degradation behavior.

| Verification                                       | Expected result                                                 | Response if it fails                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /health`                                      | `200` and `{"status":"ok"}`                                     | Inspect Railway deployment logs before routing users to the release.                          |
| Response headers                                   | No `X-Powered-By`; Helmet-provided security headers are present | Confirm the service is running the current release and that a proxy is not stripping headers. |
| Oversized JSON request                             | `413` with a generic JSON error                                 | Do not raise the global limit for evidence upload; use the private storage workflow.          |
| Repeated API requests beyond the configured window | `429` with standard rate-limit headers                          | Review callers and API-key use before increasing limits.                                      |
| Missing required production variable               | Deployment exits before accepting traffic                       | Add the missing variable in Railway; never weaken startup validation.                         |

## Audit and request-log retention rules

FraudLens audit events are append-only application records. The application does **not** automatically purge audit events or API request logs. This intentional default avoids silently deleting forensic evidence. Administrators must export, review, and authorize any retention-related deletion as a controlled maintenance change.

| Data set                        | Operational baseline                                                                                                                | Before deletion or archival                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auditEvents`                   | Preserve indefinitely in the active database unless a documented, approved retention schedule supersedes this baseline.             | Export the period, verify the export checksum and restore readability, record approver and scope in the audit trail, then perform maintenance during a change window. |
| `apiRequestLogs`                | Review monthly; retain only for the period approved by the organization after weighing troubleshooting needs and data minimization. | Export aggregate operational evidence first. Confirm no active incident or investigation depends on the records.                                                      |
| Supabase evidence objects       | Keep only while their linked case and approved retention rule require them.                                                         | Confirm corresponding case and audit history requirements, then delete through an approved, logged maintenance procedure.                                             |
| Weekly-summary delivery records | Preserve while needed to prove delivery and diagnose duplicates.                                                                    | Confirm no reporting or incident investigation relies on the record.                                                                                                  |

> **Rule:** Never use a destructive SQL command as a first response to storage pressure or an incident. Restore and retention actions require a tested export, a peer review, an approved change record, and post-action verification.

## TiDB Cloud backup and export procedure

TiDB Cloud Starter automatically takes backup snapshots. On the free Starter tier, the documented snapshot-retention window is **one day**, and the backup time is randomly fixed.[1] This is insufficient as the sole recovery control for a fraud-monitoring system. Maintain a recurring logical export in addition to the provider snapshot and store the export in an access-controlled location that is separate from Railway and the primary TiDB instance.

| Cadence                                                     | Action                                                                                                                                                                                                                                         | Evidence to retain                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Weekly                                                      | In TiDB Cloud, open the production cluster, choose **Data → Import → Export Data to**, export the FraudLens database as compressed SQL, and download it promptly with the TiDB Cloud CLI. Starter local-file exports expire after two days.[2] | Export timestamp, export task ID, encrypted file checksum, and storage location reference. |
| Monthly                                                     | Restore the latest logical export to an isolated non-production database and run the recovery checks below.                                                                                                                                    | Restore timestamp, reviewer, row-count comparison, health-check result, and issues found.  |
| Before a schema migration or destructive maintenance action | Create and verify a fresh logical export first.                                                                                                                                                                                                | Change-ticket reference and checksum.                                                      |
| After an incident                                           | Preserve the relevant snapshot/export references before making changes.                                                                                                                                                                        | Incident ID, selected recovery point, and authorization record.                            |

Keep exports encrypted at rest, restrict access to the smallest operator group, and never attach exports to tickets, email, or chat. TiDB Cloud supports exporting Starter data as SQL or CSV and supports local-file export as well as selected external storage targets.[2] The free path can use local-file export with an encrypted offline copy; select an independently managed cloud storage target only after confirming its pricing, retention, and access controls.

## Disaster-recovery runbook

When data loss, corruption, unauthorized change, or a database outage is suspected, first preserve evidence and stop unreviewed write operations. Do not restore over the current instance. TiDB Cloud restores to a **new** Starter or Essential instance, which allows the original to remain available for comparison while recovery is evaluated.[1]

| Phase                  | Required action                                                                                                                                                                                 | Completion criterion                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Triage                 | Record the incident time, affected organizations, suspected last-good time, and current Railway release. Pause scheduled changes and rotate credentials immediately if compromise is suspected. | Incident owner and recovery decision are recorded.                 |
| Select recovery point  | In TiDB Cloud **Data → Backup**, choose the newest safe snapshot. Free Starter recovery is limited by its one-day snapshot window; use the verified logical export if it is older.              | The selected point and rationale are peer-reviewed.                |
| Restore safely         | Restore the selected snapshot to a **new** TiDB Cloud instance. Never point production at it until validation is complete.                                                                      | New instance status is `Available`.                                |
| Validate isolated data | Compare schema migrations, organization count, transaction count, recent audit-event count, and a representative evidence record against the approved recovery point.                           | Reviewer signs off on the validation record.                       |
| Cut over               | Update Railway’s `DATABASE_URL` to the validated replacement, redeploy, and verify `/health`, Clerk sign-in, a read-only dashboard route, and one authorized workflow.                          | Production verification is recorded and stakeholders are notified. |
| Follow up              | Retain the original instance until the incident is closed and the rollback window expires. Document root cause, impact, credentials rotated, and required preventive work.                      | Incident review is complete.                                       |

TiDB Cloud documents snapshot restore for Starter and Essential instances; point-in-time restore is preview functionality for Essential and is not available for Starter.[1] If no safe provider snapshot exists, create a new isolated instance and restore the verified logical export using the supported import process. Escalate to TiDB Cloud support if the provider restore does not complete or the data cannot be recovered.

## Recovery exercise checklist

A recovery plan is credible only after it is tested. At least monthly, perform an isolated exercise from a recent logical export and record the result. Confirm that no production credentials or production evidence files are exposed to the exercise environment. Do not mark an exercise complete until the restored schema, core counts, application health endpoint, authentication path, and audit-history readability have all been checked.

## References

1. [Back Up and Restore TiDB Cloud Starter or Essential Data][1]
2. [Export Data from TiDB Cloud Starter or Essential][2]
3. [Express Production Best Practices: Security][3]
4. [Supabase Pricing][4]
5. [Supabase API Keys][5]

[1]: https://docs.pingcap.com/tidbcloud/backup-and-restore-serverless/ "Back Up and Restore TiDB Cloud Starter or Essential Data"
[2]: https://docs.pingcap.com/tidbcloud/serverless-export/ "Export Data from TiDB Cloud Starter or Essential Data"
[3]: https://expressjs.com/en/advanced/best-practice-security.html "Production Best Practices: Security"
[4]: https://supabase.com/pricing "Supabase Pricing"
[5]: https://supabase.com/docs/guides/getting-started/api-keys "Supabase API Keys"
