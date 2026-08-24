# Roadmap Release 6: Guided Review Checklist

FraudLens now includes a structured review checklist on transaction detail pages. The checklist turns recurring investigative steps into explicit, auditable prompts while preserving investigator judgment and the existing human-in-the-loop outcome workflow.

## Delivered capabilities

| Capability                 | Behavior                                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guided review prompts      | Each case presents identity, device/access, merchant/payment, related-activity, and evidence/resolution review steps.                                                                                 |
| Progress tracking          | Investigators can see completed versus total checklist items without changing the case outcome.                                                                                                       |
| Reviewer notes             | Each step supports an optional bounded note of up to 500 characters. Notes remain separate from the final case note and resolution reason.                                                            |
| Per-item updates           | Analysts, managers, and administrators can complete or reopen a checklist item through server-validated procedures.                                                                                   |
| Audit trail                | Every completion or reopening creates an organization-scoped `case.checklist_updated` audit event containing only the item key and completion state. The note text is not copied into audit metadata. |
| Tenant isolation           | Checklist rows, reads, writes, and audit events require the active organization identifier. A case ID from another organization is rejected before checklist access.                                  |
| Human-in-the-loop boundary | The checklist is guidance only. It does not block resolution, auto-close cases, make fraud decisions, or treat related activity as proof.                                                             |

## Investigator workflow

Open a transaction detail page and use **Guided review checklist** beneath the assessment evidence. Check an item after reviewing the relevant approved sources, add a concise factual note when useful, and save the note. Reopening an item is supported when later evidence changes the review state. The checklist complements, but does not replace, the required case note and controlled resolution reason when closing a case.

Checklist guidance deliberately avoids requesting raw credentials, full payment-card data, or unnecessary personal information. Notes should describe the review performed and the resulting evidence quality rather than copying sensitive source material into FraudLens.

## Authorization and tenancy

The checklist uses the ordinary organization-scoped investigator procedure. An authenticated user must have an active Clerk organization; the server checks that the requested transaction belongs to that organization before reading or updating checklist items. Frontend controls are not the authorization boundary. All checklist persistence and audit writes are server-side and include `orgId` in their lookup conditions.

The checklist is intentionally available to analysts because it supports their normal review responsibilities. Manager and administrator privileges remain required for existing supervisory, reporting, security, and policy-governance operations.

## Migration

Migration `0017_slippery_the_call.sql` creates `caseChecklistItems` with a composite uniqueness constraint on `(orgId, transactionId, itemKey)` and an organization/transaction lookup index. It was generated and inspected locally but was not applied to a production database. Apply it through the approved staging and production migration process after reviewing the deployment backup and rollback plan.

Checklist templates are defined in server code so the first release does not require seeding organization-specific configuration. The table stores only changed item state; untouched items are returned from the safe built-in template with an incomplete status.

## Verification

The release was validated with the following repository gates:

- `pnpm format:check`
- `pnpm check`
- `pnpm test`
- `pnpm build`
- `git diff --check`

Regression coverage includes direct checklist persistence, reviewer-note preservation, active-organization isolation, route-level case ownership checks, and audit-compatible update behavior.

## Residual risks and next steps

A checklist improves consistency but cannot prove that an investigator performed a review. Organizations should define their approved evidence sources, train investigators on prohibited sensitive data, and periodically sample completed cases for quality. Future iterations may add organization-configurable templates, item-level evidence references, required-step policies, and completion timestamps in operational reporting, but those changes should continue to use versioned configuration and explicit governance rather than silently changing existing cases.

## References

[1]: README.md "FraudLens architecture, security boundary, and deployment guidance"
[2]: docs/ADMINISTRATOR_GUIDE.md "FraudLens administrator and investigator operating guidance"
[3]: FEATURE_ROADMAP.md "FraudLens product roadmap and human-in-the-loop non-goals"

This release is documented against the repository sources above.[1] [2] [3]
