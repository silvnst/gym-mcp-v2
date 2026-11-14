import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for secrets that users hand to the app (their Garmin API key).
 * AES-256-GCM with a key derived from the SECRETS_KEY environment variable.
 * Without SECRETS_KEY nothing can be stored; changing it makes stored secrets
 * unreadable, and their owners have to enter them again.
 */
function key(): Buffer | null {
  const raw = process.env["SECRETS_KEY"]?.trim();
  return raw ? createHash("sha256").update(raw).digest() : null;
}

export function secretsAvailable(): boolean {
  return key() !== null;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("SECRETS_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Null when the value can't be read, e.g. after SECRETS_KEY changed. */
export function decryptSecret(stored: string): string | null {
  const k = key();
  const [version, iv, tag, data] = stored.split(":");
  if (!k || version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
