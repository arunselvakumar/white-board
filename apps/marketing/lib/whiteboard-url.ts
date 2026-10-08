/**
 * Whiteboard, the app, lives on its own host (ADR-0035): app.white-board.io
 * in production, localhost:3001 in development. Override with
 * NEXT_PUBLIC_WHITEBOARD_URL, for example on a preview deployment.
 */
const WHITEBOARD_ORIGIN =
  process.env["NEXT_PUBLIC_WHITEBOARD_URL"] ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : "https://app.white-board.io");

export const WHITEBOARD_SIGN_IN_URL = `${WHITEBOARD_ORIGIN}/login`;
export const WHITEBOARD_SIGN_UP_URL = `${WHITEBOARD_ORIGIN}/signup`;
