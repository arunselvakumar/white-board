const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes that start like a PNG; the app sniffs only the signature. */
export function pngBytes(size = 64): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  bytes.set(PNG_SIGNATURE);
  for (let index = PNG_SIGNATURE.length; index < size; index += 1)
    bytes[index] = index % 251;
  return bytes;
}

export function gifBytes(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode("GIF89a-not-allowed");
}

export async function bytesOf(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer());
}
