export const config = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN || "ucsd.edu",
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || "",
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

export function assertServerConfig() {
  if (
    !config.supabaseUrl ||
    !config.supabaseServiceRoleKey ||
    !config.jwtSecret
  ) {
    throw new Error("Missing Supabase server environment variables.");
  }
}

export function assertGoogleConfig() {
  if (!config.googleClientId) {
    throw new Error("Missing Google client id.");
  }
}
