// fontkit 1.x's Indic shaper calls a global `regeneratorRuntime`.
import "regenerator-runtime";

import fontkit from "@pdf-lib/fontkit";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { PDFDocument, PDFFont } from "pdf-lib";

import type { FontFace, PdfScript } from "./script-runs";

/**
 * The Noto faces a report PDF can print with (CM-217), from the
 * `@fontsource` packages: Noto Sans (Latin, and Latin Extended for ₹) and
 * one Noto Sans font per Indian script. Fontsource ships each font split
 * by Unicode subset, as WOFF; fontkit reads WOFF and pdf-lib subsets it
 * into the PDF, so only the glyphs a report uses are embedded.
 */
const FACES: readonly {
  key: string;
  script: PdfScript;
  pkg: string;
  stem: string;
}[] = [
  { key: "latin", script: "latin", pkg: "noto-sans", stem: "noto-sans-latin" },
  {
    key: "latin-ext",
    script: "latin",
    pkg: "noto-sans",
    stem: "noto-sans-latin-ext",
  },
  ...(
    [
      "devanagari",
      "bengali",
      "gurmukhi",
      "gujarati",
      "oriya",
      "tamil",
      "telugu",
      "kannada",
      "malayalam",
    ] as const
  ).map((script) => ({
    key: script,
    script,
    pkg: `noto-sans-${script}`,
    stem: `noto-sans-${script}-${script}`,
  })),
];

export type FontWeight = "regular" | "bold";

const WEIGHTS: Record<FontWeight, number> = { regular: 400, bold: 700 };

/** The npm path of a face's font file. */
export function fontFileOf(key: string, weight: FontWeight): string {
  const face = FACES.find((item) => item.key === key);
  if (face == null) throw new Error(`No PDF font face "${key}".`);
  return `@fontsource/${face.pkg}/files/${face.stem}-${String(WEIGHTS[weight])}-normal.woff`;
}

/**
 * Found in `node_modules` from the app's folder up, as Node would, at run
 * time (server only): the files are not bundled, and a `require.resolve`
 * here would be rewritten by the bundler. `next.config.ts` traces them
 * into the reports route's serverless function.
 */
function resolveFontFile(file: string): string {
  let folder = process.cwd();
  for (;;) {
    const candidate = path.join(folder, "node_modules", file);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(folder);
    if (parent === folder)
      throw new Error(`The PDF font file ${file} is not installed.`);
    folder = parent;
  }
}

const bytesCache = new Map<string, Promise<Uint8Array>>();

/** A face's font file, read once per process. */
export function fontBytes(
  key: string,
  weight: FontWeight,
): Promise<Uint8Array> {
  const file = fontFileOf(key, weight);
  let bytes = bytesCache.get(file);
  if (bytes == null) {
    bytes = readFile(resolveFontFile(file)).then(
      (buffer) => new Uint8Array(buffer),
    );
    bytes.catch(() => bytesCache.delete(file));
    bytesCache.set(file, bytes);
  }
  return bytes;
}

let facesCache: Promise<FontFace[]> | null = null;

/**
 * Every face, in the order the splitter prefers them, with what it covers
 * (the regular weight's character map; both weights share a subset).
 */
export function pdfFontFaces(): Promise<FontFace[]> {
  facesCache ??= Promise.all(
    FACES.map(async ({ key, script }) => {
      const font = fontkit.create(await fontBytes(key, "regular"));
      return {
        key,
        script,
        has: (codePoint: number) => font.hasGlyphForCodePoint(codePoint),
      };
    }),
  );
  facesCache.catch(() => {
    facesCache = null;
  });
  return facesCache;
}

type SubsetInternals = {
  glyf: Uint8Array[];
  offset: number;
  _addGlyph: (this: SubsetInternals, glyphId: number) => number;
};

/**
 * fontkit 1.x writes a subset's glyph offsets in the short `loca` format
 * (offset ÷ 2) without padding glyphs to an even length, so a font with
 * odd-length glyphs (Noto Sans Telugu) comes out garbled after the first
 * one. Padding each copied glyph to an even length fixes it.
 */
function padGlyphsToEvenLength(subset: SubsetInternals): void {
  const addGlyph = subset._addGlyph;
  subset._addGlyph = function (this: SubsetInternals, glyphId: number) {
    const index = addGlyph.call(this, glyphId);
    const glyph = this.glyf[index];
    if (glyph != null && glyph.length % 2 === 1) {
      // fontkit's own Buffer class: its encoder refuses other byte arrays.
      const Bytes = glyph.constructor as unknown as {
        alloc(size: number): Uint8Array;
      };
      const padded = Bytes.alloc(glyph.length + 1);
      padded.set(glyph);
      this.glyf[index] = padded;
      this.offset += 1;
    }
    return index;
  };
}

type Fontkit = Parameters<PDFDocument["registerFontkit"]>[0];

/** `@pdf-lib/fontkit` with {@link padGlyphsToEvenLength} on every subset. */
export const reportFontkit: Fontkit = {
  create(buffer, postscriptName) {
    const font = fontkit.create(buffer, postscriptName);
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => {
      const subset = createSubset();
      padGlyphsToEvenLength(subset as unknown as SubsetInternals);
      return subset;
    };
    return font;
  },
};

/**
 * Glyph positioning off: pdf-lib draws glyphs by their advance widths and
 * ignores GPOS offsets anyway (Noto's marks have zero width and sit right
 * by design), and fontkit 1.x crashes positioning some Telugu, Malayalam
 * and Gurmukhi clusters. Substitution (conjuncts, vowel signs) stays on.
 */
const NO_POSITIONING = {
  kern: false,
  mark: false,
  mkmk: false,
  abvm: false,
  blwm: false,
  dist: false,
  curs: false,
};

/** Lets `pdf` embed the Noto faces. */
export function registerReportFonts(pdf: PDFDocument): void {
  pdf.registerFontkit(reportFontkit);
}

/** Embeds one face, subset to the glyphs the document draws. */
export async function embedFace(
  pdf: PDFDocument,
  key: string,
  weight: FontWeight,
): Promise<PDFFont> {
  return pdf.embedFont(await fontBytes(key, weight), {
    subset: true,
    features: NO_POSITIONING,
  });
}
