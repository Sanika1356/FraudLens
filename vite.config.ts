import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // The empty prefix permits reading build-only Sentry credentials without exposing
  // them to the client bundle. They remain optional so local and preview builds work.
  const env = loadEnv(mode, process.cwd(), "");
  const sentryAuthToken = env.SENTRY_AUTH_TOKEN;
  const sentryOrg = env.SENTRY_ORG;
  const sentryProject = env.SENTRY_PROJECT;
  const shouldUploadSourceMaps = Boolean(
    sentryAuthToken && sentryOrg && sentryProject
  );

  const plugins = [react(), tailwindcss(), jsxLocPlugin()];
  if (shouldUploadSourceMaps) {
    plugins.push(
      sentryVitePlugin({
        authToken: sentryAuthToken,
        org: sentryOrg,
        project: sentryProject,
        release: {
          name: env.SENTRY_RELEASE ?? process.env.RAILWAY_GIT_COMMIT_SHA,
        },
        sourcemaps: {
          filesToDeleteAfterUpload: ["./dist/public/**/*.map"],
        },
        telemetry: false,
      })
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname),
    root: path.resolve(import.meta.dirname, "client"),
    publicDir: path.resolve(import.meta.dirname, "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      // Source maps are generated only for authenticated upload and removed afterward.
      sourcemap: shouldUploadSourceMaps ? "hidden" : false,
    },
    server: {
      host: true,
      allowedHosts: ["localhost", "127.0.0.1"],
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
