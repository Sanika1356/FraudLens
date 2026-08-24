import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  extractBearerApiKey,
  hashApiKey,
  isApiKeyActive,
  parseApiKeyScopes,
  PUBLIC_API_KEY_SCOPE,
  PUBLIC_API_RATE_LIMIT_PER_MINUTE,
} from "./apiKeys";
import {
  completeApiIdempotency,
  countApiRequestsSince,
  getApiKeyByHash,
  releaseApiIdempotency,
  reserveApiIdempotency,
  getTransactionReferencesByOrganization,
  recordApiRequestLog,
  touchApiKeyLastUsed,
  isIncidentModeEnabled,
} from "./db";
import { riskInputSchema, submitRiskAssessment } from "./routers";
import type { RiskInput } from "./riskEngine";
import { captureServerException, logServerError } from "./_core/monitoring";

const ENDPOINT = "/api/v1/transactions/assess";
const apiTransactionSchema = riskInputSchema
  .extend({
    reference: z
      .string()
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9_-]{3,32}$/,
        "Reference must use 3-32 uppercase letters, numbers, underscores, or hyphens."
      )
      .optional(),
  })
  .strict();

type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "temporarily_unavailable"
  | "conflict"
  | "internal_error"
  | "payload_too_large";

function requestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

function respondError(
  response: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  id: string
) {
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
    captureServerException(error, {
      area: "public_api",
      operation: "record_request_log",
      requestId: input.requestId,
    });
    logServerError("Public API request log failed", {
      area: "public_api",
      operation: "record_request_log",
    });
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function replayIdempotentResponse(
  response: Response,
  record: Awaited<ReturnType<typeof reserveApiIdempotency>>["record"]
): boolean {
  if (
    record.status !== "completed" ||
    !record.responseStatus ||
    !record.responseJson
  ) {
    return false;
  }
  try {
    response
      .status(record.responseStatus)
      .json(JSON.parse(record.responseJson));
    return true;
  } catch {
    return false;
  }
}

async function handleTransactionAssessment(
  request: Request,
  response: Response
) {
  const id = requestId();
  const rawLength = Number(request.header("content-length") ?? 0);
  if (Number.isFinite(rawLength) && rawLength > 20_000) {
    respondError(
      response,
      413,
      "payload_too_large",
      "Request bodies must be smaller than 20 KB.",
      id
    );
    return;
  }

  const secret = extractBearerApiKey(request.header("authorization"));
  if (!secret) {
    respondError(
      response,
      401,
      "unauthorized",
      "Provide a valid Bearer API key.",
      id
    );
    return;
  }

  const apiKey = await getApiKeyByHash(hashApiKey(secret));
  if (!apiKey || !isApiKeyActive(apiKey.revokedAt, apiKey.expiresAt)) {
    respondError(
      response,
      401,
      "unauthorized",
      "The API key is invalid, expired, or revoked.",
      id
    );
    return;
  }

  if (!parseApiKeyScopes(apiKey.scopesJson).includes(PUBLIC_API_KEY_SCOPE)) {
    await logRequest({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      requestId: id,
      responseStatus: 403,
    });
    respondError(
      response,
      403,
      "forbidden",
      "This API key does not include the transactions:write scope.",
      id
    );
    return;
  }

  if (await isIncidentModeEnabled(apiKey.orgId)) {
    await logRequest({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      requestId: id,
      responseStatus: 503,
    });
    response.setHeader("Retry-After", "300");
    respondError(
      response,
      503,
      "temporarily_unavailable",
      "Transaction ingestion is temporarily suspended for this workspace.",
      id
    );
    return;
  }

  const recentRequests = await countApiRequestsSince(
    apiKey.id,
    new Date(Date.now() - 60_000)
  );
  if (recentRequests >= PUBLIC_API_RATE_LIMIT_PER_MINUTE) {
    await logRequest({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      requestId: id,
      responseStatus: 429,
    });
    response.setHeader("Retry-After", "60");
    respondError(
      response,
      429,
      "rate_limited",
      `Limit of ${PUBLIC_API_RATE_LIMIT_PER_MINUTE} requests per minute exceeded.`,
      id
    );
    return;
  }

  const parsed = apiTransactionSchema.safeParse(request.body);
  if (!parsed.success) {
    await logRequest({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      requestId: id,
      responseStatus: 400,
    });
    respondError(
      response,
      400,
      "invalid_request",
      "Request validation failed.",
      id
    );
    return;
  }

  const rawIdempotencyKey = request.header("idempotency-key");
  const idempotencyKey = rawIdempotencyKey?.trim() || null;
  if (
    rawIdempotencyKey &&
    (!idempotencyKey ||
      idempotencyKey.length > 128 ||
      /[^A-Za-z0-9._:-]/.test(idempotencyKey))
  ) {
    await logRequest({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      requestId: id,
      responseStatus: 400,
    });
    respondError(
      response,
      400,
      "invalid_request",
      "The Idempotency-Key header must be 1-128 characters using letters, numbers, dots, underscores, colons, or hyphens.",
      id
    );
    return;
  }

  let idempotencyReservation: Awaited<
    ReturnType<typeof reserveApiIdempotency>
  > | null = null;
  if (idempotencyKey) {
    idempotencyReservation = await reserveApiIdempotency({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      idempotencyKey,
      requestHash: hashApiKey(stableJson(parsed.data)),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (!idempotencyReservation.created) {
      if (
        idempotencyReservation.record.requestHash !==
        hashApiKey(stableJson(parsed.data))
      ) {
        respondError(
          response,
          409,
          "conflict",
          "This Idempotency-Key was already used with a different request payload.",
          id
        );
        return;
      }
      if (replayIdempotentResponse(response, idempotencyReservation.record))
        return;
      response.setHeader("Retry-After", "5");
      respondError(
        response,
        409,
        "conflict",
        "An identical request is already being processed. Retry shortly.",
        id
      );
      return;
    }
  }

  const reference = parsed.data.reference;
  if (reference) {
    const existingReferences = await getTransactionReferencesByOrganization(
      apiKey.orgId
    );
    if (existingReferences.has(reference)) {
      await logRequest({
        orgId: apiKey.orgId,
        apiKeyId: apiKey.id,
        requestId: id,
        responseStatus: 409,
        transactionReference: reference,
      });
      respondError(
        response,
        409,
        "conflict",
        "A transaction with this reference already exists in this organization.",
        id
      );
      return;
    }
  }

  try {
    const record = await submitRiskAssessment(
      apiKey.orgId,
      parsed.data as RiskInput,
      {
        id: null,
        name: `Public API key ${apiKey.keyPrefix}`,
        source: "public_api",
        apiKeyId: apiKey.id,
      },
      reference
    );
    const responseBody = {
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
    };
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
      idempotencyKey
        ? completeApiIdempotency(
            apiKey.id,
            idempotencyKey,
            201,
            JSON.stringify(responseBody),
            record.reference
          )
        : Promise.resolve(),
    ]);
    response.status(201).json(responseBody);
  } catch (error) {
    if (idempotencyKey) {
      await releaseApiIdempotency(apiKey.id, idempotencyKey).catch(
        () => undefined
      );
    }
    console.error(
      "[FraudLens] Public API transaction assessment failed",
      error
    );
    captureServerException(error, {
      area: "public_api",
      operation: "assess_transaction",
      requestId: id,
    });
    logServerError("Public API transaction assessment failed", {
      area: "public_api",
      operation: "assess_transaction",
    });
    await logRequest({
      orgId: apiKey.orgId,
      apiKeyId: apiKey.id,
      requestId: id,
      responseStatus: 500,
      transactionReference: reference ?? null,
    });
    respondError(
      response,
      500,
      "internal_error",
      "The transaction could not be assessed. Retry with the same reference after a short delay.",
      id
    );
  }
}

export function registerPublicApiRoutes(app: Express) {
  app.get("/api/v1", (_request, response) => {
    response.json({
      name: "FraudLens Public API",
      version: "v1",
      documentation: "/api/v1/docs",
      endpoints: [
        { method: "POST", path: ENDPOINT, requiredScope: PUBLIC_API_KEY_SCOPE },
      ],
    });
  });

  app.get("/api/v1/docs", (_request, response) => {
    response.json({
      version: "v1",
      authentication:
        "Send Authorization: Bearer fl_live_... with an active transactions:write API key.",
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
        headers: {
          "Idempotency-Key":
            "Optional, 1-128 characters; identical retries replay the original response for 24 hours.",
        },
        responseFields: [
          "requestId",
          "transaction.reference",
          "transaction.riskLevel",
          "transaction.riskScore",
          "transaction.caseStatus",
          "transaction.casePriority",
        ],
      },
    });
  });

  app.post(ENDPOINT, (request, response) => {
    void handleTransactionAssessment(request, response).catch(
      (error: unknown) => {
        console.error("[FraudLens] Public API infrastructure failure", error);
        const id = requestId();
        captureServerException(error, {
          area: "public_api",
          operation: "infrastructure",
          requestId: id,
        });
        logServerError("Public API infrastructure failure", {
          area: "public_api",
          operation: "infrastructure",
        });
        if (!response.headersSent) {
          respondError(
            response,
            500,
            "internal_error",
            "The request could not be completed. Retry after a short delay.",
            id
          );
        }
      }
    );
  });
}
