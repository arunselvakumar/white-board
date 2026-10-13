// A Report as an Excel workbook (.xlsx, Office Open XML), written without a
// library: a stored (uncompressed) zip of a few XML parts. One worksheet per
// page; each holds the report header, then every section in order, with the
// same text the screen shows. Counts and amounts are real numbers.

import type {
  ReportCell,
  ReportDocument,
  ReportSection,
} from "../application/report-document";

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip archive of the files as given, stored without compression. */
export function storedZip(
  files: readonly { name: string; data: Uint8Array }[],
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, file.data.length, true);
    local.setUint32(22, file.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, file.data);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, 0, true);
    entry.setUint16(14, 0x21, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, file.data.length, true);
    entry.setUint32(24, file.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + file.data.length;
  }
  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const result = new Uint8Array(
    all.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let at = 0;
  for (const chunk of all) {
    result.set(chunk, at);
    at += chunk.length;
  }
  return result;
}

/** Characters XML 1.0 can't hold: C0 controls other than tab, LF and CR. */
function xmlSafe(text: string): string {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d)
      result += text.charAt(index);
  }
  return result;
}

function xml(text: string): string {
  return xmlSafe(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number): string {
  let name = "";
  let value = index + 1;
  while (value > 0) {
    const rest = (value - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

/** Style ids in styles.xml. */
const STYLE = {
  plain: 0,
  bold: 1,
  money: 2,
  moneyPaise: 3,
  title: 4,
  boldMoney: 5,
} as const;

type SheetCell = { text: string; number?: number | null; style?: number };

function sheetCell(cell: ReportCell | undefined, bold = false): SheetCell {
  if (cell == null) return { text: "" };
  // Percentages stay text: "83%" reads better than 83.
  const numeric =
    cell.value != null &&
    Number.isFinite(cell.value) &&
    !cell.text.endsWith("%");
  if (!numeric)
    return { text: cell.text, style: bold ? STYLE.bold : STYLE.plain };
  const money = cell.text.includes("₹");
  return {
    text: cell.text,
    number: cell.value,
    style: money
      ? bold
        ? STYLE.boldMoney
        : Number.isInteger(cell.value)
          ? STYLE.money
          : STYLE.moneyPaise
      : bold
        ? STYLE.bold
        : STYLE.plain,
  };
}

function sectionRows(section: ReportSection): SheetCell[][] {
  const rows: SheetCell[][] = [[{ text: section.title, style: STYLE.title }]];
  if (section.kind === "metrics") {
    for (const item of section.items)
      rows.push([
        { text: item.label },
        { text: item.value, style: STYLE.bold },
        { text: item.detail ?? "" },
      ]);
  } else if (section.kind === "notes") {
    for (const line of section.lines) rows.push([{ text: line }]);
  } else {
    if (section.description != null) rows.push([{ text: section.description }]);
    rows.push(
      section.columns.map((column) => ({
        text:
          column.detail == null
            ? column.label
            : `${column.label} ${column.detail}`,
        style: STYLE.bold,
      })),
    );
    if (section.rows.length === 0) rows.push([{ text: section.emptyText }]);
    for (const item of section.rows)
      rows.push(
        section.columns.map((column) => sheetCell(item.cells[column.key])),
      );
    if (section.totals != null) {
      const totals = section.totals;
      rows.push(
        section.columns.map((column) =>
          sheetCell(totals.cells[column.key], true),
        ),
      );
    }
  }
  rows.push([]);
  return rows;
}

function worksheet(rows: SheetCell[][]): string {
  const widths: number[] = [];
  for (const cells of rows)
    cells.forEach((cell, index) => {
      widths[index] = Math.min(
        60,
        Math.max(widths[index] ?? 8, cell.text.length + 2),
      );
    });
  const body = rows
    .map((cells, rowIndex) => {
      const ref = rowIndex + 1;
      const content = cells
        .map((cell, index) => {
          const at = `${columnName(index)}${String(ref)}`;
          const style =
            cell.style == null || cell.style === 0
              ? ""
              : ` s="${String(cell.style)}"`;
          if (cell.number != null)
            return `<c r="${at}"${style}><v>${String(cell.number)}</v></c>`;
          if (cell.text === "") return "";
          return `<c r="${at}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(cell.text)}</t></is></c>`;
        })
        .join("");
      return `<row r="${String(ref)}">${content}</row>`;
    })
    .join("");
  const cols = widths
    .map(
      (width, index) =>
        `<col min="${String(index + 1)}" max="${String(index + 1)}" width="${String(width)}" customWidth="1"/>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols === "" ? "" : `<cols>${cols}</cols>`}<sheetData>${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="[&gt;=10000000]&quot;₹&quot;##\\,##\\,##\\,##0;[&gt;=100000]&quot;₹&quot;##\\,##\\,##0;&quot;₹&quot;##,##0"/><numFmt numFmtId="165" formatCode="&quot;₹&quot;#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, " ")
      .trim()
      .slice(0, 28) || "Report";
  let candidate = base;
  for (let index = 2; used.has(candidate.toLowerCase()); index += 1)
    candidate = `${base.slice(0, 26)} ${String(index)}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

/** The workbook bytes for a Report. */
export function reportXlsx(document: ReportDocument): Uint8Array {
  const header: SheetCell[][] = [
    [{ text: document.instituteName, style: STYLE.title }],
    [
      {
        text: `${document.code} · ${document.title}${document.subject == null ? "" : ` · ${document.subject}`}`,
        style: STYLE.bold,
      },
    ],
    ...(document.period == null
      ? []
      : [[{ text: `Period: ${document.period.label}` }]]),
    ...document.filters.map((filter) => [
      { text: `${filter.label}: ${filter.value}` },
    ]),
    [{ text: document.generatedLabel }],
    [],
  ];
  const pages =
    document.pages.length === 0
      ? [
          {
            heading: null,
            rows: [[{ text: document.emptyText ?? "Nothing to show." }]],
          },
        ]
      : document.pages.map((page) => ({
          heading: page.heading,
          rows: page.sections.flatMap(sectionRows),
        }));
  const used = new Set<string>();
  const sheets = pages.map((page, index) => ({
    name: sheetName(
      page.heading ??
        (pages.length === 1 ? document.title : `Page ${String(index + 1)}`),
      used,
    ),
    xml: worksheet([
      ...header,
      ...(page.heading == null
        ? []
        : [[{ text: page.heading, style: STYLE.title }], []]),
      ...page.rows,
    ]),
  }));
  const files = [
    {
      name: "[Content_Types].xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${String(index + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("")}</Types>`,
    },
    {
      name: "_rels/.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${xml(sheet.name)}" sheetId="${String(index + 1)}" r:id="rId${String(index + 1)}"/>`,
        )
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${String(index + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(index + 1)}.xml"/>`,
        )
        .join(
          "",
        )}<Relationship Id="rId${String(sheets.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/styles.xml", text: STYLES },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${String(index + 1)}.xml`,
      text: sheet.xml,
    })),
  ];
  return storedZip(
    files.map((file) => ({ name: file.name, data: encoder.encode(file.text) })),
  );
}
