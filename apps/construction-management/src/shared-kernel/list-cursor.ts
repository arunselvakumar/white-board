import { DomainError } from "./domain-error";
import { isUuid } from "./ids";

/** A list position: newest first by `createdAt`, then `id` (root ADR-0020). */
export type ListCursor = { createdAt: Date; id: string };

export function encodeListCursor(cursor: ListCursor): string {
  return Buffer.from(
    `${cursor.createdAt.toISOString()}|${cursor.id}`,
    "utf8",
  ).toString("base64url");
}

export function decodeListCursor(raw: string): ListCursor {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf("|");
  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (separator <= 0 || Number.isNaN(createdAt.getTime()) || !isUuid(id))
    throw new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
  return { createdAt, id };
}

/** A position in a list sorted by name, then `id`. */
export type NameCursor = { name: string; id: string };

export function encodeNameCursor(cursor: NameCursor): string {
  return Buffer.from(`${cursor.id}|${cursor.name}`, "utf8").toString(
    "base64url",
  );
}

export function decodeNameCursor(raw: string): NameCursor {
  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  const separator = decoded.indexOf("|");
  const id = decoded.slice(0, separator);
  if (separator <= 0 || !isUuid(id))
    throw new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
  return { id, name: decoded.slice(separator + 1) };
}
