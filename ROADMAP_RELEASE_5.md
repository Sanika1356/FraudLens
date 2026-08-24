# Roadmap Release 5: Governed Policy Studio

FraudLens now supports configurable, organization-scoped risk-policy governance while preserving deterministic scoring and human review. Managers can model a proposed policy, inspect a read-only impact preview, and create a draft. Only a FraudLens administrator who is also a Clerk administrator of the active organization can approve a draft or roll back to a prior version.

## Delivered capabilities

| Capability                 | Behavior                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Policy Studio              | Manager-facing `/policy` workspace for editing score, amount, velocity, and operational-signal thresholds.                                                         |
| Server-side validation     | Numeric bounds and threshold ordering are enforced in the tRPC input schema and normalized again before persistence.                                               |
| Read-only preview          | Compares the proposed configuration with the active configuration against synthetic cases and reports projected high-risk counts; it does not modify transactions. |
| Draft workflow             | Proposed configurations are stored as immutable version records with a required change note and creator metadata.                                                  |
| Approval and rollback      | Organization administrators activate drafts or retired versions. Existing active versions are retired, and the operation is audit logged.                          |
| Reproducible decisions     | New assessments store the active policy label, while historic assessments retain their original stored policy version.                                             |
| Human-in-the-loop boundary | Policies change scoring and review signals only. No policy action automatically blocks an account or closes a case.                                                |

## Authorization and tenancy

All policy procedures require an active Clerk organization and use the active organization identifier for reads and writes. Preview and draft creation require the organization-scoped FraudLens `manager` or `admin` role. Approval and rollback require both the organization-scoped FraudLens `admin` role and `org:admin` Clerk membership. Frontend visibility is supplemental; the server procedures remain authoritative.

Policy history is filtered by organization in both database and in-memory development paths. The activation helper also verifies that the target policy ID belongs to the requested organization before changing status. No raw configuration secrets, API keys, webhook URLs, or transaction payloads are included in policy audit metadata.

## Migration

Migration `0016_cultured_wind_dancer.sql` creates `riskPolicyVersions`, adds the non-null `transactions.policyVersion` column with a compatibility default of `v1`, and adds the organization/status index. Generate and review this migration as part of deployment, then apply it through the approved production migration process. It was not applied from the development sandbox.

Existing transactions receive `v1` through the additive column default. The built-in policy remains behaviorally equivalent to the previous hard-coded thresholds: low risk below 35, medium risk from 35 through 69, and high risk at 70 or above. New production deployments should verify the migration against a staging database before release.

## Verification

The release was checked with the following gates:

- `pnpm format:check`
- `pnpm check`
- `pnpm test` — 71 tests across 7 files
- `pnpm build`
- `git diff --check`

Policy-specific tests cover normalization/scoring compatibility, organization-isolated draft activation and rollback, and the separation between manager draft access and administrator approval.

## Residual governance risks

The workflow is governed but not a substitute for formal change management. Organizations should still define an approval policy, review threshold calibration against labeled outcomes, monitor segment-level impact, and decide whether a stricter separation of duties is required for their operating model. Concurrent production approvals should be exercised under the database transaction and locking behavior supported by the selected MySQL/TiDB deployment.
