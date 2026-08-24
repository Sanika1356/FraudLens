# FraudLens Feature Roadmap

## Product direction

FraudLens already demonstrates the core decision-support loop: submit or ingest a transaction, receive a transparent risk result, investigate the case, record an outcome, and inspect model-health signals. The next step should not be adding more dashboards. The highest-value evolution is to make FraudLens a **complete investigator operating system**: it should help an analyst decide what to review next, understand relationships around the alert, document why a decision was made, and show whether the process is improving.

The product should remain human-in-the-loop. Automated decisions such as account blocking, payment rejection, or customer communication should not be introduced until there is an approved production data model, governance process, calibrated policy, and independent review. This is consistent with the current product requirements, which position FraudLens as a demonstration decision-support system rather than an autonomous enforcement platform.

## Highest-value opportunities

| Priority | Feature or update                                                 | User value                                                                                  | Business value                                                               | Relative effort |
| -------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------- |
| P0       | Investigator queue with saved views, SLA states, and bulk actions | Analysts spend less time filtering and more time resolving the right cases                  | Improves throughput, consistency, and manager visibility                     | Medium          |
| P0       | Case timeline and evidence-quality workflow                       | Reviewers can reconstruct what happened and why                                             | Produces defensible, auditable decisions                                     | Medium          |
| P0       | Related-activity and entity context                               | Analysts see linked devices, merchants, accounts, references, and repeated patterns         | Detects organized or repeated fraud that isolated transaction scoring misses | High            |
| P0       | Reliable ingestion and idempotency controls                       | Integrators know whether a transaction was accepted, duplicated, or failed                  | Makes the public API usable in real operational workflows                    | Medium          |
| P1       | Rules and policy layer above the risk score                       | Operations teams can express business-specific controls without code changes                | Makes the product configurable and commercially adaptable                    | High            |
| P1       | Analyst feedback loop and threshold simulator                     | Model reviewers can see where the policy performs well or poorly before changing thresholds | Connects investigation outcomes to measurable model improvement              | Medium          |
| P1       | Organization-level dashboards and scheduled reports               | Managers can compare queue health, outcomes, and trends over time                           | Supports operational management and renewal conversations                    | Medium          |
| P1       | Stronger account-protection and notification center               | Users can recognize trusted FraudLens activity and respond to suspicious access             | Reduces account-takeover and impersonation risk                              | Medium          |
| P2       | Controlled case collaboration and escalation                      | Complex investigations can move between analysts, managers, and specialists                 | Supports larger teams and clearer ownership                                  | Medium          |
| P2       | Connector and webhook ecosystem                                   | FraudLens can receive and send events without custom integration work                       | Expands distribution and reduces implementation friction                     | High            |
| P2       | Production model registry and champion/challenger evaluation      | Teams can compare model versions with traceable approvals                                   | Creates a credible path from portfolio demo to governed platform             | High            |

## Recommended first three releases

### Release 1: Make the case queue operational

The first release should improve the daily investigator experience rather than expand the number of analytics pages. FraudLens should support saved queue views such as “new high risk,” “my overdue cases,” “unassigned critical cases,” and “recently reopened.” Each view should preserve filters for risk, case status, priority, assignee, due date, merchant category, and creation window.

Add bulk actions with deliberate confirmation for low-risk administrative operations such as assigning multiple cases, changing priority, or marking cases as seen. Avoid bulk outcome decisions in the first iteration. Every bulk action should create a single parent audit event with child case references, and the server must re-check authorization and current case state for every selected case rather than trusting the client’s list.

Add queue columns for age, SLA state, current assignee, last activity, and evidence count. The current `casePriority`, `dueAt`, `assigneeId`, `caseStatus`, and audit data provide a useful foundation. The missing pieces are a durable queue-view model, explicit SLA states, and a case-level last-activity projection.

Suggested success measures are median time from alert creation to first review, percentage of critical cases with an assignee, percentage of overdue cases, and percentage of resolved cases with a complete reason and evidence trail.

### Release 2: Add related-activity context

A transaction-level score is useful but incomplete. Investigators need to know whether the same device, merchant, account, country pair, or behavioral pattern appears in other cases. Add an entity-context panel to the transaction detail view with related alerts, repeated references, shared device indicators, merchant-level risk history, and recent activity windows.

For the demonstration version, this can use synthetic stable identifiers and derived fingerprints rather than personal data. The UI should show why two records are related, for example “same device fingerprint in three cases during the last 24 hours,” instead of exposing an opaque graph with unexplained edges.

A practical data model would add a normalized `riskEntities` table and a `transactionEntityLinks` table. The entity type could be `account`, `device`, `merchant`, `email_domain`, or `behavioral_cluster`; the value should be stored as a keyed hash or synthetic identifier rather than raw sensitive data. Queries must always include `orgId`, and the UI should never allow a user to search across organizations.

The first release should avoid presenting graph connections as proof of fraud. Related activity is investigative context, not an automatic verdict. Add a visible distinction between “shared attribute,” “behavioral similarity,” and “confirmed case relationship.”

### Release 3: Make ingestion dependable

The current public API is a good foundation, but a production integrator needs stronger delivery semantics. Add an idempotency key, a stable external transaction ID, and explicit request status. The API should distinguish accepted, already accepted, validation failed, unauthorized, and temporarily unavailable responses. A client retrying the same request should not create a second case or produce ambiguous results.

Add a manager-facing ingestion health page showing request volume, success rate, validation failures, duplicate rate, rate-limit responses, recent failures, and the last successful request per API key. Do not show API secrets; display only prefixes and operational metadata.

Add an optional asynchronous ingestion mode for larger batches. The initial synchronous endpoint can remain unchanged. A future batch endpoint could return an import ID, process records in bounded chunks, preserve per-row errors, and expose a completion summary. Each batch should be immutable after submission, with explicit cancellation and retention rules.

The existing `apiKeys`, `apiRequestLogs`, and transaction-reference uniqueness model can support this direction. The key additions are an idempotency table, ingestion status fields, and a job or batch model if asynchronous processing is introduced.

## Feature details by product area

### Investigator workflow

| Feature                 | Recommended behavior                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved views             | Allow each user to save private views and managers to publish organization views. Store only validated filters, sort order, and display columns.            |
| Case timeline           | Combine status changes, comments, assignments, evidence additions, notifications, and exports into one chronological timeline.                              |
| SLA management          | Define priority-based response targets, calculate `on_track`, `due_soon`, `overdue`, and `paused` states, and record when a deadline changes.               |
| Escalation              | Allow an analyst to escalate a case with a structured reason; require manager acknowledgement rather than silently changing ownership.                      |
| Guided review checklist | Completed in Roadmap Release 6: organization-scoped review steps and bounded notes stored separately from the final case outcome.                           |
| Case reopen             | Permit reopening only with a required reason and audit event. Preserve the previous resolution rather than overwriting it.                                  |
| Evidence quality        | Add evidence type, source, verification status, collected-at time, and reviewer confidence. Keep external links visibly separate from uploaded attachments. |
| Export controls         | Completed in Roadmap Release 7: export reason, server-enforced row-count limits, and audit tracking. Avoid unrestricted case-data downloads.                |

### Risk intelligence

| Feature               | Recommended behavior                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Risk score versioning | Store model or policy version with every assessment so historical scores remain interpretable after changes.                                           |
| Score comparison      | Show the current score alongside the previous score when an assessment is rescored, with the reason for the change.                                    |
| Reason codes          | Expand outcome and escalation reasons into a controlled, organization-configurable taxonomy with an `other` explanation.                               |
| Rule contributions    | Distinguish model factors, policy rules, and manually added investigator signals. Do not mix them into one unexplained score.                          |
| Threshold simulator   | Let managers compare precision/recall and queue-volume consequences across thresholds using historical feedback, without changing the live threshold.  |
| Drift alerts          | Add configurable thresholds, owner, acknowledgement, and status history to the current drift snapshots.                                                |
| Explainability review | Show a stable explanation contract with factor evidence, timestamp, model version, and limitations. The LLM should only rewrite bounded derived facts. |

### Operations and management

| Feature                    | Recommended behavior                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Queue health dashboard     | Completed in the operational Reporting workspace: intake, backlog, overdue, resolution, and queue summary metrics are organization-scoped.                               |
| Analyst workload           | Completed in the operational Reporting workspace: assigned, open, critical, overdue, and unassigned workload are shown without simplistic performance ranking.           |
| Scheduled reporting        | Partially completed: manager-configured weekly summaries are scheduled, idempotent, and organization-scoped; daily/API/drift templates remain deferred.                  |
| Organization configuration | Let managers configure case priorities, SLA durations, reason-code taxonomy, evidence categories, and alert thresholds with versioned changes.                           |
| Data retention             | Completed in Roadmap Release 8: versioned organization-level retention settings with preview, approval, and no-automatic-deletion boundary.                              |
| Incident mode              | Completed in Roadmap Release 10: organization-scoped read-only mode with server-side write suspension, public-ingestion pause, administrator recovery, and audit events. |

### Security and trust features

| Feature                | Recommended behavior                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security center        | Show recent sign-ins, active sessions, API keys, webhook destinations, role changes, and suspicious access events to authorized managers/admins.                                             |
| Reauthentication       | Require recent authentication for API-key creation, role changes, webhook changes, exports, retention changes, and other high-impact actions. Delegate the actual factor challenge to Clerk. |
| Login notifications    | Notify the user or organization security recipient on new device, unusual location, repeated failures, role changes, and session revocation where provider support allows.                   |
| Trusted-domain display | Show the current FraudLens domain in application-generated messages and clearly label user-supplied external evidence links as untrusted.                                                    |
| Webhook verification   | Sign outbound webhook payloads, support secret rotation, provide delivery IDs, and expose retry status without exposing the secret.                                                          |
| Security event search  | Allow authorized users to filter by event category, actor, outcome, and time while redacting tokens, raw URLs containing secrets, and unnecessary personal data.                             |
| Access review          | Provide periodic review of organization members, application roles, API keys, notification recipients, and external integrations.                                                            |

### Integration and data platform

| Feature                  | Recommended behavior                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bulk import improvements | Add a preview step, schema version, dry run, downloadable error report, import ID, and duplicate policy before persistence.                                                    |
| Webhook ingestion        | Accept signed event envelopes with replay protection, timestamp validation, bounded payloads, and organization-specific credentials.                                           |
| Outbound event stream    | Publish case-created, case-resolved, evidence-added, and drift-alert events with minimal payloads and delivery retry state.                                                    |
| Connector catalog        | Start with one or two high-value integrations such as a case-management system, SIEM, or approved messaging platform rather than building a generic connector framework first. |
| Data quality monitoring  | Track missing fields, unexpected categories, stale feeds, duplicate rates, and schema violations separately from model drift.                                                  |
| Synthetic data generator | Add repeatable scenarios for account takeover, mule behavior, merchant compromise, impossible travel, and benign high-value purchases.                                         |

## Recommended data-model evolution

The current schema is strong for a demonstration but will become difficult to extend if every feature is stored directly on `transactions`. Add explicit domain entities and immutable event records rather than continually adding nullable columns.

| New table or concept                         | Purpose                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `savedViews`                                 | User-private and organization-published queue filters with validated configuration.                    |
| `caseEvents`                                 | Immutable normalized case timeline events; existing audit events can remain the security/audit stream. |
| `caseChecklists` and `caseChecklistItems`    | Configurable investigation steps and completion history.                                               |
| `riskEntities`                               | Organization-scoped synthetic or keyed entity identifiers.                                             |
| `transactionEntityLinks`                     | Explainable links between a transaction and risk entities.                                             |
| `idempotencyKeys`                            | Organization/API-key-scoped request replay protection and response recovery.                           |
| `ingestionBatches` and `ingestionBatchItems` | Bounded asynchronous imports with per-row status and error details.                                    |
| `policyRules` and `policyVersions`           | Versioned business rules separate from model output.                                                   |
| `thresholdExperiments`                       | Non-production threshold simulations against historical feedback.                                      |
| `webhookEndpoints` and `webhookDeliveries`   | Signed outbound delivery configuration, status, retries, and rotation metadata.                        |
| `retentionPolicies`                          | Organization-level retention settings with approval and effective dates.                               |

Every new tenant-owned table should have a non-null `orgId`, a composite uniqueness strategy where appropriate, and server-side query helpers that require `orgId` as an argument. Any user-facing identifier should be treated as untrusted input and checked against the active organization before use.

## What not to add yet

Do not prioritize automatic account blocking, autonomous customer outreach, raw card-data ingestion, unrestricted free-form AI chat over case data, cross-organization benchmarking, or a large generic integration marketplace. These features would increase operational, privacy, and governance risk before the product has stronger data contracts, retention rules, human-approval workflows, and production monitoring.

Do not make the LLM responsible for the risk decision. Keep the deterministic or versioned scoring contract authoritative, pass only bounded derived factors to the model, validate structured output, and preserve a deterministic fallback. The AI feature should improve explanation quality and investigator productivity, not create a hidden policy engine.

## Suggested implementation sequence

| Phase | Scope                                                                                      | Deliverable                                                     |
| ----- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| 1     | Queue views, SLA states, case timeline, and bulk assignment                                | Faster and more auditable daily investigations                  |
| 2     | Related-activity context using synthetic/keyed entities                                    | Better detection of repeat and coordinated patterns             |
| 3     | API idempotency, ingestion health, import preview, and batch status                        | Dependable integration and lower operational ambiguity          |
| 4     | Policy/rules layer, reason-code administration, and threshold simulator                    | Configurable operations without changing model code             |
| 5     | Security center, reauthentication, access review, and webhook delivery controls            | Stronger trust and enterprise readiness                         |
| 6     | Completed in Roadmap Release 9: governed model registry and champion/challenger evaluation | Model provenance and approval history without silent deployment |

## If only one feature can be built next

Build the **approved connector and deployment-control workflow** next. Keep external integrations allowlisted, organization-scoped, audited, and disabled by default until an administrator approves the destination and verifies the operational boundary. Provider reauthentication, login notifications, signed webhook delivery, and production deployment gates still require external configuration and infrastructure ownership.

## References

[1]: PRD.md "Current FraudLens product requirements and explicit non-goals"
[2]: README.md "Current architecture, capabilities, deployment, and limitations"
[3]: drizzle/schema.ts "Current database entities and organization ownership fields"
[4]: server/routers.ts "Current tRPC procedures and workflow operations"
[5]: server/publicApi.ts "Current public transaction assessment API"
[6]: SECURITY_AUDIT.md "Security audit and hardening report"
