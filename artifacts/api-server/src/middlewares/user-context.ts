import type { Request, Response, NextFunction } from "express";
import { asc, isNull } from "drizzle-orm";
import { db, users, plans, sessions } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { AuthError, authDisabled, bearerToken, userFromToken, wwwAuthenticate } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

let defaultUserId: string | null = null;

/**
 * Ensures at least one user exists and adopts any rows created before
 * multi-user support (user_id IS NULL) into the oldest user.
 * Must run once at server startup, before requests are served.
 */
export async function ensureUsersBootstrap(): Promise<string> {
  let [def] = await db.select().from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!def) {
    [def] = await db
      .insert(users)
      .values({ name: process.env["DEFAULT_USER_NAME"] ?? "Default" })
      .returning();
    logger.info({ userId: def!.id }, "Created default user");
  }
  defaultUserId = def!.id;

  await db.update(plans).set({ userId: def!.id }).where(isNull(plans.userId));
  await db.update(sessions).set({ userId: def!.id }).where(isNull(sessions.userId));

  return def!.id;
}

/** The oldest profile; owns the Garmin data unless GARMIN_USER_ID says otherwise. */
export function getDefaultUserId(): string {
  if (!defaultUserId) throw new Error("Users bootstrap has not run yet");
  return defaultUserId;
}

/** Sends the right 401/403/503 response for an authentication failure. */
export function sendAuthError(res: Response, err: unknown): void {
  if (err instanceof AuthError) {
    if (err.status === 401) res.set("WWW-Authenticate", wwwAuthenticate("invalid_token"));
    res.status(err.status).json({ error: err.message });
    return;
  }
  logger.error({ err }, "Authentication failed unexpectedly");
  res.status(500).json({ error: "Authentication failed" });
}

/**
 * Resolves the acting user from the Auth0 bearer token. Every route behind this
 * middleware is scoped to `req.userId`. With AUTH_DISABLED=true (never in
 * production) requests act as the default user for local development.
 */
export async function userContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (authDisabled()) {
    req.userId = getDefaultUserId();
    next();
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    res.set("WWW-Authenticate", wwwAuthenticate());
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const user = await userFromToken(token);
    req.userId = user.id;
    next();
  } catch (err) {
    sendAuthError(res, err);
  }
}
