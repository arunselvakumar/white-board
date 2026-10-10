import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";
// fontkit's Indic shaper is compiled with regenerator: it needs the runtime.
import "regenerator-runtime/runtime.js";
import type { Color, PDFDocument, PDFFont, PDFPage } from "pdf-lib";

/**
 * Text in Indian scripts on generated PDFs (CM-316 payslips). The standard
 * PDF fonts are WinAnsi only, so names written in Hindi, Tamil, Telugu,
 * Kannada, Malayalam, Bengali, Gujarati, Punjabi or Odia (and ₹) need
 * embedded fonts: the Noto Sans font of each Indian script the document
 * uses. Each string is drawn in runs, one font per script; only the fonts
 * a document needs are embedded, subset to the glyphs it uses. Latin
 * text, digits and ₹ are drawn with Noto Sans Devanagari, which carries
 * them: the full Noto Sans subsets badly with fontkit (most Latin glyphs
 * vanish in Preview), the Indian fonts do not.
 *
 * fontkit lays the runs out with the fonts' OpenType tables (conjuncts
 * and reordered vowel signs included), as far as its shapers go.
 *
 * The fonts are the `@expo-google-fonts/noto-sans-*` packages (OFL), read
 * from `node_modules`; `next.config.ts` traces them into the deployment.
 */

export type NotoScript =
  | "latin"
  | "devanagari"
  | "bengali"
  | "gurmukhi"
  | "gujarati"
  | "oriya"
  | "tamil"
  | "telugu"
  | "kannada"
  | "malayalam";

/** Unicode blocks, `[first, last, script]`. */
const BLOCKS: readonly [number, number, NotoScript][] = [
  [0x0900, 0x097f, "devanagari"],
  [0xa8e0, 0xa8ff, "devanagari"],
  [0x0980, 0x09ff, "bengali"],
  [0x0a00, 0x0a7f, "gurmukhi"],
  [0x0a80, 0x0aff, "gujarati"],
  [0x0b00, 0x0b7f, "oriya"],
  [0x0b80, 0x0bff, "tamil"],
  [0x0c00, 0x0c7f, "telugu"],
  [0x0c80, 0x0cff, "kannada"],
  [0x0d00, 0x0d7f, "malayalam"],
];

const PACKAGES: Record<NotoScript, { dir: string; family: string }> = {
  latin: { dir: "noto-sans-devanagari", family: "NotoSansDevanagari" },
  devanagari: { dir: "noto-sans-devanagari", family: "NotoSansDevanagari" },
  bengali: { dir: "noto-sans-bengali", family: "NotoSansBengali" },
  gurmukhi: { dir: "noto-sans-gurmukhi", family: "NotoSansGurmukhi" },
  gujarati: { dir: "noto-sans-gujarati", family: "NotoSansGujarati" },
  oriya: { dir: "noto-sans-oriya", family: "NotoSansOriya" },
  tamil: { dir: "noto-sans-tamil", family: "NotoSansTamil" },
  telugu: { dir: "noto-sans-telugu", family: "NotoSansTelugu" },
  kannada: { dir: "noto-sans-kannada", family: "NotoSansKannada" },
  malayalam: { dir: "noto-sans-malayalam", family: "NotoSansMalayalam" },
};

/** Zero-width joiners and marks stay with the run before them. */
function joinsPrevious(code: number): boolean {
  return code === 0x200c || code === 0x200d || code === 0x25cc;
}

export function scriptOf(code: number): NotoScript {
  for (const [first, last, script] of BLOCKS)
    if (code >= first && code <= last) return script;
  return "latin";
}

/** The string split into runs of one script each. */
export function scriptRuns(
  text: string,
): { script: NotoScript; text: string }[] {
  const runs: { script: NotoScript; text: string }[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const last = runs.at(-1);
    const script =
      last != null && joinsPrevious(code) ? last.script : scriptOf(code);
    if (last?.script === script) last.text += char;
    else runs.push({ script, text: char });
  }
  return runs;
}

/** The PDF text value: control characters and other whitespace as spaces. */
function clean(text: string): string {
  return text.replace(/[\s\p{Cc}]/gu, " ");
}

const cache = new Map<string, Promise<Uint8Array>>();

/** `node_modules` holding the font packages, wherever the process runs from. */
function candidates(file: string): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "node_modules", "@expo-google-fonts", file),
    path.join(
      cwd,
      "apps",
      "construction-management",
      "node_modules",
      "@expo-google-fonts",
      file,
    ),
  ];
}

async function fontBytes(
  script: NotoScript,
  weight: "regular" | "bold",
): Promise<Uint8Array> {
  const { dir, family } = PACKAGES[script];
  const folder = weight === "bold" ? "700Bold" : "400Regular";
  const file = path.join(dir, folder, `${family}_${folder}.ttf`);
  let pending = cache.get(file);
  if (pending == null) {
    pending = (async () => {
      let lastError: unknown = null;
      for (const candidate of candidates(file)) {
        try {
          return new Uint8Array(await readFile(candidate));
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`The Noto font ${file} is missing.`, {
        cause: lastError,
      });
    })();
    pending.catch(() => cache.delete(file));
    cache.set(file, pending);
  }
  return pending;
}

export type NotoText = {
  width(text: string, size: number, bold?: boolean): number;
  draw(
    page: PDFPage,
    text: string,
    options: {
      x: number;
      y: number;
      size: number;
      bold?: boolean;
      color: Color;
    },
  ): void;
  /** Cuts `text` to fit `width`, ending with "…". */
  fit(text: string, size: number, width: number, bold?: boolean): string;
};

/**
 * Embeds the base font (regular and bold) and the fonts of every Indian
 * script in `texts`, and returns a writer that draws any of those strings.
 */
export async function embedNotoText(
  pdf: PDFDocument,
  texts: readonly string[],
): Promise<NotoText> {
  pdf.registerFontkit(fontkit);
  const scripts = new Set<NotoScript>(["latin"]);
  for (const text of texts)
    for (const run of scriptRuns(text)) scripts.add(run.script);
  // Latin and Devanagari share one font file: embed it once.
  scripts.delete("devanagari");
  const fonts = new Map<string, PDFFont>();
  for (const script of scripts)
    for (const weight of ["regular", "bold"] as const)
      fonts.set(
        `${script}:${weight}`,
        await pdf.embedFont(await fontBytes(script, weight), { subset: true }),
      );
  const fontFor = (script: NotoScript, bold: boolean): PDFFont => {
    const key = script === "devanagari" ? "latin" : script;
    const font =
      fonts.get(`${key}:${bold ? "bold" : "regular"}`) ??
      fonts.get(`latin:${bold ? "bold" : "regular"}`);
    if (font == null) throw new Error("The base Noto font was not embedded.");
    return font;
  };
  const width = (text: string, size: number, bold = false): number =>
    scriptRuns(clean(text)).reduce(
      (sum, run) =>
        sum + fontFor(run.script, bold).widthOfTextAtSize(run.text, size),
      0,
    );
  return {
    width,
    draw(page, text, options) {
      let x = options.x;
      for (const run of scriptRuns(clean(text))) {
        const font = fontFor(run.script, options.bold === true);
        page.drawText(run.text, {
          x,
          y: options.y,
          size: options.size,
          font,
          color: options.color,
        });
        x += font.widthOfTextAtSize(run.text, options.size);
      }
    },
    fit(text, size, maxWidth, bold = false) {
      if (width(text, size, bold) <= maxWidth) return text;
      // Code points: a cut never splits a surrogate pair.
      let cut = Array.from(text);
      while (cut.length > 0 && width(`${cut.join("")}…`, size, bold) > maxWidth)
        cut = cut.slice(0, -1);
      return cut.length === 0 ? "" : `${cut.join("")}…`;
    },
  };
}
