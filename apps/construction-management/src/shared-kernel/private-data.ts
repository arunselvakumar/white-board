import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for identity numbers (Aadhaar, PAN) at rest (CM-108). The key
 * is `CONSTRUCTION_PRIVATE_DATA_KEY`, 32 random bytes in base64. Ciphertext
 * is `v1.<iv>.<tag>.<data>`, all base64url, so the key can be rotated later
 * by version.
 */
export class PrivateDataCipher {
  private constructor(private readonly key: Buffer) {}

  static fromEnv(): PrivateDataCipher {
    const raw = process.env["CONSTRUCTION_PRIVATE_DATA_KEY"];
    if (raw == null || raw.length === 0)
      throw new Error(
        "CONSTRUCTION_PRIVATE_DATA_KEY is required to store Aadhaar and PAN.",
      );
    return PrivateDataCipher.fromKey(raw);
  }

  static fromKey(base64: string): PrivateDataCipher {
    const key = Buffer.from(base64, "base64");
    if (key.length !== 32)
      throw new Error(
        "CONSTRUCTION_PRIVATE_DATA_KEY must be 32 bytes, base64.",
      );
    return new PrivateDataCipher(key);
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv, tag, data]
      .map((part) =>
        typeof part === "string" ? part : part.toString("base64url"),
      )
      .join(".");
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== "v1" || iv == null || tag == null || data == null)
      throw new Error("Unknown private data format.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
