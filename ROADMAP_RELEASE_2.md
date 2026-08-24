# FraudLens Roadmap Release 2

## Delivered

FraudLens now provides organization-scoped related-activity context on transaction details. New assessments are indexed against synthetic merchant-category, country-route, and device-cohort entities, and the detail view shows explainable links to related workspace activity. The UI explicitly labels this as investigative context rather than proof of fraud.

Assessments now expose operational policy signals separately from model factors. The deterministic risk score remains authoritative; policy signals identify conditions such as high-value review, cross-border new-device review, velocity watch, and high-risk queue routing. These signals are persisted independently so future policy changes do not rewrite historical model evidence.

Model Health now includes a bounded threshold simulator. Managers and administrators can preview projected high-risk queue volume and reviewed-outcome precision, recall, and F1 tradeoffs across thresholds from 1 to 99. The simulator is read-only and does not modify the live decision policy.

The public API, queue views, case timeline, security hardening, and existing organization authorization behavior remain intact.

## Database migration

Apply `drizzle/0014_fantastic_sumo.sql` after migrations `0012_tranquil_retro_girl.sql` and `0013_swift_edwin_jarvis.sql`. Migration 0014 creates `riskEntities` and `transactionEntityLinks`, and adds `policySignalJson` to `transactions`.

Older transactions without stored policy signals remain compatible: weekly-summary conversion falls back to deterministic policy-signal derivation. Older transactions without entity links use the same safe synthetic derivation for in-memory demonstration behavior; production records should be backfilled if related-activity search is required for historical cases.

## Validation

| Check               | Result                                      |
| ------------------- | ------------------------------------------- |
| `pnpm check`        | Passed                                      |
| `pnpm test`         | Passed: 7 files, 67 tests                   |
| `pnpm build`        | Passed: client and server bundles generated |
| `pnpm format:check` | Passed                                      |
| `git diff --check`  | Passed                                      |

## Security and product boundaries

Entity keys are derived from synthetic or non-sensitive transaction attributes currently present in the demonstration data model. Do not treat merchant category, country route, or device cohort as a real customer, account, or device identity. A production implementation should replace these cohorts with approved keyed identifiers and explicit data-governance controls.

Threshold analysis uses investigator-confirmed outcomes only. Unreviewed alerts are included only in projected queue volume, not as ground truth. The LLM remains an explanation refinement mechanism and cannot change the underlying risk level, probability, factors, or policy signals.

## Files of interest

| Area                        | Files                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Entity schema and migration | `drizzle/schema.ts`, `drizzle/0014_fantastic_sumo.sql`                                  |
| Entity persistence          | `server/db.ts`, `server/routers.ts`                                                     |
| Policy signals              | `server/riskEngine.ts`, `server/demoData.ts`, `server/weeklySummaries.ts`               |
| Threshold simulator         | `server/outcomeFeedback.ts`, `server/routers.ts`, `client/src/pages/FraudLensPages.tsx` |
| Regression coverage         | `server/roadmap.test.ts`                                                                |
