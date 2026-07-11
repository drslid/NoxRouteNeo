import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function encryptionKey() {
  const encoded = process.env.APP_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("APP_ENCRYPTION_KEY is required");
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  return key;
}

export function encryptSecret(value: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([encrypted, authenticationTag]).toString("base64"),
    nonce: nonce.toString("base64"),
  };
}

export function decryptSecret(ciphertext: string, nonce: string) {
  const payload = Buffer.from(ciphertext, "base64");
  if (payload.length <= 16) {
    throw new Error("Encrypted secret is invalid");
  }

  const encrypted = payload.subarray(0, -16);
  const authenticationTag = payload.subarray(-16);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(nonce, "base64"),
  );
  decipher.setAuthTag(authenticationTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

export function secretDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateSubscriptionToken() {
  return randomBytes(32).toString("base64url");
}
