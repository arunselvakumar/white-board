import type { ListCursor } from "../domain/list";
import { InvalidCursorError } from "./invalid-cursor-error";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeListCursor(cursor: {
  createdAt: Date;
  id: { value: string };
}): string {
  const payload = `${cursor.createdAt.toISOString()}|${cursor.id.value}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeListCursor<TId>(
  raw: string,
  parseId: (id: string) => TId,
): ListCursor<TId> {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError();
  }

  const separator = decoded.lastIndexOf("|");
  if (separator <= 0 || separator === decoded.length - 1) {
    throw new InvalidCursorError();
  }

  const createdAtRaw = decoded.slice(0, separator);
  const idRaw = decoded.slice(separator + 1);
  const createdAt = new Date(createdAtRaw);

  if (Number.isNaN(createdAt.getTime()) || !UUID_RE.test(idRaw)) {
    throw new InvalidCursorError();
  }

  return {
    createdAt,
    id: parseId(idRaw),
  };
}
