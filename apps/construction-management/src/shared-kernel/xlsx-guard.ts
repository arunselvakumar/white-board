/**
 * How much an uploaded .xlsx (a ZIP) unpacks to, read from its central
 * directory before any parser inflates it. A small upload can expand to
 * gigabytes (a "zip bomb", CWE-409), so imports refuse a workbook whose
 * entries add up to more than they could ever need.
 */

/** Room for a 2,000-row import sheet many times over. */
export const XLSX_MAX_UNPACKED_BYTES = 40 * 1024 * 1024;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

/**
 * The total uncompressed size of the ZIP's entries, or null when the
 * central directory cannot be trusted: unreadable, ZIP64 (which an import
 * sheet never needs), or its entry count disagrees with the entries it
 * holds. The directory is walked to its own end by signature, so a
 * doctored count cannot hide entries a reader would still inflate.
 */
export function zipUnpackedBytes(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.byteLength - EOCD_MIN - MAX_COMMENT);
  let eocd = -1;
  for (let at = bytes.byteLength - EOCD_MIN; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) return null;
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const start = view.getUint32(eocd + 16, true);
  const end = start + directorySize;
  if (entriesOnDisk !== entries || end > eocd) return null;
  let at = start;
  let found = 0;
  let total = 0;
  while (at < end) {
    if (at + 46 > end || view.getUint32(at, true) !== CENTRAL) return null;
    const size = view.getUint32(at + 24, true);
    if (size === 0xffffffff) return null;
    total += size;
    found += 1;
    at +=
      46 +
      view.getUint16(at + 28, true) +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true);
  }
  if (at !== end || found !== entries) return null;
  return total;
}

/** Whether the workbook unpacks to at most `max` bytes (false when unreadable). */
export function xlsxUnpacksWithin(
  bytes: Uint8Array,
  max = XLSX_MAX_UNPACKED_BYTES,
): boolean {
  const total = zipUnpackedBytes(bytes);
  return total != null && total <= max;
}
