import type { Express, Request, Response } from "express";
import { z } from "zod";
import { extractBearerApiKey, hashApiKey, isApiKeyActive, parseApiKeyScopes, PUBLIC_API_KEY_SCOPE, PUBLIC_API_RATE_LIMIT_PER_MINUTE } from "./apiKeys";
import { countApiRequestsSince, getApiKeyByHash, getTransactionReferencesByOrganization, recordApiRequestLog, touchApiKeyLastUsed } from "./db";
import { riskInputSchema, submitRiskAssessment } from "./routers";
import type { RiskInput } from "./riskEngine";

const ENDPOINT = "/api/v1/transactions/assess";
const apiTransactionSchema = riskInputSchema.extend({
  reference: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "Reference must use 3-32 uppercase letters, numbers, underscores, or hyphens.").optional(),
}).strict();

type ApiErrorCode = "invalid_request" | "unauthorized" | "forbidden" | "rate_limited" | "conflict" | "internal_error" | "payload_too_large";

function requestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

function respondError(response: Response, status: number, code: ApiErrorCode, message: string, id: string) {
  response.status(status).json({ error: { code, message, requestId: id } });
}

async function logRequest(input: {
  orgId: string;
  apiKeyId: number;
  requestId: string;
  responseStatus: number;
  transactionReference?: string | null;
  riskLevel?: "low" | "medium" | "high" | null;
}) {
  try {
    await recordApiRequestLog({
      ...input,
      endpoint: ENDPOINT,
      method: "POST",
    });
  } catch (error) {
    // Request logging is intentionally non-blocking: a transient telemetry failure must not create duplicate client retries.
    console.error("[FraudLens] Public API request log failed", error);
  }
}

async function handleTransactionAssessment(request: Request, response: Response) {
  const id = requestId();
  const rawLength = Number(request.header("content-length") ?? 0);
  if (Number.isFinite(rawLength) && rawLength > 20_000) {
    respondError(response, 413, "payload_too_large", "Request bodies must be smaller than 20 KB.", id);
    return;
  }

  const secret = extractBearerApiKey(request.header("authorization"));
  if (!secret) {
    respondError(response, 401, "unauthorized", "Provide a valid Bearer API key.", id);
    return;
  }

  const apiKey = await getApiKeyByHash(hashApiKey(secret));
  if (!apiKey || !isApiKeyActive(apiKey.revokedAt, apiKey.expiresAt)) {
    respondError(response, 401, "unauthorized", "The API key is invalid, expired, or revoked.", id);
    return;
  }

  if (!parseApiKeyScopes(apiKey.scopesJson).includes(PUBLIC_API_KEY_SCOPE)) {
    await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, requestId: id, responseStatus: 403 });
    respondError(response, 403, "forbidden", "This API key does not include the transactions:write scope.", id);
    return;
  }

  const recentRequests = await countApiRequestsSince(apiKey.id, new Date(Date.now() - 60_000));
  if (recentRequests >= PUBLIC_API_RATE_LIMIT_PER_MINUTE) {
    await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, requestId: id, responseStatus: 429 });
    response.setHeader("Retry-After", "60");
    respondError(response, 429, "rate_limited", `Limit of ${PUBLIC_API_RATE_LIMIT_PER_MINUTE} requests per minute exceeded.`, id);
    return;
  }

  const parsed = apiTransactionSchema.safeParse(request.body);
  if (!parsed.success) {
    await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, requestId: id, responseStatus: 400 });
    respondError(response, 400, "invalid_request", "Request validation failed.", id);
    return;
  }

  const reference = parsed.data.reference;
  if (reference) {
    const existingReferences = await getTransactionReferencesByOrganization(apiKey.orgId);
    if (existingReferences.has(reference)) {
      await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, requestId: id, responseStatus: 409, transactionReference: reference });
      respondError(response, 409, "conflict", "A transaction with this reference already exists in this organization.", id);
      return;
    }
  }

  try {
    const record = await submitRiskAssessment(
      apiKey.orgId,
      parsed.data as RiskInput,
      { id: null, name: `Public API key ${apiKey.keyPrefix}`, source: "public_api", apiKeyId: apiKey.id },
      reference,
    );
    await Promise.all([
      touchApiKeyLastUsed(apiKey.id),
      logRequest({
        orgId: apiKey.orgId,
        apiKeyId: apiKey.id,
        requestId: id,
        responseStatus: 201,
        transactionReference: record.reference,
        riskLevel: record.riskLevel,
      }),
    ]);
    response.status(201).json({
      requestId: id,
      transaction: {
        id: record.id,
        reference: record.reference,
        riskLevel: record.riskLevel,
        riskScore: record.probability,
        caseStatus: record.caseStatus,
        casePriority: record.casePriority,
        createdAt: record.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[FraudLens] Public API transaction assessment failed", error);
    await logRequest({ orgId: apiKey.orgId, apiKeyId: apiKey.id, requestId: id, responseStatus: 500, transactionReference: reference ?? null });
    respondError(response, 500, "internal_error", "The transaction could not be assessed. Retry with the same reference after a short delay.", id);
  }
}

export function registerPublicApiRoutes(app: Express) {
  app.get("/api/v1", (_request, response) => {
    response.json({
      name: "FraudLens Public API",
      version: "v1",
      documentation: "/api/v1/docs",
      endpoints: [{ method: "POST", path: ENDPOINT, requiredScope: PUBLIC_API_KEY_SCOPE }],
    });
  });

  app.get("/api/v1/docs", (_request, response) => {
    response.json({
      version: "v1",
      authentication: "Send Authorization: Bearer fl_live_... with an active transactions:write API key.",
      rateLimit: `${PUBLIC_API_RATE_LIMIT_PER_MINUTE} requests per minute per API key`,
      endpoint: {
        method: "POST",
        path: ENDPOINT,
        requestExample: {
          reference: "PAYMENT-10001",
          amount: 249.99,
          merchantCategory: "electronics",
          transactionCountry: "US",
          accountCountry: "US",
          deviceStatus: "new",
          transactionHour: 2,
          recentTransactionCount: 5,
        },
        responseFields: ["requestId", "transaction.reference", "transaction.riskLevel", "transaction.riskScore", "transaction.caseStatus", "transaction.casePriority"],
      },
    });
  });

  app.post(ENDPOINT, (request, response) => {
    void handleTransactionAssessment(request, response).catch((error: unknown) => {
      console.error("[FraudLens] Public API infrastructure failure", error);
      if (!response.headersSent) {
        respondError(response, 500, "internal_error", "The request could not be completed. Retry after a short delay.", requestId());
      }
    });
  });
}
