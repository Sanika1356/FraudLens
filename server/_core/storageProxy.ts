import type { Express } from "express";
import { getAuth } from "@clerk/express";
import { getCaseEvidenceByStorageKey } from "../db";
import { isSupabaseStorageConfigured, storageGetSignedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/storage/*", async (req, res) => {
    const auth = getAuth(req);
    if (!auth.userId || !auth.orgId) {
      res.status(401).send("An authenticated workspace session is required.");
      return;
    }

    const key = (req.params as Record<string, string>)[0];
    if (!key || !key.startsWith(`evidence/${encodeURIComponent(auth.orgId)}/`)) {
      res.status(404).send("Evidence file not found.");
      return;
    }

    if (!isSupabaseStorageConfigured()) {
      res.status(503).send("Evidence storage is not configured.");
      return;
    }

    try {
      const evidence = await getCaseEvidenceByStorageKey(auth.orgId, key);
      if (!evidence) {
        res.status(404).send("Evidence file not found.");
        return;
      }

      const signedUrl = await storageGetSignedUrl(key, 60);
      res.set("Cache-Control", "no-store");
      res.redirect(307, signedUrl);
    } catch (error) {
      console.error("[StorageProxy] private evidence download failed", error);
      res.status(502).send("Evidence storage is temporarily unavailable.");
    }
  });
}
