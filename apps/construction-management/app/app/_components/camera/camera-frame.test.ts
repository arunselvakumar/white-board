import { describe, expect, it } from "vitest";

import {
  base64OfDataUrl,
  cameraFailureOf,
  CameraCaptureError,
  encodeWithin,
  facingOf,
  fitWithin,
  JPEG_QUALITIES,
  PHOTO_MAX_BYTES,
} from "./camera-frame";

function blobOf(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

describe("fitWithin", () => {
  it("scales the longer side down to 1,280 px, keeping the shape", () => {
    expect(fitWithin(1920, 1080)).toEqual({ width: 1280, height: 720 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: 1280 });
  });

  it("never scales up", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
});

describe("encodeWithin", () => {
  it("keeps the first quality when it fits", async () => {
    const tried: number[] = [];
    const blob = await encodeWithin((quality) => {
      tried.push(quality);
      return Promise.resolve(blobOf(300_000));
    });
    expect(blob.size).toBe(300_000);
    expect(tried).toEqual([0.82]);
  });

  it("lowers the quality in steps until the photo is at most 1 MB", async () => {
    const tried: number[] = [];
    const blob = await encodeWithin((quality) => {
      tried.push(quality);
      return Promise.resolve(
        blobOf(quality > 0.6 ? PHOTO_MAX_BYTES + 1 : PHOTO_MAX_BYTES),
      );
    });
    expect(blob.size).toBe(PHOTO_MAX_BYTES);
    expect(tried).toEqual([0.82, 0.72, 0.62, 0.52]);
  });

  it("then tries smaller sizes, and gives up in plain words", async () => {
    const scales = new Set<number>();
    await expect(
      encodeWithin((_quality, scale) => {
        scales.add(scale);
        return Promise.resolve(blobOf(PHOTO_MAX_BYTES + 1));
      }),
    ).rejects.toBeInstanceOf(CameraCaptureError);
    expect([...scales]).toEqual([1, 0.75, 0.5]);
    expect(JPEG_QUALITIES.at(-1)).toBeGreaterThan(0.3);
  });
});

describe("cameraFailureOf", () => {
  it("names each refusal of getUserMedia", () => {
    const named = (name: string) => Object.assign(new Error(name), { name });
    expect(cameraFailureOf(named("NotAllowedError"))).toBe("denied");
    expect(cameraFailureOf(named("NotFoundError"))).toBe("unavailable");
    expect(cameraFailureOf(named("OverconstrainedError"))).toBe("unavailable");
    expect(cameraFailureOf(named("NotReadableError"))).toBe("in_use");
    expect(cameraFailureOf(named("TypeError"))).toBe("error");
    expect(cameraFailureOf("nothing")).toBe("error");
  });
});

describe("facingOf", () => {
  it("trusts what the track reports, then its label, then what was asked", () => {
    expect(facingOf("user", "Back Camera", "environment")).toBe("user");
    expect(facingOf(undefined, "camera2 0, facing back", "user")).toBe(
      "environment",
    );
    expect(facingOf(undefined, "FaceTime HD Camera", "environment")).toBe(
      "user",
    );
    expect(facingOf(undefined, "", "environment")).toBe("environment");
  });
});

describe("base64OfDataUrl", () => {
  it("drops the data URL prefix", () => {
    expect(base64OfDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBe("/9j/4AAQ");
  });
});
