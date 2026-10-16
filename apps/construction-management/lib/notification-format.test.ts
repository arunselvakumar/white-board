import { describe, expect, it } from "vitest";

import {
  base64UrlToBytes,
  bellLabel,
  timeAgo,
  unreadBadge,
} from "./notification-format";

describe("unreadBadge", () => {
  it("shows the count up to 99, then 99+", () => {
    expect(unreadBadge(1)).toBe("1");
    expect(unreadBadge(99)).toBe("99");
    expect(unreadBadge(100)).toBe("99+");
    expect(unreadBadge(2500)).toBe("99+");
  });
});

describe("bellLabel", () => {
  it("names the unread count when there is one", () => {
    expect(bellLabel(0)).toBe("Notifications");
    expect(bellLabel(3)).toBe("Notifications, 3 unread");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-16T12:00:00.000Z");

  it("counts minutes, hours and days", () => {
    expect(timeAgo("2026-10-16T11:59:30.000Z", now)).toBe("Just now");
    expect(timeAgo("2026-10-16T11:55:00.000Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-10-16T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-10-16T07:00:00.000Z", now)).toBe("5 hours ago");
    expect(timeAgo("2026-10-15T10:00:00.000Z", now)).toBe("Yesterday");
    expect(timeAgo("2026-10-13T12:00:00.000Z", now)).toBe("3 days ago");
  });

  it("shows the date after a week, with the year when it differs", () => {
    expect(timeAgo("2026-10-02T12:00:00.000Z", now)).toBe("2 Oct");
    expect(timeAgo("2025-12-20T12:00:00.000Z", now)).toBe("20 Dec 2025");
  });
});

describe("base64UrlToBytes", () => {
  it("decodes base64url without padding", () => {
    // "hello?" is aGVsbG8_ in base64url (no padding, _ for /).
    expect(Array.from(base64UrlToBytes("aGVsbG8_"))).toEqual([
      104, 101, 108, 108, 111, 63,
    ]);
    expect(Array.from(base64UrlToBytes("AQ"))).toEqual([1]);
  });
});
