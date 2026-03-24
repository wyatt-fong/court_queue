/*
 * This file contains helper functions for signing JWTs and setting/clearing cookies.
    * In a production application, you would want to implement refresh tokens and more secure cookie handling.
    * For simplicity, we're keeping the authentication logic minimal in this example.
 */

import jwt from "jsonwebtoken";
import type { Response } from "express";
import { config } from "./config.js";

export type SessionPayload = {
  sub: string;
  role: "MEMBER" | "ADMIN";
  email: string;
};

// For simplicity, we're not implementing refresh tokens. The session cookie will be valid for 7 days.
export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "1d" });
}

export function setSessionCookie(response: Response, token: string) {
  const isProduction = process.env.NODE_ENV === "production";
  response.cookie("court_queue_session", token, {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    maxAge: 1 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(response: Response) {
  const isProduction = process.env.NODE_ENV === "production";
  response.clearCookie("court_queue_session", {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  });
}
