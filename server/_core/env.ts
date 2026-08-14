const managerOpenIds = (process.env.MANAGER_OPEN_IDS ?? "")
  .split(",")
  .map(id => id.trim())
  .filter(Boolean);

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  managerOpenIds,
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  supabaseStorageBucket:
    process.env.SUPABASE_STORAGE_BUCKET ?? "fraudlens-evidence",
  /** Optional: alerts continue through webhooks when Resend is not configured. */
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
};

export function resolveBootstrapRole(
  openId: string
): "analyst" | "manager" | "admin" {
  if (openId === ENV.ownerOpenId) return "admin";
  if (ENV.managerOpenIds.includes(openId)) return "manager";
  return "analyst";
}
