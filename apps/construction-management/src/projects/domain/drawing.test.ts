import { describe, expect, it } from "vitest";

import {
  albumName,
  drawingName,
  drawingNameFromFile,
  revisionLabel,
} from "./drawing";

function codeOf(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? String(error);
  }
}

describe("drawing rules (CM-408)", () => {
  it("cleans album and drawing names", () => {
    expect(albumName("  Fire   fighting ")).toBe("Fire fighting");
    expect(codeOf(() => albumName("   "))).toBe("ALBUM_NAME_REQUIRED");
    expect(codeOf(() => albumName("x".repeat(81)))).toBe("ALBUM_NAME_TOO_LONG");
    expect(drawingName(" GF  Plan ")).toBe("GF Plan");
    expect(codeOf(() => drawingName(""))).toBe("DRAWING_NAME_REQUIRED");
    expect(codeOf(() => drawingName("x".repeat(121)))).toBe(
      "DRAWING_NAME_TOO_LONG",
    );
  });

  it("names a new drawing after its file", () => {
    expect(drawingNameFromFile("GF Plan R3.dwg")).toBe("GF Plan R3");
    expect(drawingNameFromFile("Column  layout.v2.pdf")).toBe(
      "Column layout.v2",
    );
    expect(drawingNameFromFile("README")).toBe("README");
    expect(drawingNameFromFile(".pdf")).toBe(".pdf");
    expect(drawingNameFromFile(`${"a".repeat(130)}.pdf`)).toHaveLength(120);
  });

  it("labels revisions R1, R2 …", () => {
    expect(revisionLabel(1)).toBe("R1");
    expect(revisionLabel(12)).toBe("R12");
  });
});
