# FraudLens QA Evidence

## Automated checks

| Check | Evidence | Result |
|---|---|---|
| Type safety | `pnpm check` | Passed with no TypeScript errors |
| Risk scoring | `server/riskEngine.test.ts` | Low, medium, and high labels plus explanations covered |
| Workflow validation | `server/riskWorkflow.test.ts` | Invalid input, note validation, and case transitions covered |
| Authentication baseline | `server/auth.logout.test.ts` | Existing session logout behavior covered |

## Keyboard and accessibility review

FraudLens uses the shared button, input, and textarea primitives with `focus-visible` styling. A global visible cyan focus outline is also applied to raw buttons, links, selects, inputs, textareas, and ARIA buttons, covering interactive controls in the custom analyst views. Form fields use programmatic labels or `aria-label`; invalid form fields receive `aria-invalid`, and error feedback uses `role="alert"`.

## Route-level workflow-state review

| View | Loading | Error | Empty / initial | Responsive verification |
|---|---|---|---|---|
| Command Center | Active risk signal status | Reload guidance | No-alert banner is omitted when none exist | Desktop checked |
| Transactions | Analyst queue status | Reload guidance | “No transactions match these filters” | Desktop checked |
| Instant Assessment | Disabled “Assessing…” action | Mutation toast and field validation | “Ready for context” initial panel | Desktop and mobile checked |
| Transaction Detail | Evidence status | Invalid/not-found state | No-risk-evidence copy | Desktop and mobile checked |
| Casework | Awaiting-review status | Reload guidance | “No cases await review” | Desktop and mobile checked |
| Model Health | Evaluation evidence status | Reload guidance | Not applicable; evaluation artifact is required | Desktop checked |
| Drift Monitor | Feature-distribution status | Reload guidance | Not applicable; four monitored features are required | Desktop checked |

## Manual keyboard check

At each key view, use `Tab` and `Shift+Tab` to confirm that the cyan outline is visible on navigation links, filters, transaction-detail links, form controls, and casework actions. Use `Enter` or `Space` to activate buttons. The desktop and mobile screenshot reviews captured after the implementation confirm layout integrity at 1440×1024 and 390×844 viewports.
