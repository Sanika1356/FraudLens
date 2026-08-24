# Roadmap Release 10: Incident Mode

FraudLens now provides an organization-scoped incident mode for suspected workspace compromise, provider outage, or data-integrity incidents. When enabled, server-side organization mutations and public transaction ingestion are suspended while read-only investigation and administrator recovery remain available.

## Delivered capabilities

| Capability                  | Behavior                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Organization control record | Each organization has one control record with incident state and activation metadata.                                                 |
| Administrator activation    | Only a FraudLens administrator who is also `org:admin` in the active Clerk organization can enable or disable incident mode.          |
| Required activation note    | Enabling incident mode requires a bounded explanation of at least five characters.                                                    |
| Server-side write gate      | Organization-scoped tRPC mutations are rejected while incident mode is active. The administrator recovery mutation remains available. |
| Public ingestion suspension | External transaction assessment returns a retryable 503 response while the organization is in incident mode.                          |
| Read-only access            | Organization reads, Security Center status, and audit review remain available.                                                        |
| Audit trail                 | Incident-mode activation and deactivation are recorded in the organization-scoped audit stream.                                       |
| Secret safety               | Status and audit metadata contain no API secrets, webhook URLs, or request payloads.                                                  |

## Operating workflow

Open **Security Center** and review the incident-mode panel. An organization administrator can activate the mode with a concise reason. Investigators can continue reviewing existing data, while write operations and API ingestion are paused. After the incident is contained and the workspace is verified, the same administrator boundary can exit incident mode. External callers should honor the 503 response and retry after the returned delay.

## Security boundary

Incident mode is enforced in server middleware rather than only by disabling buttons in the UI. The active organization identifier is checked before reading or changing the control record. The public API checks the API key’s organization after key authorization and before parsing or persisting the transaction payload. The control mutation is explicitly exempted so administrators retain a recovery path.

This release does not revoke Clerk sessions, rotate API keys, disable provider webhooks, or replace a formal incident-response process. Those actions remain provider and operations responsibilities and should be performed through approved runbooks when compromise is suspected.

## Migration and validation

Migration `0020_sad_thunderball.sql` creates the organization control table with a unique organization key and no secret-bearing columns. It was generated and inspected locally but not applied to any production database.

Regression coverage includes administrator-only activation, analyst and organization-member denial, manager read access during an incident, mutation suspension, recovery access, formatting, type checking, tests, production build, and whitespace validation.

## Residual risks and next steps

The write gate covers organization-scoped tRPC procedures and the public transaction ingestion path. Any future write path, background worker, webhook consumer, connector, or deployment endpoint must explicitly consult the same organization control before performing work. Production incident response still requires session revocation, credential rotation, evidence preservation, legal/compliance coordination, and post-incident review.

## References

[1]: README.md "FraudLens architecture, security boundary, and deployment guidance"
[2]: docs/ADMINISTRATOR_GUIDE.md "FraudLens administrator and investigator operating guidance"
[3]: FEATURE_ROADMAP.md "FraudLens product roadmap and human-in-the-loop non-goals"

This release is documented against the repository sources above.[1] [2] [3]

This release adds migration `0020_sad_thunderball.sql`; it does not revoke sessions or rotate provider credentials.
