import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  type PDFObject,
} from "pdf-lib";

/**
 * Reads back what a report PDF prints, for tests: the fonts it embeds and
 * each page's text. The text is decoded through each font's ToUnicode map,
 * one line per drawn run, in drawing order. Shaped Indic text reads back
 * in glyph (visual) order: a vowel sign drawn before its consonant comes
 * first.
 */
export type PdfContents = {
  /** Base font names, pdf-lib's tag and suffix removed: `NotoSansTamil-Regular`. */
  fonts: string[];
  pages: string[][];
};

function bytesOf(stream: PDFObject | undefined): Uint8Array {
  if (stream instanceof PDFRawStream)
    return decodePDFRawStream(stream).decode();
  return new Uint8Array();
}

function utf16(hex: string): string {
  const units: number[] = [];
  for (let index = 0; index < hex.length; index += 4)
    units.push(Number.parseInt(hex.slice(index, index + 4), 16));
  return String.fromCharCode(...units);
}

/** A ToUnicode CMap's glyph → text pairs (pdf-lib writes `bfchar` blocks). */
function toUnicode(cmap: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, glyph = "", text = ""] of (block[1] ?? "").matchAll(
      /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g,
    ))
      map.set(glyph.toUpperCase(), utf16(text));
  return map;
}

export async function inspectPdf(bytes: Uint8Array): Promise<PdfContents> {
  const pdf = await PDFDocument.load(bytes);
  const resolve = (value: PDFObject | undefined) =>
    value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const fonts = new Set<string>();
  const pages = pdf.getPages().map((page) => {
    const resources = page.node.Resources();
    const fontDict = resolve(resources?.get(PDFName.of("Font")));
    const maps = new Map<string, Map<string, string>>();
    if (fontDict instanceof PDFDict)
      for (const [name, ref] of fontDict.entries()) {
        const font = resolve(ref);
        if (!(font instanceof PDFDict)) continue;
        const base = font.get(PDFName.of("BaseFont"));
        if (base instanceof PDFName)
          fonts.add(
            base
              .decodeText()
              .replace(/^[A-Z]{6}\+/, "")
              .replace(/-\d+$/, ""),
          );
        const cmap = bytesOf(resolve(font.get(PDFName.of("ToUnicode"))));
        maps.set(name.decodeText(), toUnicode(new TextDecoder().decode(cmap)));
      }
    const contents = resolve(page.node.get(PDFName.of("Contents")));
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((item) => resolve(item))
        : [contents];
    const program = streams
      .map((stream) => new TextDecoder().decode(bytesOf(stream)))
      .join("\n");
    const lines: string[] = [];
    let map = new Map<string, string>();
    for (const [, font, hex] of program.matchAll(
      /\/(\S+)\s+[\d.]+\s+Tf|<([0-9a-fA-F]*)>\s*Tj/g,
    )) {
      if (font != null) map = maps.get(font) ?? new Map<string, string>();
      else if (hex != null) {
        let text = "";
        for (let index = 0; index < hex.length; index += 4)
          text += map.get(hex.slice(index, index + 4).toUpperCase()) ?? "�";
        lines.push(text);
      }
    }
    return lines;
  });
  return { fonts: [...fonts].sort(), pages };
}
