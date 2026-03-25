export const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  adminPasscode: process.env.ADMIN_PASSCODE || "",
};

export function assertServerConfig() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Missing Supabase server environment variables.");
  }
}

