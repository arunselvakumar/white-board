import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
} from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { buildDailyProgressReport } from "../domain/daily-progress-report";
import {
  dprReadModel,
  dprWorksheet,
} from "../domain/daily-progress-report-fixtures";
import { printableImage } from "./dpr-images";
import { createDprRenderer, dprTexts, type DprImageLoader } from "./dpr-pdf";

const TAMIL = "மழை காரணமாக வேலை நின்றது";
const HINDI = "बारिश के कारण काम रुका";

/** Font names embedded in the PDF. */
function fontNames(pdf: PDFDocument): string {
  return pdf.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) =>
      object instanceof PDFDict &&
      object.get(PDFName.of("Type")) === PDFName.of("Font")
        ? [String(object.get(PDFName.of("BaseFont")))]
        : [],
    )
    .join(" ");
}

/**
 * Every character the PDF's fonts map back to Unicode (their ToUnicode
 * CMaps): the text a reader or a copy-paste gets out of the file.
 */
function mappedCharacters(pdf: PDFDocument): Set<string> {
  const chars = new Set<string>();
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const ref = object.get(PDFName.of("ToUnicode"));
    if (!(ref instanceof PDFRef)) continue;
    const stream = pdf.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const cmap = new TextDecoder().decode(decodePDFRawStream(stream).decode());
    // `<src> <dst>` pairs: dst is UTF-16BE hex, possibly several units.
    for (const match of cmap.matchAll(/<[0-9A-Fa-f]+>\s*<([0-9A-Fa-f]+)>/g)) {
      const hex = match[1] ?? "";
      const units: number[] = [];
      for (let index = 0; index < hex.length; index += 4)
        units.push(parseInt(hex.slice(index, index + 4), 16));
      for (const char of String.fromCharCode(...units)) chars.add(char);
    }
  }
  return chars;
}

async function image(format: "webp" | "png"): Promise<Uint8Array> {
  const base = sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 200, g: 120, b: 40 },
    },
  });
  return new Uint8Array(
    await (format === "webp" ? base.webp() : base.png()).toBuffer(),
  );
}

describe("the Daily Progress Report PDF", () => {
  it("prints every section with Tamil and Hindi remarks, the logo and the photo grid", async () => {
    const webp = await image("webp");
    const png = await image("png");
    const loads: string[] = [];
    const loader: DprImageLoader = async (ref, use) => {
      loads.push(`${use}:${ref.key}`);
      if (ref.key === "missing") return null;
      return printableImage(ref.key === "logo" ? png : webp, use);
    };
    const document = buildDailyProgressReport(
      dprReadModel({
        logo: { key: "logo", contentType: "image/png" },
        includeImages: true,
        worksheets: [
          dprWorksheet({ remark: TAMIL }),
          dprWorksheet({ id: "ws-2", number: "WS/26-27/00002", remark: HINDI }),
        ],
        photos: [
          {
            key: "a",
            contentType: "image/webp",
            caption: "Worksheet WS/26-27/00001",
          },
          { key: "b", contentType: "image/webp", caption: "Site Diary" },
          {
            key: "missing",
            contentType: "image/jpeg",
            caption: "Equipment Usage EU/26-27/00001",
          },
          {
            key: "c",
            contentType: "image/webp",
            caption: "Worksheet WS/26-27/00002",
          },
        ],
      }),
    );
    const bytes = await createDprRenderer(loader)(document);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getTitle()).toBe("Daily Progress Report DPR/26-27/00001");
    const fonts = fontNames(pdf);
    expect(fonts).toContain("NotoSansTamil");
    expect(fonts).toContain("NotoSansDevanagari");
    const mapped = mappedCharacters(pdf);
    for (const line of [TAMIL, HINDI])
      for (const char of line.replace(/\s/g, ""))
        expect(mapped.has(char), `${char} in ${line}`).toBe(true);
    // A script the document does not use maps nothing.
    expect(mapped.has("ক")).toBe(false);
    expect(loads).toEqual([
      "logo:logo",
      "photo:a",
      "photo:b",
      "photo:missing",
      "photo:c",
    ]);
  });

  it("runs onto more pages with the header repeated and numbers them", async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      dprWorksheet({
        id: `ws-${String(index)}`,
        number: `WS/26-27/${String(index + 1).padStart(5, "0")}`,
        remark: index % 2 === 0 ? TAMIL : HINDI,
      }),
    );
    const bytes = await createDprRenderer(() => Promise.resolve(null))(
      buildDailyProgressReport(dprReadModel({ worksheets: many })),
    );
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
  });

  it("prints Generated by in every page's footer, in the requester's script", async () => {
    const document = buildDailyProgressReport(dprReadModel());
    const generated = "Generated by அருண் on 16 Oct 2026, 14:05";
    expect(
      dprTexts({ ...document, header: { ...document.header, generated } }),
    ).toContain(generated);
    const bytes = await createDprRenderer(() => Promise.resolve(null))({
      ...document,
      header: { ...document.header, generated },
    });
    const pdf = await PDFDocument.load(bytes);
    // Nothing else in the document is Tamil: the footer brought the font.
    expect(fontNames(pdf)).toContain("NotoSansTamil");
    const mapped = mappedCharacters(pdf);
    for (const char of "அருண்") expect(mapped.has(char), char).toBe(true);
  });
});
