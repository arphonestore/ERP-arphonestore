import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LEN = 64;

export function hashPassword(plainText: string) {
  const salt = randomBytes(16).toString("base64");
  const key = scryptSync(plainText, salt, SCRYPT_KEY_LEN).toString("base64");

  return `${salt}:${key}`;
}

export function verifyPassword(plainText: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const expectedKey = Buffer.from(hash, "base64");
  const actualKey = scryptSync(plainText, salt, expectedKey.length);

  return timingSafeEqual(actualKey, expectedKey);
}
