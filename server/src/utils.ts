import crypto from "node:crypto";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getEmailDomain(email: string) {
  return normalizeEmail(email).split("@")[1] ?? "";
}

export function createVerificationCode() {
  return `${crypto.randomInt(100000, 999999)}`;
}

export function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function createPlaceholderEmail(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "dummy";

  return `${slug}-${crypto.randomBytes(4).toString("hex")}@placeholder.local`;
}
