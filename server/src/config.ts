import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env" });

const configSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  ALLOWED_EMAIL_DOMAIN: z.string().min(1),
  ADMIN_EMAILS: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  RESEND_API_KEY: z.string().default(""),
  RESEND_FROM_EMAIL: z.string().email().optional().or(z.literal("")),
});

export const config = configSchema.parse(process.env);

export const adminEmails = new Set(
  config.ADMIN_EMAILS.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
