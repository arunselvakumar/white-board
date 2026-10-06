import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function privateKey(): Buffer {
  const encoded = process.env["TEACHER_PRIVATE_DATA_KEY"];
  const key =
    encoded == null ? Buffer.alloc(0) : Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error(
      "TEACHER_PRIVATE_DATA_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptPrivateBytes(bytes: Uint8Array): Uint8Array {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", privateKey(), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), encrypted]);
}

export function decryptPrivateBytes(bytes: Uint8Array): Uint8Array {
  const packed = Buffer.from(bytes);
  if (packed.length < 29 || packed[0] !== 1)
    throw new Error("Teacher private data is invalid.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    privateKey(),
    packed.subarray(1, 13),
  );
  decipher.setAuthTag(packed.subarray(13, 29));
  return Buffer.concat([
    decipher.update(packed.subarray(29)),
    decipher.final(),
  ]);
}

export function encryptPrivateText(value: string): string {
  return Buffer.from(encryptPrivateBytes(Buffer.from(value, "utf8"))).toString(
    "base64",
  );
}
