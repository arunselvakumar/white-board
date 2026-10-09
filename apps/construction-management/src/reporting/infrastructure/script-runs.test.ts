import { describe, expect, it } from "vitest";

import { scriptOf, splitRuns, type FontFace } from "./script-runs";

/** A face covering the characters of `chars` (ranges as [from, to]). */
function face(
  key: string,
  script: FontFace["script"],
  ...ranges: [number, number][]
): FontFace {
  return {
    key,
    script,
    has: (codePoint) =>
      ranges.some(([from, to]) => codePoint >= from && codePoint <= to),
  };
}

// Like Fontsource's subsets: Latin has ASCII but not ₹; Latin Extended
// has ₹ but no space; the Devanagari subset has the danda, joiners and
// ₹ but no space or Latin; Tamil has the danda too.
const FACES = [
  face("latin", "latin", [0x20, 0xff], [0x2000, 0x206f]),
  face("latin-ext", "latin", [0x100, 0x24f], [0x20a0, 0x20c0]),
  face(
    "devanagari",
    "devanagari",
    [0x900, 0x97f],
    [0x200c, 0x200d],
    [0x20b9, 0x20b9],
  ),
  face("tamil", "tamil", [0xb82, 0xbfa], [0x964, 0x965], [0x200c, 0x200d]),
];

describe("scriptOf", () => {
  it("names the scripts the PDF has fonts for", () => {
    expect(scriptOf("R")).toBe("latin");
    expect(scriptOf("ā")).toBe("latin");
    expect(scriptOf("र")).toBe("devanagari");
    expect(scriptOf("மு".charAt(0))).toBe("tamil");
    expect(scriptOf("శ")).toBe("telugu");
    expect(scriptOf("ক")).toBe("bengali");
    expect(scriptOf("ਗ")).toBe("gurmukhi");
    expect(scriptOf("ક")).toBe("gujarati");
    expect(scriptOf("ପ")).toBe("oriya");
    expect(scriptOf("ಶ")).toBe("kannada");
    expect(scriptOf("ക")).toBe("malayalam");
  });

  it("calls digits, spaces, punctuation, ₹, the danda and joiners shared", () => {
    for (const char of ["1", " ", ".", "(", "₹", "।", "‍", "‌"])
      expect(scriptOf(char), char).toBe("shared");
  });

  it("calls any other script other", () => {
    expect(scriptOf("አ")).toBe("other");
    expect(scriptOf("ب")).toBe("other");
    expect(scriptOf("中")).toBe("other");
  });
});

describe("splitRuns", () => {
  it("keeps a Latin name in one run", () => {
    expect(splitRuns("Raju Pawar (2)", FACES)).toEqual([
      { face: "latin", text: "Raju Pawar (2)", missing: false },
    ]);
  });

  it("puts ₹ in the Latin face that has it", () => {
    expect(splitRuns("₹ 1,200.00", FACES)).toEqual([
      { face: "latin-ext", text: "₹", missing: false },
      { face: "latin", text: " 1,200.00", missing: false },
    ]);
  });

  it("splits a name mixing scripts, the space going to the face that has it", () => {
    expect(splitRuns("Raju राजू पवार", FACES)).toEqual([
      { face: "latin", text: "Raju ", missing: false },
      { face: "devanagari", text: "राजू", missing: false },
      { face: "latin", text: " ", missing: false },
      { face: "devanagari", text: "पवार", missing: false },
    ]);
  });

  it("keeps joiners and the danda with the script they follow", () => {
    expect(splitRuns("क्\u200dष।", FACES)).toEqual([
      { face: "devanagari", text: "क्\u200dष।", missing: false },
    ]);
    expect(splitRuns("முருகன்।", FACES)).toEqual([
      { face: "tamil", text: "முருகன்।", missing: false },
    ]);
  });

  it("prints a script without a face as ? and says so", () => {
    expect(splitRuns("አበበ Raju", FACES)).toEqual([
      { face: "latin", text: "???", missing: true },
      { face: "latin", text: " Raju", missing: false },
    ]);
  });

  it("prints a script whose font is not loaded as ?", () => {
    expect(splitRuns("శ్రీ", FACES)).toEqual([
      { face: "latin", text: "????", missing: true },
    ]);
  });

  it("returns no runs for empty text", () => {
    expect(splitRuns("", FACES)).toEqual([]);
  });
});
