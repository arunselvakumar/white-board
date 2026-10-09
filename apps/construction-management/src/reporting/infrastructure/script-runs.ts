/**
 * Splits text into runs that one font can print (CM-217 PDFs). Names on
 * a muster roll come in Hindi, Marathi, Tamil, Telugu and other Indian
 * scripts; each script has its own Noto font, and a name may mix scripts
 * with Latin digits and punctuation.
 */

/** The scripts the PDF has a font for. */
export const PDF_SCRIPTS = [
  "latin",
  "devanagari",
  "bengali",
  "gurmukhi",
  "gujarati",
  "oriya",
  "tamil",
  "telugu",
  "kannada",
  "malayalam",
] as const;

export type PdfScript = (typeof PDF_SCRIPTS)[number];

const SCRIPT_PATTERNS: readonly (readonly [PdfScript, RegExp])[] = [
  ["latin", /\p{Script=Latin}/u],
  ["devanagari", /\p{Script=Devanagari}/u],
  ["bengali", /\p{Script=Bengali}/u],
  ["gurmukhi", /\p{Script=Gurmukhi}/u],
  ["gujarati", /\p{Script=Gujarati}/u],
  ["oriya", /\p{Script=Oriya}/u],
  ["tamil", /\p{Script=Tamil}/u],
  ["telugu", /\p{Script=Telugu}/u],
  ["kannada", /\p{Script=Kannada}/u],
  ["malayalam", /\p{Script=Malayalam}/u],
];

/** Digits, spaces, punctuation, ₹, the danda; joiners and combining marks. */
const SHARED = /[\p{Script=Common}\p{Script=Inherited}]/u;

/**
 * The script of one character: one of {@link PDF_SCRIPTS}, `shared` for
 * characters every script uses (they join the run around them), or
 * `other` for a script the PDF has no font for (Ethiopic, Arabic, Han…).
 */
export function scriptOf(char: string): PdfScript | "shared" | "other" {
  if (SHARED.test(char)) return "shared";
  for (const [script, pattern] of SCRIPT_PATTERNS)
    if (pattern.test(char)) return script;
  return "other";
}

/** One font face the splitter may choose (a font file, either weight). */
export type FontFace = {
  key: string;
  script: PdfScript;
  has(codePoint: number): boolean;
};

export type TextRun = {
  /** The face's key. */
  face: string;
  text: string;
  /** Characters no face has, printed as "?". */
  missing: boolean;
};

const FALLBACK = "?";

/**
 * Splits `text` into runs of one face each. A character of a script goes
 * to the first face of that script that has it; a shared character
 * (space, digit, ₹, danda, joiner) stays in the run it follows when that
 * face has it, else the first face that does (Latin first). A character
 * no face has becomes "?" in the first Latin face, and the run says so.
 */
export function splitRuns(text: string, faces: readonly FontFace[]): TextRun[] {
  const runs: TextRun[] = [];
  const latin = faces.filter((face) => face.script === "latin");
  const fallback = latin.find((face) => face.has(FALLBACK.codePointAt(0) ?? 0));
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    const script = scriptOf(char);
    const current = runs.at(-1);
    let face: FontFace | undefined;
    if (script === "shared") {
      face =
        current == null || current.missing
          ? undefined
          : faces.find(
              (item) => item.key === current.face && item.has(codePoint),
            );
      face ??= [...latin, ...faces].find((item) => item.has(codePoint));
    } else if (script !== "other")
      face = faces.find(
        (item) => item.script === script && item.has(codePoint),
      );
    const missing = face == null;
    const key = face?.key ?? fallback?.key ?? latin[0]?.key ?? "";
    const value = missing ? FALLBACK : char;
    if (current?.face === key && current.missing === missing)
      current.text += value;
    else runs.push({ face: key, text: value, missing });
  }
  return runs;
}
