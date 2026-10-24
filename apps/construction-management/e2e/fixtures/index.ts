import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Small test files: a square logo, a site photo and a one-page drawing PDF. */
export const FIXTURES = {
  logo: path.join(dirname, "logo.png"),
  sitePhoto: path.join(dirname, "site-photo.jpg"),
  drawingPdf: path.join(dirname, "drawing.pdf"),
};

/** A Windows program, made in memory, for checks that refuse programs. */
export const PROGRAM_FILE = {
  name: "setup.exe",
  mimeType: "application/x-msdownload",
  buffer: Buffer.concat([Buffer.from("MZ"), Buffer.alloc(510)]),
};
