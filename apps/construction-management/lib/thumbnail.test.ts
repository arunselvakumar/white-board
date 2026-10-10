import { describe, expect, it } from "vitest";

import { isThumbnailSource, makeThumbnail, thumbnailSize } from "./thumbnail";

describe("browser thumbnails (CM-407)", () => {
  it("fits the longer side in 480 px and never enlarges", () => {
    expect(thumbnailSize(4000, 3000)).toEqual({ width: 480, height: 360 });
    expect(thumbnailSize(1080, 1920)).toEqual({ width: 270, height: 480 });
    expect(thumbnailSize(200, 100)).toEqual({ width: 200, height: 100 });
  });

  it("makes thumbnails only of PNG, JPEG and WebP images", () => {
    expect(isThumbnailSource({ name: "site.jpg", type: "image/jpeg" })).toBe(
      true,
    );
    expect(isThumbnailSource({ name: "site.HEIC", type: "image/heic" })).toBe(
      false,
    );
    expect(isThumbnailSource({ name: "site.webp", type: "" })).toBe(true);
    expect(
      isThumbnailSource({ name: "plan.pdf", type: "application/pdf" }),
    ).toBe(false);
  });

  it("gives up quietly where the browser can't make one", async () => {
    // Node has no createImageBitmap.
    await expect(makeThumbnail(new Blob(["x"]))).resolves.toBeNull();
  });
});
