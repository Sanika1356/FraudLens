# FraudLens Product Requirements Document

**Product:** FraudLens  
**Version:** 1.0 — portfolio demonstration  
**Owner:** Project contributor  
**Status:** Approved for implementation

## 1. Product summary

FraudLens is an internal transaction-risk intelligence workspace for investigators and fraud analysts. It turns structured transaction inputs into a consistent risk decision, an ordered set of contributing factors, and a concise, non-technical explanation. Analysts can review alerts, update the investigation state, add notes, inspect model-quality indicators, and watch for feature drift.

> FraudLens is a **demonstration decision-support system**. It will use privacy-preserving synthetic transaction data and must not be represented as a live banking fraud-detection service or as a replacement for human investigation.

## 2. Problem and users

Analysts need to decide which transactions merit investigation without working across disconnected spreadsheets, risk-model outputs, and case notes. A useful workspace must prioritise potentially harmful activity while preserving enough context for a reviewer to understand and override a prediction.

| User | Primary objective | Core need |
|---|---|---|
| Fraud investigator | Review and resolve potentially suspicious activity | An ordered work queue, clear rationale, and a place to record a decision |
| Fraud operations analyst | Monitor risk patterns and case throughput | A reliable overview of risk levels, status, and trend signals |
| Model reviewer | Check whether model performance or feature distributions are deteriorating | Performance metrics, a confusion matrix, and a baseline-versus-recent drift view |
| Portfolio reviewer | Assess engineering and applied-ML capability | A coherent product narrative, clean UX, documented limitations, and testable system behaviour |

## 3. Goals and success criteria

The first release must support the complete flow from submission through decision: a reviewer submits or opens a transaction, receives a low/medium/high risk score and understandable rationale, records a case outcome, and can later find the transaction through history filters.

| Goal | Acceptance criterion |
|---|---|
| Rapid triage | Every submission receives a risk label, probability, and contributors in the same interaction without page reload |
| Explainability | Every prediction contains at least two plain-English drivers; no raw coefficient, feature key, or ML jargon is shown as the primary explanation |
| Case continuity | A reviewer can change an alert to **under review**, **confirmed fraud**, or **legitimate**, and can save a non-empty note |
| Observability | The dashboard visibly distinguishes newly flagged high-risk alerts, reports fixed evaluation metrics, and shows baseline-versus-recent feature comparisons |
| Consistency | All screens use exactly the labels **low**, **medium**, and **high** for risk, and exactly **under review**, **confirmed fraud**, and **legitimate** for case status |
| Presentation quality | Desktop and mobile views have readable contrast, keyboard-reachable controls, visible loading/empty/error states, and no placeholder workflow presented as complete |

## 4. Scope

### In scope

| Area | Requirement |
|---|---|
| Analyst home | KPI cards, high-risk alert banner, recent flagged activity, risk distribution, and an ordered queue |
| Manual prediction | Validated form for amount, merchant category, country, device status, transaction time, and recent-transaction count; returns an instant scored result |
| Transaction history | Filterable table with risk, case status, date range, and merchant category filters |
| Case management | Detail view with outcome controls, analyst notes, audit timestamp, and contributor list |
| Plain-English explanations | Deterministic explanation available for every score; optional LLM refinement performed server-side with structured output and a deterministic fallback |
| Model performance | Held-out evaluation summary with precision, recall, F1-score, and an accessible confusion matrix |
| Drift monitoring | Baseline and recent distributions for selected transaction features, a drift indicator, and an explicit demonstration-data disclaimer |
| Authentication | Investigator workspace uses the scaffolded sign-in flow; authorised data mutations are protected |

### Explicit non-goals for version 1

The release will not process real card data, integrate with payment networks, make automatic account-blocking decisions, retrain itself in production, or claim regulatory compliance. It will not upload sensitive documents or transmit user-entered transaction data to an LLM. The optional LLM feature receives only minimal, already-derived risk factors and produces explanatory text; it does not make the underlying risk decision.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR-01 | The system shall assign each transaction a probability from 0–100 and a risk label: low, medium, or high. |
| FR-02 | The risk engine shall expose the top contributing factors and a safe, readable deterministic explanation for every score. |
| FR-03 | A signed-in user shall submit a transaction manually and receive the stored prediction immediately after successful validation. |
| FR-04 | The queue shall emphasise newly created high-risk transactions through a dedicated alert treatment and visual state. |
| FR-05 | A reviewer shall set an investigation status to under review, confirmed fraud, or legitimate and add a note. |
| FR-06 | The history table shall filter by risk level, status, merchant category, and inclusive date range. |
| FR-07 | The model-quality page shall present precision, recall, F1-score, a confusion matrix, and a clear dataset label. |
| FR-08 | The drift page shall compare selected recent feature summaries against stored training baselines and classify the comparison as stable, watch, or elevated. |
| FR-09 | An LLM summary procedure shall translate derived factors into two concise, investigator-friendly sentences using structured output; a deterministic fallback shall be returned on model failure. |
| FR-10 | The user interface shall keep risk and case-status vocabulary consistent in every page, filter, badge, and empty state. |

## 6. Experience and visual direction

FraudLens will use a dark, editorial operations-console style rather than a generic card grid. The visual system will pair deep ink and blue-grey surfaces with a restrained electric-cyan primary accent, amber for medium risk, and rose-red for high risk. The design will use high-density tables, generous title spacing, quiet dividers, small uppercase metadata labels, and selectively elevated panels. Interactions will be crisp and brief, with visible focus states and no decorative animation that delays review work.

The primary navigation will be **Command Center**, **Transactions**, **New Assessment**, **Casework**, **Model Health**, and **Drift Monitor**. The dashboard will use the scaffolded `DashboardLayout` after replacing its sample navigation with these routes.

## 7. Domain model

| Entity | Essential fields |
|---|---|
| Transaction | Public reference, amount, currency, merchant category, transaction country, account country, device status, timestamp, recent transaction count, created time |
| Risk assessment | Transaction reference, probability, risk label, primary factors, deterministic explanation, LLM explanation, model version, scored time |
| Case record | Transaction reference, status, latest note, reviewer identifier, updated time |
| Case note | Case reference, note text, author identifier, created time |
| Model metric snapshot | Version, dataset label, precision, recall, F1-score, true/false positive/negative counts, recorded time |
| Drift snapshot | Feature name, training baseline summary, recent summary, change score, status, recorded time |

## 8. Risk-engine design

The presentation layer will consume a versioned scoring contract. The first portfolio release will build a reproducible logistic-regression demonstration model from synthetic, privacy-preserving examples. A small TypeScript inference adapter will apply exported model coefficients at request time; the Node deployment will not run Python or perform model training. Its decision bands will be low for probabilities below 35, medium from 35 through 69, and high at 70 or above. The bands will remain configuration constants and will be tested.

The model will derive clear factors from input signals, including unusually high amount, new device, unusual country relationship, late-night activity, and elevated recent transaction count. Factors will be selected using positive contribution strength, then converted to an investigator phrase. The LLM may improve wording, but cannot change the risk level, probability, or factor list.

## 9. Data and LLM controls

All initial records are labelled **synthetic demonstration data**. Manual inputs must be validated and treated as non-sensitive sample data. The interface will not request card numbers, names, addresses, email addresses, bank identifiers, or other personal or payment-account data.

The LLM summary procedure runs only on the server. It receives the risk level, rounded score, generic merchant category, and a bounded list of derived factors; it does not receive a free-form case note. The output schema requires a short `summary` and `nextStep`. If structured validation, provider access, or parsing fails, FraudLens returns the deterministic explanation and never blocks a case review.

## 10. Technical architecture

| Layer | Approach |
|---|---|
| Client | React 19, TypeScript, Tailwind, shadcn/ui, Recharts, Wouter |
| Application API | Express and tRPC procedures with Zod input validation |
| Persistence | MySQL/TiDB through Drizzle ORM |
| Risk inference | TypeScript adapter applying exported logistic-regression coefficients; no long-running ML service |
| Explanation | Deterministic factor translator plus optional server-side built-in LLM structured response |
| Authentication | Scaffolded OAuth and protected procedures |
| Testing | Vitest for scoring thresholds, input validation, explanation fallback, case status transitions, and filtering |

## 11. Release sequence

The build will establish schema and seeded demonstration content first, then deliver scoring and case workflows, followed by model-health and drift surfaces. The final pass will test business logic, verify the rendered interface at desktop and mobile dimensions, and document the system limitations and demo flow in the README.

## 12. Portfolio demo script

A two-minute presentation should begin on Command Center, open a high-risk transaction, explain the contributing signals in plain English, update its case outcome, then submit a new transaction and show the immediate result. It should end on Model Health and Drift Monitor with the explicit statement that all data and model metrics are synthetic demonstration artifacts.
