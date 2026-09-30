import { z } from "zod";

export const JoinUrlModel = z.string().trim().max(2048).refine((value) => {
  if (value.length === 0) return true;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}, "Join URL must be an HTTPS link.");
