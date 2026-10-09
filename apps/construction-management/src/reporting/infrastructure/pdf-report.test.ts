import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  column,
  totalsOf,
  type Cell,
  type ReportDocument,
} from "../domain/report-document";
import {
  embedFace,
  fontBytes,
  registerReportFonts,
  reportFontkit,
} from "./pdf-fonts";
import { inspectPdf } from "./pdf-inspect";
import { renderPdf, UNPRINTABLE_NOTE } from "./pdf-report";

/** A muster roll shaped document with these Labour names. */
function musterRoll(names: string[], extraRows = 0): ReportDocument {
  const columns = [
    column("Sl. No.", "count", 4),
    column("Name", "text", 18),
    column("Father's name", "text", 16),
    ...Array.from({ length: 31 }, (_, index) =>
      column(String(index + 1), "text", 3),
    ),
    column("Gross", "money"),
  ];
  const rows: Cell[][] = [
    ...names,
    ...Array<string>(extraRows).fill("Asha Kale"),
  ].map((name, index) => [
    index + 1,
    name,
    "Shankar Pawar",
    ...Array<string>(31).fill("P"),
    120_000,
  ]);
  return {
    header: {
      company: "Patil Builders",
      title: "Muster roll and wage register",
      project: "Tower A",
      address: "Survey 12, Hinjewadi, Pune",
      period: "August 2026",
      generatedAt: "09 Oct 2026, 4:00 pm IST",
      currency: "INR",
    },
    notes: ["Wage rates in ₹ per day, from the last marked day."],
    tables: [
      {
        name: "Muster roll",
        columns,
        rows,
        totals: totalsOf(columns, rows, { 1: "Total" }),
      },
    ],
    pageSize: "a3",
    fileName: "muster-roll-and-wage-register-2026-08",
  };
}

describe("report PDF fonts", () => {
  it("prints Latin, Devanagari and Tamil names and ₹ in Noto, without the footer note", async () => {
    const bytes = await renderPdf(
      musterRoll(["Raju Pawar", "राजू पवार", "श्रीकांत क्षीरसागर", "முருகன்"]),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await inspectPdf(bytes);
    expect(pdf.fonts).toEqual([
      "NotoSans-Bold",
      "NotoSans-Regular",
      "NotoSansDevanagari-Regular",
      "NotoSansTamil-Regular",
    ]);
    const text = pdf.pages.flat();
    expect(text).toContain("Raju Pawar");
    expect(text).toContain("राजू पवार");
    expect(text).toContain("முருகன்");
    expect(text.some((line) => line.includes("₹"))).toBe(true);
    expect(text.some((line) => line.includes("?"))).toBe(false);
    expect(text).not.toContain(UNPRINTABLE_NOTE);
  });

  it("prints a script it has no font for as ? and says so on every page", async () => {
    const bytes = await renderPdf(
      musterRoll(["Raju Pawar", "राजू पवार", "முருகன்", "አበበ በቀለ"], 80),
    );
    const pdf = await inspectPdf(bytes);
    expect(pdf.pages.length).toBeGreaterThan(1);
    for (const page of pdf.pages) expect(page).toContain(UNPRINTABLE_NOTE);
    const text = pdf.pages.flat();
    expect(text).toContain("???");
    expect(pdf.fonts.some((font) => font.includes("Ethiopic"))).toBe(false);
  });

  it("keeps a subset Telugu font's glyphs intact (odd-length glyphs)", async () => {
    const font = reportFontkit.create(await fontBytes("telugu", "regular"));
    const run = font.layout("శ్రీనివాస్", {
      mark: false,
      abvm: false,
      blwm: false,
    });
    const subset = font.createSubset();
    const ids = run.glyphs.map((glyph) => subset.includeGlyph(glyph));
    const chunks: Uint8Array[] = [];
    await new Promise<void>((resolve) => {
      const stream = subset.encodeStream();
      stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      stream.on("end", () => {
        resolve();
      });
    });
    const encoded = new Uint8Array(
      chunks.reduce((sum, c) => sum + c.length, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      encoded.set(chunk, offset);
      offset += chunk.length;
    }
    const parsed = reportFontkit.create(encoded);
    run.glyphs.forEach((glyph, index) => {
      expect(parsed.getGlyph(ids[index] ?? 0).path.toSVG()).toBe(
        glyph.path.toSVG(),
      );
    });
  });

  it.each([
    ["latin", "Raju Pawar"],
    ["latin-ext", "₹"],
    ["devanagari", "क्षितिज श्रीकांत"],
    ["bengali", "সৌমিত্র"],
    ["gurmukhi", "ਗੁਰਪ੍ਰੀਤ"],
    ["gujarati", "કૃષ્ણ"],
    ["oriya", "ପ୍ରଦୀପ"],
    ["tamil", "செல்வகுமார்"],
    ["telugu", "శ్రీనివాస్"],
    ["kannada", "ಶ್ರೀನಿವಾಸ"],
    ["malayalam", "കൃഷ്ണൻ"],
  ])(
    "embeds the %s face in both weights and draws with it",
    async (key, sample) => {
      const pdf = await PDFDocument.create();
      registerReportFonts(pdf);
      for (const weight of ["regular", "bold"] as const) {
        const font = await embedFace(pdf, key, weight);
        pdf.addPage().drawText(sample, { x: 20, y: 400, size: 20, font });
      }
      const lines = (await inspectPdf(await pdf.save())).pages.flat();
      // Glyphs read back in visual order (vowel signs split into their
      // parts); every character is there.
      const letters = (text: string) =>
        Array.from(text.normalize("NFD")).sort().join("");
      expect(lines.map(letters)).toEqual([letters(sample), letters(sample)]);
    },
  );
});
