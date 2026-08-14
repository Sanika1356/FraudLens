import { runWeeklySummaryDelivery } from "../server/weeklySummaries";

void runWeeklySummaryDelivery().catch(error => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[FraudLens] Weekly summary runner failed: ${message}`);
  process.exitCode = 1;
});
