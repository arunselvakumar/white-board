import { afterEach, describe, expect, it, vi } from "vitest";

import { withTimeout } from "./absence-notice-mailer";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the result of work that settles in time", async () => {
    await expect(
      withTimeout(Promise.resolve("sent"), 50, "Email"),
    ).resolves.toBe("sent");
  });

  it("gives up on work that hangs", async () => {
    vi.useFakeTimers();
    // Never settles, like an email provider that stops answering.
    const hanging = new Promise<never>(() => undefined);
    const result = withTimeout(hanging, 8_000, "Absence Notice email");
    vi.advanceTimersByTime(8_000);
    await expect(result).rejects.toThrow(
      "Absence Notice email: no answer after 8000 ms; delivery unknown, it may still arrive.",
    );
  });

  it("passes on a failure from the work itself", async () => {
    await expect(
      withTimeout(Promise.reject(new Error("bounced")), 50, "Email"),
    ).rejects.toThrow("bounced");
  });
});
