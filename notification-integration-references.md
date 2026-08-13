# Notification Integration References

The notification feature uses direct HTTPS delivery from the FraudLens server. The following sources were verified during implementation on 2026-08-13.

| Provider | Confirmed delivery approach | Implementation note | Source |
| --- | --- | --- | --- |
| Slack | Incoming webhook URL with an HTTP `POST` JSON payload containing `text`. | Webhook URLs are secrets and must never be committed or exposed outside authorized workspace managers. | https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks |
| Microsoft Teams | Teams Workflows/Power Automate can receive webhook requests and post messages to a channel or chat. | New configurations should use a workflow URL; legacy Microsoft 365 connectors are nearing deprecation. | https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook |
| Resend | Transactional email REST API; free tier is limited to 100 emails per day. | `RESEND_API_KEY` stays server-only in local/deployment environment configuration. | https://resend.com/docs/knowledge-base/what-is-resend-pricing |

This record contains no webhook URL, API key, recipient address, or other credential.
