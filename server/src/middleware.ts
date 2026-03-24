/*
 * This file contains middleware functions for authentication and authorization.
    * `requireAuth` checks for a valid session cookie and populates `request.session`.
    * `requireAdmin` checks that the authenticated user has an admin role.
 */

import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import type { SessionPayload } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies.court_queue_session;

  if (!token) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    request.session = jwt.verify(token, config.JWT_SECRET) as SessionPayload;
    next();
  } catch {
    response.status(401).json({ error: "Invalid session." });
  }
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (!request.session || request.session.role !== "ADMIN") {
    response.status(403).json({ error: "Admin access required." });
    return;
  }

  next();
}

