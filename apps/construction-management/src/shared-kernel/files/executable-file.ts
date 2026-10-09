/**
 * Magic numbers of programs a computer runs directly: Windows `MZ` (`.exe`,
 * `.dll`, `.scr`, …), Linux ELF and macOS Mach-O, thin (32- and 64-bit,
 * either byte order) or fat/universal. `CAFEBABE` is also a Java class
 * file, which is a program too.
 */
const PROGRAM_SIGNATURES: readonly (readonly number[])[] = [
  [0x4d, 0x5a],
  [0x7f, 0x45, 0x4c, 0x46],
  [0xfe, 0xed, 0xfa, 0xce],
  [0xfe, 0xed, 0xfa, 0xcf],
  [0xce, 0xfa, 0xed, 0xfe],
  [0xcf, 0xfa, 0xed, 0xfe],
  [0xca, 0xfe, 0xba, 0xbe],
  [0xbe, 0xba, 0xfe, 0xca],
  [0xca, 0xfe, 0xba, 0xbf],
  [0xbf, 0xba, 0xfe, 0xca],
];

/** Bytes this many long are enough for `isProgram`. */
export const PROGRAM_SNIFF_BYTES = 4;

/** Whether the file's first bytes are those of a program, whatever its name. */
export function isProgram(bytes: Uint8Array): boolean {
  return PROGRAM_SIGNATURES.some(
    (signature) =>
      bytes.byteLength >= signature.length &&
      signature.every((value, index) => bytes[index] === value),
  );
}
