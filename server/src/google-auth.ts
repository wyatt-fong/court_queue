/*
 * This file contains helper functions for authenticating Google ID tokens and establishing sessions.
 */

import { OAuth2Client } from "google-auth-library";
import { Role } from "@prisma/client";
import { signSession, setSessionCookie } from "./auth.js";
import { adminEmails, config } from "./config.js";
import { prisma } from "./db.js";
import { getEmailDomain, normalizeEmail } from "./utils.js";

const googleClient = new OAuth2Client(config.GOOGLE_CLIENT_ID);

export async function authenticateGoogleIdToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new Error("Google sign-in could not be verified.");
  }

  const email = normalizeEmail(payload.email);

  if (getEmailDomain(email) !== config.ALLOWED_EMAIL_DOMAIN) {
    throw new Error(`Only ${config.ALLOWED_EMAIL_DOMAIN} accounts are allowed.`);
  }

  if (payload.hd !== config.ALLOWED_EMAIL_DOMAIN) {
    throw new Error(`Please use your ${config.ALLOWED_EMAIL_DOMAIN} Google Workspace account.`);
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      googleSub: payload.sub,
      displayName: payload.name ?? undefined,
      isPlaceholder: false,
      isVerified: true,
      role: adminEmails.has(email) ? Role.ADMIN : Role.MEMBER,
    },
    create: {
      email,
      googleSub: payload.sub,
      displayName: payload.name ?? undefined,
      isPlaceholder: false,
      isVerified: true,
      role: adminEmails.has(email) ? Role.ADMIN : Role.MEMBER,
    },
  });

  return user;
}

export function establishGoogleSession(response: import("express").Response, user: {
  id: string;
  email: string;
  role: Role;
}) {
  const token = signSession({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  setSessionCookie(response, token);
}
