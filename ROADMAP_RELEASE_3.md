# FraudLens Roadmap Release 3

## Delivered

FraudLens now includes a manager-facing **Security Center** available at `/security`. It provides an organization-scoped view of masked API-key inventory, configured notification destination hostnames, recent security events, and the most recent recorded access review.

The access-review action is deliberately restricted to a FraudLens administrator who also has Clerk `org:admin` membership. It requires a bounded review note and records an append-only organization-scoped audit event. The Security Center does not expose API secrets, full webhook URLs, tokens, or raw sensitive payloads.

The dashboard navigation now includes Security Center for managers and administrators. The page distinguishes application-enforced protections from provider or deployment follow-ups, including Clerk MFA/recovery configuration and shared rate-limiting infrastructure.

## Server contract

| Procedure                       | Access                                                        | Purpose                                                                                                       |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `security.overview`             | Organization manager or administrator                         | Returns masked API-key metadata, webhook hostnames, last access-review record, and recent organization events |
| `security.completeAccessReview` | FraudLens administrator plus Clerk organization administrator | Records a bounded access-review note and audit event                                                          |

## Security boundaries

The overview is organization-scoped through the active Clerk organization and server-side procedure middleware. Webhook values are reduced to hostnames before returning to the client. API-key secrets remain undisclosed and are represented only by name, prefix, lifecycle state, and usage timestamps.

The access-review note is intentionally bounded to 300 characters and stored only as audit metadata. Administrators should avoid placing credentials, customer data, or raw incident details in the note.

## Validation

| Check               | Result                                      |
| ------------------- | ------------------------------------------- |
| `pnpm check`        | Passed                                      |
| `pnpm test`         | Passed: 7 files, 68 tests                   |
| `pnpm build`        | Passed: client and server bundles generated |
| `pnpm format:check` | Passed                                      |
| `git diff --check`  | Passed                                      |

## Deployment notes

No database migration is required for the Security Center because it reuses the existing audit, API-key, and notification-preference records. Deploy the application after the earlier migrations are already applied.

Before production use, verify Clerk MFA and recovery policies, rotate webhook and API credentials through the configured secret manager, confirm the evidence bucket remains private, and add a shared rate limiter or edge/WAF control before horizontal scaling. The Security Center reports these items as follow-ups rather than claiming they are automatically configured by application code.
