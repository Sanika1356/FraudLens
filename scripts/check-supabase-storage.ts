import "dotenv/config";
import { storageCheckBucket } from "../server/storage";

void storageCheckBucket()
  .then(() => {
    console.log(
      "[FraudLens] Supabase evidence storage health check succeeded."
    );
  })
  .catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[FraudLens] Supabase evidence storage health check failed: ${message}`
    );
    process.exitCode = 1;
  });
