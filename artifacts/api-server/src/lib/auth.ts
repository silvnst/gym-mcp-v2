import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import { db, users, type User } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Auth0 token validation and the mapping from an Auth0 login to a profile.
 *
 * One Auth0 API serves both the web app and MCP clients. Its identifier
 * (AUTH0_AUDIENCE) is the canonical MCP URL, e.g. https://<host>/mcp, because
 * MCP clients send that URL as the OAuth `resource` and Auth0 turns it into the
 * token audience.
 */

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
  }
}

type AuthConfig = {
  domain: string;
  issuer: string;
  audience: string;
};

export function authDisabled(): boolean {
  return process.env["AUTH_DISABLED"] === "true" && process.env["NODE_ENV"] !== "production";
}

export function authConfig(): AuthConfig | null {
  const domain = process.env["AUTH0_DOMAIN"]?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const audience = process.env["AUTH0_AUDIENCE"]?.trim();
  if (!domain || !audience) return null;
  return { domain, issuer: `https://${domain}/`, audience };
}

/** Logs a clear error at startup when production would run without auth. */
export function assertAuthConfigured(): void {
  if (authDisabled()) {
    logger.warn("AUTH_DISABLED=true: every request acts as the default user (local development only)");
    return;
  }
  if (!authConfig()) {
    const message = "AUTH0_DOMAIN and AUTH0_AUDIENCE must be set; the API rejects every request without them.";
    if (process.env["NODE_ENV"] === "production") logger.error(message);
    else logger.warn(`${message} Set AUTH_DISABLED=true for local development.`);
  }
}

/** Absolute URL of the OAuth protected-resource metadata document (RFC 9728). */
export function resourceMetadataUrl(): string | null {
  const cfg = authConfig();
  if (!cfg) return null;
  const url = new URL(cfg.audience);
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
}

export function protectedResourceMetadata() {
  const cfg = authConfig();
  if (!cfg) return null;
  return {
    resource: cfg.audience,
    authorization_servers: [cfg.issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    resource_name: "Gym tracker",
  };
}

export function wwwAuthenticate(error?: string): string {
  const parts = ['Bearer realm="gym-tracker"'];
  const meta = resourceMetadataUrl();
  if (meta) parts.push(`resource_metadata="${meta}"`);
  if (error) parts.push(`error="${error}"`);
  return parts.join(", ");
}

export function bearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1]!.trim() : null;
}

// ── Allowlist and claim map ────────────────────────────────────────────────────

function parseClaimMap(): Map<string, string> {
  // AUTH_CLAIM_MAP="email=Profile name or id,other@mail=Name" links a login to an
  // existing profile the first time that email signs in.
  const map = new Map<string, string>();
  for (const entry of (process.env["AUTH_CLAIM_MAP"] ?? "").split(",")) {
    const idx = entry.indexOf("=");
    if (idx < 1) continue;
    const email = entry.slice(0, idx).trim().toLowerCase();
    const target = entry.slice(idx + 1).trim();
    if (email && target) map.set(email, target);
  }
  return map;
}

function allowedEmails(): Set<string> {
  const set = new Set<string>();
  for (const e of (process.env["AUTH_ALLOWED_EMAILS"] ?? "").split(",")) {
    const email = e.trim().toLowerCase();
    if (email) set.add(email);
  }
  for (const email of parseClaimMap().keys()) set.add(email);
  return set;
}

function emailAllowed(email: string): boolean {
  if (process.env["AUTH_ALLOW_ANY_USER"] === "true") return true;
  return allowedEmails().has(email.toLowerCase());
}

// ── Token verification ─────────────────────────────────────────────────────────

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer: string | null = null;

function keySet(cfg: AuthConfig) {
  if (!jwks || jwksIssuer !== cfg.issuer) {
    jwks = createRemoteJWKSet(new URL(`${cfg.issuer}.well-known/jwks.json`));
    jwksIssuer = cfg.issuer;
  }
  return jwks;
}

async function verifyToken(token: string): Promise<{ sub: string }> {
  const cfg = authConfig();
  if (!cfg) throw new AuthError(503, "Authentication is not configured");
  try {
    const { payload } = await jwtVerify(token, keySet(cfg), {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: ["RS256"],
    });
    if (!payload.sub) throw new Error("Token has no subject");
    return { sub: payload.sub };
  } catch (err) {
    logger.debug({ err }, "Token rejected");
    throw new AuthError(401, "Invalid or expired token");
  }
}

async function fetchUserInfo(token: string): Promise<{ email?: string; email_verified?: boolean; name?: string }> {
  const cfg = authConfig()!;
  const res = await fetch(`${cfg.issuer}userinfo`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new AuthError(403, "Could not read the account email; sign in again with the email scope");
  return (await res.json()) as { email?: string; email_verified?: boolean; name?: string };
}

// ── Profile resolution ─────────────────────────────────────────────────────────

const subCache = new Map<string, string>();

async function findProfileForClaim(target: string): Promise<User | undefined> {
  const byName = await db
    .select()
    .from(users)
    .where(sql`lower(${users.name}) = ${target.toLowerCase()}`)
    .limit(2);
  if (byName.length === 1) return byName[0];
  try {
    return await db.query.users.findFirst({ where: eq(users.id, target) });
  } catch {
    return undefined; // not a UUID
  }
}

/** Links the login to a profile on first sight, or creates a fresh profile. */
async function provisionProfile(sub: string, token: string): Promise<User> {
  const info = await fetchUserInfo(token);
  const email = info.email?.trim().toLowerCase();
  if (!email || info.email_verified !== true) {
    throw new AuthError(403, "A verified email address is required");
  }
  if (!emailAllowed(email)) {
    logger.warn({ email }, "Login rejected: email is not on the allowlist");
    throw new AuthError(403, "This account is not allowed to use this app");
  }

  const claimTarget = parseClaimMap().get(email);
  if (claimTarget) {
    const existing = await findProfileForClaim(claimTarget);
    if (existing && !existing.authSub) {
      const [linked] = await db
        .update(users)
        .set({ authSub: sub, email })
        .where(eq(users.id, existing.id))
        .returning();
      logger.info({ userId: existing.id }, "Linked login to existing profile");
      return linked!;
    }
    if (existing && existing.authSub !== sub) {
      throw new AuthError(403, "That profile is already linked to another login");
    }
  }

  const name = info.name?.trim() || email.split("@")[0]!;
  const [created] = await db
    .insert(users)
    .values({ name: name.slice(0, 50), authSub: sub, email })
    .onConflictDoNothing({ target: users.authSub })
    .returning();
  if (created) {
    logger.info({ userId: created.id }, "Created profile for new login");
    return created;
  }
  const [raced] = await db.select().from(users).where(eq(users.authSub, sub)).limit(1);
  return raced!;
}

/** Resolves a bearer token to the acting profile. */
export async function userFromToken(token: string): Promise<User> {
  const { sub } = await verifyToken(token);

  const cachedId = subCache.get(sub);
  if (cachedId) {
    const cached = await db.query.users.findFirst({ where: eq(users.id, cachedId) });
    if (cached) return cached;
    subCache.delete(sub);
  }

  const [known] = await db.select().from(users).where(eq(users.authSub, sub)).limit(1);
  if (known) {
    if (known.email && !emailAllowed(known.email)) throw new AuthError(403, "This account is not allowed to use this app");
    subCache.set(sub, known.id);
    return known;
  }

  const user = await provisionProfile(sub, token);
  subCache.set(sub, user.id);
  return user;
}
