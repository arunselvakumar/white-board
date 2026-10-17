import { describe, expect, it } from "vitest";

import type { NotificationRecipientsQuery } from "@/src/shared-kernel/access/notification-recipients";

import type { NotificationDraft } from "../domain/notification";
import type { InboundBookingEvent } from "./inbound-events";
import { NotificationListeners } from "./listeners";
import type { Notifier } from "./notifier";
import type { NotificationNames, RecipientDirectory } from "./ports";

const WS = "ws-1";
const AT = new Date("2026-10-17T05:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

function setup() {
  const sent: { recipients: string[]; draft: NotificationDraft }[] = [];
  const queries: NotificationRecipientsQuery[] = [];
  const recipients: RecipientDirectory = {
    holders(query) {
      queries.push(query);
      return Promise.resolve(
        ["holder-1", "seller"].filter((id) => id !== query.exceptUserId),
      );
    },
    usersOfMembers: () => Promise.resolve([]),
  };
  const names = {
    project: () => Promise.resolve("Green Acres"),
  } as Partial<NotificationNames> as NotificationNames;
  const notifier = {
    notify(_workspaceId: string, to: readonly string[], draft) {
      sent.push({ recipients: [...to], draft });
      return Promise.resolve([]);
    },
  } as Pick<Notifier, "notify"> as Notifier;
  return {
    listeners: new NotificationListeners({ notifier, recipients, names }),
    sent,
    queries,
  };
}

const base = {
  workspaceId: WS,
  occurredAt: AT,
  bookingId: "booking-1",
  projectId: PROJECT,
  unitLabel: "Tower A · 101",
  customerName: "Meena Raghavan",
  by: "seller",
};

describe("booking notifications (CM-1006, CM-0022 §10)", () => {
  it("tells Booking Read + Notification holders on the Project, never the seller", async () => {
    const { listeners, sent, queries } = setup();
    const events: InboundBookingEvent[] = [
      { ...base, type: "BookingCreated", status: "on_hold" },
      { ...base, type: "BookingConfirmed" },
      { ...base, type: "BookingCancelled", reason: "Loan refused" },
    ];
    for (const event of events) await listeners.handle(event);
    expect(queries[0]).toMatchObject({
      menu: "sales.bookings",
      flag: "read",
      projectId: PROJECT,
      exceptUserId: "seller",
    });
    expect(sent.map((item) => item.recipients)).toEqual([
      ["holder-1"],
      ["holder-1"],
      ["holder-1"],
    ]);
    expect(sent.map((item) => [item.draft.type, item.draft.title])).toEqual([
      ["booking.created", "Tower A · 101 is on hold"],
      ["booking.confirmed", "Tower A · 101's hold is confirmed"],
      ["booking.cancelled", "Tower A · 101's booking is cancelled"],
    ]);
    expect(sent[0]?.draft).toMatchObject({
      menu: "sales.bookings",
      body: "For Meena Raghavan in Green Acres.",
      href: `/app/projects/${PROJECT}/bookings/list/booking-1`,
      sourceKey: `booking.created:booking-1:${AT.toISOString()}`,
    });
    expect(sent[2]?.draft.body).toBe("Meena Raghavan: Loan refused");
  });
});
