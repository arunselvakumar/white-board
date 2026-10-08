import { describe, expect, it } from "vitest";

import { DomainError } from "../domain-error";
import { IMAGE_LIMITS, checkImage, sniffImageType } from "./image-file";
import { companyFileKey, fileVersion } from "./object-storage";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = new TextEncoder().encode("GIF89a......");

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
}

describe("checkImage", () => {
  it("sniffs PNG, JPEG and WebP by content", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(GIF)).toBeNull();
  });

  it("accepts an image whose declared type matches its content", () => {
    expect(checkImage("company_logo", PNG, "image/png")).toEqual({
      contentType: "image/png",
      extension: "png",
      bytes: PNG.byteLength,
    });
    expect(
      checkImage("member_photo", JPEG, "image/jpeg; charset=binary").extension,
    ).toBe("jpg");
  });

  it("refuses other types, and a type that lies about the content", () => {
    expect(codeOf(() => checkImage("company_logo", GIF, "image/gif"))).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    expect(codeOf(() => checkImage("company_logo", GIF, "image/png"))).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
    expect(codeOf(() => checkImage("company_logo", PNG, null))).toBe(
      "FILE_TYPE_NOT_ALLOWED",
    );
  });

  it("limits a logo to 2 MB and a photo to 10 MB", () => {
    const logo = new Uint8Array(IMAGE_LIMITS.company_logo + 1);
    logo.set(PNG);
    expect(codeOf(() => checkImage("company_logo", logo, "image/png"))).toBe(
      "FILE_TOO_LARGE",
    );
    expect(checkImage("member_photo", logo, "image/png").bytes).toBe(
      logo.byteLength,
    );
    expect(
      codeOf(() =>
        checkImage(
          "member_photo",
          new Uint8Array(IMAGE_LIMITS.member_photo + 1),
          "image/png",
        ),
      ),
    ).toBe("FILE_TOO_LARGE");
    expect(
      codeOf(() => checkImage("member_photo", new Uint8Array(), "image/png")),
    ).toBe("FILE_EMPTY");
  });
});

describe("companyFileKey", () => {
  it("puts every file under the Company's prefix with a fresh id", () => {
    const key = companyFileKey("company-a", "logo", "png");
    expect(key).toMatch(/^companies\/company-a\/logo\/[0-9a-f-]{36}\.png$/);
    expect(fileVersion(key)).toHaveLength(36);
    expect(companyFileKey("company-a", "logo", "png")).not.toBe(key);
  });
});
