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
 * central directory cannot be read or uses ZIP64 (which an import sheet
 * never needs).
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
  const entries = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  let total = 0;
  for (let i = 0; i < entries; i += 1) {
    if (at + 46 > bytes.byteLength || view.getUint32(at, true) !== CENTRAL)
      return null;
    const size = view.getUint32(at + 24, true);
    if (size === 0xffffffff) return null;
    total += size;
    at +=
      46 +
      view.getUint16(at + 28, true) +
      view.getUint16(at + 30, true) +
      view.getUint16(at + 32, true);
  }
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
