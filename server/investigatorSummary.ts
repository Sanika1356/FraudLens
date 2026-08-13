import { invokeLLM } from "./_core/llm";
import { RiskDecision, fallbackSummary } from "./riskEngine";

type InvestigatorSummary = { summary: string; nextStep: string; source: "llm" | "fallback" };

export async function createInvestigatorSummary(decision: RiskDecision): Promise<InvestigatorSummary> {
  const fallback = fallbackSummary(decision);
  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [
        {
          role: "system",
          content: "You write brief, conservative fraud-investigation summaries. Use only the supplied derived factors. Do not claim fraud is proven, do not recommend an account block, do not use ML terminology, and address the investigator directly in plain English.",
        },
        {
          role: "user",
          content: JSON.stringify({
            riskLevel: decision.riskLevel,
            probability: decision.probability,
            factors: decision.factors.map(({ label, detail }) => ({ label, detail })),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "investigator_summary",
          strict: true,
          schema: {
            type: "object",
            properties: {
              summary: { type: "string", description: "One or two short, plain-English sentences explaining the alert." },
              nextStep: { type: "string", description: "One concise, review-oriented next step." },
            },
            required: ["summary", "nextStep"],
            additionalProperties: false,
          },
        },
      },
    });
    const raw = response.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return { ...fallback, source: "fallback" };
    const parsed = JSON.parse(raw) as { summary?: unknown; nextStep?: unknown };
    if (typeof parsed.summary !== "string" || typeof parsed.nextStep !== "string") return { ...fallback, source: "fallback" };
    return { summary: parsed.summary.slice(0, 500), nextStep: parsed.nextStep.slice(0, 320), source: "llm" };
  } catch (error) {
    console.warn("[FraudLens] Investigator summary fallback used", error);
    return { ...fallback, source: "fallback" };
  }
}
