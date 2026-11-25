import { describe, expect, it } from "vitest";

import { indianMobileNumber, whatsappReminderUrl } from "./fee-reminder";

describe("indianMobileNumber", () => {
  it("drops spaces, dashes, +91 and a leading 0", () => {
    expect(indianMobileNumber("98765 43210")).toBe("9876543210");
    expect(indianMobileNumber("+91-98765-43210")).toBe("9876543210");
    expect(indianMobileNumber("09876543210")).toBe("9876543210");
  });

  it("refuses landlines and short numbers", () => {
    expect(indianMobileNumber("044 2345 6789")).toBeNull();
    expect(indianMobileNumber("98765")).toBeNull();
  });
});

describe("whatsappReminderUrl", () => {
  it("opens a chat with the parent and a polite reminder", () => {
    const url = whatsappReminderUrl({
      phone: "+91 98765 43210",
      childName: "Aarav",
      dueText: "₹12,500",
      centreName: "Little Steps",
    });
    expect(url).not.toBeNull();
    const parsed = new URL(url ?? "");
    expect(parsed.origin + parsed.pathname).toBe("https://wa.me/919876543210");
    expect(parsed.searchParams.get("text")).toBe(
      "Dear Parent, this is a gentle reminder from Little Steps that ₹12,500 is due towards Aarav's fees. Kindly pay at your earliest convenience. Thank you.",
    );
  });

  it("gives nothing for a number WhatsApp cannot reach", () => {
    expect(
      whatsappReminderUrl({
        phone: "12345",
        childName: "Aarav",
        dueText: "₹1",
        centreName: "Little Steps",
      }),
    ).toBeNull();
  });
});
