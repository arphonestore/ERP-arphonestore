import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const FORMAT_NAME = "scrypt";
const FORMAT_VERSION = "v1";
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const NEW_SCRYPT_OPTIONS = {
  N: 32_768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} satisfies ScryptOptions;
const LEGACY_SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
} satisfies ScryptOptions;

type ParsedVersionedHash = {
  salt: Buffer;
  expectedKey: Buffer;
  options: ScryptOptions;
};

function deriveKey(
  plainText: string,
  salt: string | Buffer,
  keyLength: number,
  options: ScryptOptions
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(plainText, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function encodeHash(salt: Buffer, key: Buffer) {
  return [
    FORMAT_NAME,
    FORMAT_VERSION,
    NEW_SCRYPT_OPTIONS.N,
    NEW_SCRYPT_OPTIONS.r,
    NEW_SCRYPT_OPTIONS.p,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

function decodeBase64(value: string) {
  if (value.length === 0 || value.length > 256 || value.length % 4 !== 0) {
    return null;
  }

  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : null;
}

function decodeBase64Url(value: string) {
  if (value.length === 0 || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

function parsePositiveInteger(value: string) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseVersionedHash(storedHash: string): ParsedVersionedHash | null {
  if (storedHash.length > 512) {
    return null;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 7 || parts[0] !== FORMAT_NAME || parts[1] !== FORMAT_VERSION) {
    return null;
  }

  const N = parsePositiveInteger(parts[2]);
  const r = parsePositiveInteger(parts[3]);
  const p = parsePositiveInteger(parts[4]);
  const salt = decodeBase64Url(parts[5]);
  const expectedKey = decodeBase64Url(parts[6]);

  const validCost =
    N !== null &&
    N >= 16_384 &&
    N <= 131_072 &&
    (N & (N - 1)) === 0 &&
    r !== null &&
    r <= 16 &&
    p !== null &&
    p <= 4;

  if (!validCost || !salt || salt.length !== SALT_LENGTH || !expectedKey || expectedKey.length !== KEY_LENGTH) {
    return null;
  }

  const estimatedMemory = 128 * N * r;
  if (estimatedMemory > 256 * 1024 * 1024) {
    return null;
  }

  return {
    salt,
    expectedKey,
    options: {
      N,
      r,
      p,
      maxmem: estimatedMemory + 8 * 1024 * 1024,
    },
  };
}

async function verifyVersionedHash(plainText: string, storedHash: string) {
  const parsed = parseVersionedHash(storedHash);
  if (!parsed) {
    return false;
  }

  const actualKey = await deriveKey(
    plainText,
    parsed.salt,
    parsed.expectedKey.length,
    parsed.options
  );

  return timingSafeEqual(actualKey, parsed.expectedKey);
}

async function verifyLegacyHash(plainText: string, storedHash: string) {
  if (storedHash.length > 512) {
    return false;
  }

  const parts = storedHash.split(":");
  if (parts.length !== 2) {
    return false;
  }

  const saltBytes = decodeBase64(parts[0]);
  const expectedKey = decodeBase64(parts[1]);

  if (
    !saltBytes ||
    saltBytes.length < 8 ||
    saltBytes.length > 64 ||
    !expectedKey ||
    expectedKey.length < 16 ||
    expectedKey.length > 128
  ) {
    return false;
  }

  const actualKey = await deriveKey(
    plainText,
    parts[0],
    expectedKey.length,
    LEGACY_SCRYPT_OPTIONS
  );

  return timingSafeEqual(actualKey, expectedKey);
}

export async function hashPasswordAsync(plainText: string) {
  if (!plainText) {
    throw new Error("Password must not be empty.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(plainText, salt, KEY_LENGTH, NEW_SCRYPT_OPTIONS);
  return encodeHash(salt, key);
}


export async function verifyPassword(plainText: string, storedHash: string) {
  if (typeof storedHash !== "string" || storedHash.length === 0) {
    return false;
  }

  try {
    if (storedHash.startsWith(`${FORMAT_NAME}$`)) {
      return await verifyVersionedHash(plainText, storedHash);
    }

    return await verifyLegacyHash(plainText, storedHash);
  } catch {
    return false;
  }
}
