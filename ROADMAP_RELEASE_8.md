# Roadmap Release 8: Governed Retention Policies

FraudLens now provides an organization-scoped retention-policy workspace for documenting proposed transaction, evidence, and audit-event retention windows. The feature is deliberately governance-first: managers can preview and draft a policy, while activation and rollback require a FraudLens administrator who is also an administrator in the active Clerk organization.

## Delivered capabilities

| Capability                   | Behavior                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Versioned retention policies | Each organization has a built-in active version and can create draft, active, and retired versions.                          |
| Preview                      | Managers can see the proposed eligibility dates for each retention category without triggering cleanup.                      |
| Approval and rollback        | Server-enforced administrator procedures activate drafts or restore retired versions and retire the previous active version. |
| Effective date               | A draft records the intended effective date independently from its creation and approval timestamps.                         |
| Audit trail                  | Draft creation, approval, and rollback are written to the organization-scoped immutable audit stream.                        |
| No automatic deletion        | The page explicitly reports that transactions, evidence, and audit records are not deleted by this release.                  |
| Tenant isolation             | Policy reads, writes, activation, and rollback all include the active organization identifier.                               |

## Operating workflow

Open **Retention Policies** from the workspace navigation. Review the active windows, enter proposed windows and an effective date, run **Preview eligibility**, and provide a change note before creating a draft. An administrator can approve the draft or roll back to a retired version from the policy history.

The release uses conservative bounds: transaction and evidence windows are 30–3,650 days, while audit-event windows are 90–3,650 days. These are validation bounds, not a legal or compliance recommendation. Organizations must obtain appropriate legal and compliance review before adopting a retention period.

## Security boundary

The UI is supplemental. Server procedures enforce active-organization access and manager versus organization-administrator role requirements. A manager cannot approve or roll back a policy, and an administrator who is only an organization member cannot activate it. The policy is documentation and governance state only; it does not start a deletion job or silently alter existing records.

The current release does not implement irreversible deletion, scheduled cleanup, evidence-bucket lifecycle rules, or legal-hold handling. That limitation is intentional until the organization has approved retention semantics and a tested recovery process.

## Migration and validation

Migration `0018_fat_pestilence.sql` creates the versioned retention-policy table with organization/version uniqueness and organization/status lookup indexes. It was generated and inspected locally but not applied to any production database. Apply it through the approved staging and production migration process.

Regression coverage includes retention lifecycle persistence, cross-organization activation rejection, analyst and non-organization-admin authorization failures, manager draft creation, preview validation, formatting, type checking, tests, production build, and whitespace validation.

## Residual risks and next steps

A documented policy is not an enforcement mechanism. Before implementing cleanup, add legal-hold exceptions, deletion dry runs, approval records tied to a specific execution, per-resource counts, resumable jobs, provider-storage lifecycle controls, and restore verification. Keep audit history append-only or define a separately approved audit-retention process; do not delete evidence solely because its nominal window has elapsed.

## References

[1]: README.md "FraudLens architecture, security boundary, and deployment guidance"
[2]: docs/ADMINISTRATOR_GUIDE.md "FraudLens administrator and investigator operating guidance"
[3]: FEATURE_ROADMAP.md "FraudLens product roadmap and human-in-the-loop non-goals"

This release is documented against the repository sources above.[1] [2] [3]

This release adds migration `0018_fat_pestilence.sql`; it does not apply the migration or perform deletion.
