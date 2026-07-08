import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";
import { assertGoogleConfig, config } from "./config";
import { getSupabaseAdmin } from "./supabase-admin";

const SESSION_COOKIE = "court_queue_session";

let googleClient;

function getGoogleClient() {
  if (!googleClient) {
    googleClient = new OAuth2Client(config.googleClientId);
  }

  return googleClient;
}

function cookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function verifyGoogleIdToken(idToken) {
  assertGoogleConfig();

  const ticket = await getGoogleClient().verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new Error("Google sign-in could not be verified.");
  }

  const email = payload.email.trim().toLowerCase();
  const domain = email.split("@")[1] || "";

  if (domain !== config.allowedEmailDomain) {
    throw new Error(`Only ${config.allowedEmailDomain} accounts are allowed.`);
  }

  if (payload.hd !== config.allowedEmailDomain) {
    throw new Error(`Please use your ${config.allowedEmailDomain} Google Workspace account.`);
  }

  return {
    email,
    googleSub: payload.sub,
    displayName: payload.name?.trim() || email.split("@")[0],
  };
}

export async function upsertUserFromGoogle(profile) {
  const supabase = getSupabaseAdmin();
  const isAdmin = config.adminEmails.includes(profile.email);
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        email: profile.email,
        google_sub: profile.googleSub,
        display_name: profile.displayName,
        is_admin: isAdmin,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "email",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createSession(user) {
  const token = jwt.sign(
    {
        sub: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin,
      },
    config.jwtSecret,
    { expiresIn: "7d" },
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, cookieOptions());
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  let payload;

  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", payload.sub)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function requireSessionUser() {
  const user = await getSessionUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  return user;
}

export async function requireAdminUser() {
  const user = await requireSessionUser();

  if (!user.is_admin) {
    throw new Error("Admin access required.");
  }

  return user;
}
