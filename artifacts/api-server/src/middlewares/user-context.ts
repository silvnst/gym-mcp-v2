import type { Request, Response, NextFunction } from "express";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { db, users, plans, sessions } from "@workspace/db";
import { logger } from "../lib/logger.js";

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

export function getDefaultUserId(): string {
  if (!defaultUserId) throw new Error("Users bootstrap has not run yet");
  return defaultUserId;
}

/**
 * Resolves the acting user for API requests from the X-User-Id header.
 * Falls back to the default user when the header is absent (single-user
 * setups and plain curl keep working). An unknown/invalid id is a 401 so
 * the frontend can clear a stale stored profile.
 */
export async function userContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.header("x-user-id");

  if (!header) {
    req.userId = getDefaultUserId();
    next();
    return;
  }

  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, header) });
    if (!user) {
      res.status(401).json({ error: "Unknown user" });
      return;
    }
    req.userId = user.id;
    next();
  } catch {
    // Malformed UUIDs make Postgres throw — treat them like an unknown user
    res.status(401).json({ error: "Unknown user" });
  }
}

/**
 * Resolves the acting user for MCP connections from the ?user= query param,
 * which may be a user id or a (case-insensitive, unique) user name.
 * Returns null when the param doesn't match exactly one user.
 */
export async function resolveMcpUserId(param: string | undefined): Promise<string | null> {
  if (!param) return getDefaultUserId();

  try {
    const byId = await db.query.users.findFirst({ where: eq(users.id, param) });
    if (byId) return byId.id;
  } catch {
    // Not a UUID — fall through to name lookup
  }

  const byName = await db
    .select()
    .from(users)
    .where(sql`lower(${users.name}) = ${param.toLowerCase()}`)
    .limit(2);

  return byName.length === 1 ? byName[0]!.id : null;
}
