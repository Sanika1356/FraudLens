# Roadmap Release 9: Governed Model Registry

FraudLens now includes an organization-scoped model registry for recording evaluated model candidates and the human approval decision that promotes a challenger to champion. The registry makes model provenance and evaluation metadata visible without allowing an unreviewed artifact to alter live scoring.

## Delivered capabilities

| Capability              | Behavior                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Champion record         | Each organization has a built-in demonstration champion derived from the existing model-health metadata.                                                    |
| Challenger registration | Managers can register bounded aggregate evaluation metadata, dataset labels, and an artifact fingerprint. Raw evaluation rows and secrets are not accepted. |
| Evaluation preview      | Managers can compare challenger precision, recall, F1, PR-AUC, threshold, and reviewed-row counts with the current champion.                                |
| Approval                | Only a FraudLens administrator who is also `org:admin` in the active Clerk organization can promote a challenger.                                           |
| Rollback                | The same server-enforced administrator boundary can restore a retired champion.                                                                             |
| Audit history           | Candidate creation, champion approval, and rollback are recorded in the organization-scoped audit stream.                                                   |
| Live-scoring boundary   | Registry promotion does not change the deterministic manual assessment engine in this release.                                                              |
| Tenant isolation        | Registry reads, writes, approval, and rollback all scope the target by the active organization identifier.                                                  |

## Operating workflow

Open **Model Registry** from the workspace navigation. Enter aggregate metrics from an approved evaluation run, an artifact fingerprint, a dataset label, and a governance note. Use **Preview comparison** before selecting **Register challenger**. An eligible administrator can then approve the challenger from registry history or restore a retired champion.

Metrics use bounded milli-percent storage for precision, recall, F1, and PR-AUC, while the UI displays percentages. Thresholds are constrained to the inclusive range 0–1 and reviewed-row counts are bounded to prevent unbounded payloads. These constraints improve data quality but do not establish model fitness or regulatory compliance.

## Security boundary

The UI is supplemental. The server requires manager access for registry reads, previews, and candidate registration. Promotion and rollback require both the FraudLens administrator application role and `org:admin` membership in the active Clerk organization. Every mutation is tied to the active organization and writes an immutable audit event.

The registry stores evaluation metadata and an opaque artifact fingerprint; it does not upload, execute, or deploy a model artifact. The existing deterministic scoring and human investigation workflow remain authoritative. A champion label in this registry must not be interpreted as a production deployment signal until an execution adapter, release gate, monitoring plan, and rollback-tested deployment path exist.

## Migration and validation

Migration `0019_flashy_thundra.sql` creates the versioned model-registry table with organization/model/version uniqueness and organization/status lookup indexes. It was generated and inspected locally but not applied to any production database. Apply it through the approved staging and production migration process.

Regression coverage includes candidate lifecycle and rollback, cross-organization activation rejection, analyst access denial, non-organization-admin promotion denial, manager candidate registration, and end-to-end formatting, type checking, tests, production build, and whitespace validation.

## Residual risks and next steps

The current registry is a governance ledger rather than a model-serving control plane. Before connecting it to live scoring, add signed artifact provenance, immutable evaluation manifests, approval separation of duties where required, minimum evaluation sample rules, subgroup/fairness review, calibration and drift gates, deployment health checks, automatic champion observability, and a tested rollback mechanism. Keep model promotion separate from fraud decisions and preserve investigator review for consequential actions.

## References

[1]: README.md "FraudLens architecture, security boundary, and deployment guidance"
[2]: docs/ADMINISTRATOR_GUIDE.md "FraudLens administrator and investigator operating guidance"
[3]: FEATURE_ROADMAP.md "FraudLens product roadmap and human-in-the-loop non-goals"

This release is documented against the repository sources above.[1] [2] [3]

This release adds migration `0019_flashy_thundra.sql`; it does not deploy or execute model artifacts.
