export type RiskPolicyConfig = {
  highRiskThreshold: number;
  mediumRiskThreshold: number;
  highAmountThreshold: number;
  mediumAmountThreshold: number;
  lowAmountThreshold: number;
  highVelocityCount: number;
  mediumVelocityCount: number;
  policyHighValueAmount: number;
  policyVelocityCount: number;
};

export const DEFAULT_RISK_POLICY: RiskPolicyConfig = {
  highRiskThreshold: 70,
  mediumRiskThreshold: 35,
  highAmountThreshold: 1500,
  mediumAmountThreshold: 750,
  lowAmountThreshold: 300,
  highVelocityCount: 5,
  mediumVelocityCount: 3,
  policyHighValueAmount: 2000,
  policyVelocityCount: 6,
};

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function normalizeRiskPolicy(value: unknown): RiskPolicyConfig {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const highRiskThreshold = boundedNumber(
    input.highRiskThreshold,
    DEFAULT_RISK_POLICY.highRiskThreshold,
    50,
    95
  );
  const mediumRiskThreshold = boundedNumber(
    input.mediumRiskThreshold,
    DEFAULT_RISK_POLICY.mediumRiskThreshold,
    10,
    highRiskThreshold - 1
  );
  const highAmountThreshold = boundedNumber(
    input.highAmountThreshold,
    DEFAULT_RISK_POLICY.highAmountThreshold,
    100,
    1_000_000
  );
  const mediumAmountThreshold = boundedNumber(
    input.mediumAmountThreshold,
    DEFAULT_RISK_POLICY.mediumAmountThreshold,
    50,
    highAmountThreshold - 1
  );
  const lowAmountThreshold = boundedNumber(
    input.lowAmountThreshold,
    DEFAULT_RISK_POLICY.lowAmountThreshold,
    1,
    mediumAmountThreshold - 1
  );
  const highVelocityCount = Math.round(
    boundedNumber(
      input.highVelocityCount,
      DEFAULT_RISK_POLICY.highVelocityCount,
      2,
      50
    )
  );
  const mediumVelocityCount = Math.round(
    boundedNumber(
      input.mediumVelocityCount,
      DEFAULT_RISK_POLICY.mediumVelocityCount,
      1,
      highVelocityCount - 1
    )
  );
  const policyHighValueAmount = boundedNumber(
    input.policyHighValueAmount,
    DEFAULT_RISK_POLICY.policyHighValueAmount,
    100,
    1_000_000
  );
  const policyVelocityCount = Math.round(
    boundedNumber(
      input.policyVelocityCount,
      DEFAULT_RISK_POLICY.policyVelocityCount,
      1,
      50
    )
  );
  return {
    highRiskThreshold,
    mediumRiskThreshold,
    highAmountThreshold,
    mediumAmountThreshold,
    lowAmountThreshold,
    highVelocityCount,
    mediumVelocityCount,
    policyHighValueAmount,
    policyVelocityCount,
  };
}

export function policyVersionLabel(version: number) {
  return `v${version}`;
}
