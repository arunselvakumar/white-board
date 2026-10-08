/** Construction Management runs on :3002 in development (ADR CM-0001). */
export const CONSTRUCTION_LOCAL_ORIGIN = "http://localhost:3002";

/**
 * Its own cookie names, so a Whiteboard Session on another localhost port
 * never collides with a Construction Management one.
 */
export const CONSTRUCTION_COOKIE_PREFIX = "construction";
