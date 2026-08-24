# Roadmap Release 7: Secure Investigator Exports

FraudLens now treats operational report downloads as governed data-export events rather than untracked convenience actions. Managers and administrators must provide a concise export reason, and the server enforces a maximum of 1,000 exported rows for both CSV and text-summary downloads.

## Delivered capabilities

| Capability             | Behavior                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Required export reason | CSV and summary downloads require a trimmed reason of 5–300 characters.                                                                      |
| Server-side row limit  | Each export request must specify 1–1,000 rows. The server applies the limit after newest-first filtering and before generating file content. |
| Audit metadata         | Export events include the active organization, actor, filters, exported row count, requested limit, and bounded reason.                      |
| Existing authorization | Export endpoints remain restricted to organization managers and administrators through server-side procedures.                               |
| UI guardrails          | Reporting shows the required reason and maximum-row fields and disables download buttons when either value is invalid.                       |
| Formula-safe CSV       | Existing CSV-cell escaping remains in place, including protection for spreadsheet formula prefixes.                                          |

## Operating workflow

Open **Reporting**, apply the intended workspace filters, enter a short business purpose such as “quarterly investigator review,” choose the smallest practical row limit, and then download the summary or CSV. The report is generated only from the active organization’s records. The reason is recorded in the immutable audit stream; do not put customer secrets, credentials, full payment-card data, or unnecessary personal information in the reason.

The row limit controls the size of the generated export and is not a substitute for data classification or retention policy. Managers should still use the narrowest date range and filters that satisfy the approved purpose.

## Security boundary

Both export procedures use the existing organization-manager authorization gate. Input validation is performed by the server, so a caller cannot bypass the required reason or increase the row limit by manipulating the browser. The overview query remains unchanged and is not an export; the export limit applies only to downloaded file content.

Export reasons are bounded but user supplied. Audit viewers should treat them as operational text rather than trusted markup. The application does not copy raw report rows into audit metadata.

## Validation and deployment

This release does not require a new database table or migration because it uses the existing organization-scoped audit event infrastructure. The changes are additive to the report request contract, so API clients and internal callers must send the new `filters`, `reason`, and `rowLimit` object for download procedures.

Validation includes direct row-limit coverage, invalid-reason authorization coverage, existing organization isolation checks, formatting, type checking, tests, production build, and whitespace validation.

## Residual risks and next steps

A reason and row limit improve accountability but do not prevent an authorized manager from exporting sensitive data for an inappropriate purpose. A production rollout should pair these controls with data classification, retention and deletion policy, access reviews, storage/download monitoring, and organization-approved export workflows. Future improvements may add export approval for especially sensitive datasets, expiring signed-download links, and organization-configurable limits, but those controls should remain server-enforced and auditable.

## References

[1]: README.md "FraudLens architecture, security boundary, and deployment guidance"
[2]: docs/ADMINISTRATOR_GUIDE.md "FraudLens administrator and investigator operating guidance"
[3]: FEATURE_ROADMAP.md "FraudLens product roadmap and human-in-the-loop non-goals"

This release is documented against the repository sources above.[1] [2] [3]

This release has no database migration; it extends the existing report and audit contracts.
