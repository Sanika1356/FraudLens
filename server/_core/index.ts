import "dotenv/config";
import {
  captureServerException,
  installMonitoringErrorHandler,
  logServerError,
} from "./monitoring";
import express from "express";
import { createServer } from "http";
import net from "net";
import { clerkMiddleware } from "@clerk/express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  installSecurityMiddleware,
  requestParsingErrorHandler,
} from "./security";
import { registerPublicApiRoutes } from "../publicApi";
import { validateProductionEnvironment } from "./env";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateProductionEnvironment();
  const app = express();
  const server = createServer(app);
  const securityConfig = installSecurityMiddleware(app);
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  // Evidence files are uploaded directly to private object storage, so API
  // payloads can remain deliberately small and inexpensive to parse.
  app.use(express.json({ limit: securityConfig.bodyLimitBytes }));
  app.use(
    express.urlencoded({
      limit: securityConfig.bodyLimitBytes,
      extended: false,
    })
  );
  registerPublicApiRoutes(app);
  app.use(clerkMiddleware());
  registerStorageProxy(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error, path, type }) {
        if (error.code !== "INTERNAL_SERVER_ERROR") return;
        const operation = path ?? type;
        captureServerException(error, { area: "trpc", operation });
        logServerError("Unexpected tRPC procedure failure", {
          area: "trpc",
          operation,
        });
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  app.use(requestParsingErrorHandler);
  installMonitoringErrorHandler(app);

  const preferredPort = Number.parseInt(process.env.PORT || "3000", 10);
  const port =
    process.env.NODE_ENV === "production"
      ? preferredPort
      : await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(error => {
  captureServerException(error, { area: "startup", operation: "start_server" });
  console.error(error);
});
