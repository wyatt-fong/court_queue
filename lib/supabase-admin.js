import { createClient } from "@supabase/supabase-js";
import { assertServerConfig, config } from "./config";

let client;

export function getSupabaseAdmin() {
  if (!client) {
    assertServerConfig();
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return client;
}

