import { describe, expect, it } from "vitest";

import type { NotificationRecipientsQuery } from "@/src/shared-kernel/access/notification-recipients";

import type { NotificationDraft } from "../domain/notification";
import { NOTIFICATION_KINDS } from "../domain/notification-kinds";
import type { InboundMeasurementSubmitted } from "./inbound-events";
import { NotificationListeners } from "./listeners";
import type { Notifier } from "./notifier";
import type { NotificationNames, RecipientDirectory } from "./ports";

const WS = "ws-1";
const AT = new Date("2026-10-22T05:00:00.000Z");
const PROJECT = "11111111-1111-4111-8111-111111111111";

function setup() {
  const sent: { recipients: string[]; draft: NotificationDraft }[] = [];
  const queries: NotificationRecipientsQuery[] = [];
  const recipients: RecipientDirectory = {
    holders(query) {
      queries.push(query);
      return Promise.resolve(
        ["checker", "engineer"].filter((id) => id !== query.exceptUserId),
      );
    },
    usersOfMembers: () => Promise.resolve([]),
  };
  const names = {
    project: () => Promise.resolve("Metro Depot"),
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

const event: InboundMeasurementSubmitted = {
  type: "MeasurementSubmitted",
  workspaceId: WS,
  occurredAt: AT,
  sheetId: "sheet-1",
  projectId: PROJECT,
  side: "contractor",
  measuredOn: "2026-10-20",
  title: "Footings F1–F4",
  workOrderNumber: "WO/26-27/00001",
  partyName: "Velan Constructions",
  rowCount: 3,
  by: "engineer",
};

describe("Measurement Book notifications (CM-1105, CM-0023 §6)", () => {
  it("asks Measurement Book Approve + Notification holders on the Project to check a submitted sheet", async () => {
    const { listeners, sent, queries } = setup();
    await listeners.handle(event);
    expect(queries[0]).toMatchObject({
      menu: "contracts.measurements",
      flag: "approve",
      projectId: PROJECT,
      exceptUserId: "engineer",
    });
    expect(sent).toEqual([
      {
        recipients: ["checker"],
        draft: {
          type: "measurement.submitted",
          title: "Measurement sheet of 20/10/2026 is ready to check",
          body: "Contractor (WO/26-27/00001) side with Velan Constructions in Metro Depot: Footings F1–F4, 3 rows.",
          menu: "contracts.measurements",
          projectId: PROJECT,
          href: `/app/projects/${PROJECT}/measurements/sheet-1`,
          sourceKey: `measurement.submitted:sheet-1:${AT.toISOString()}`,
        },
      },
    ]);
  });

  it("words a client-side sheet without a title", async () => {
    const { listeners, sent } = setup();
    await listeners.handle({
      ...event,
      side: "client",
      workOrderNumber: null,
      partyName: null,
      title: null,
      rowCount: 1,
    });
    expect(sent[0]?.draft.body).toBe("Client side in Metro Depot: 1 row.");
  });

  it("is gated by the Measurement Book's Approve flag", () => {
    expect(NOTIFICATION_KINDS["measurement.submitted"]).toEqual({
      menu: "contracts.measurements",
      flag: "approve",
    });
  });
});
