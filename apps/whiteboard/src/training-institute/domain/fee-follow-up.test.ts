import { describe, expect, it } from "vitest";

import { DomainError } from "./errors";
import {
  FeeFollowUp,
  type FeeFollowUpAction,
  type FeeFollowUpDetails,
} from "./fee-follow-up";

const NOW = new Date("2026-10-09T04:00:00.000Z");
const ACTION: FeeFollowUpAction = {
  userId: "user_owner",
  now: NOW,
  today: "2026-10-09",
};

function logged(
  details: FeeFollowUpDetails = { channel: "phone" },
): FeeFollowUp {
  return FeeFollowUp.log(
    {
      id: "8f6f2a52-8a36-4b39-9a4e-2a0f8b0d5a10",
      workspaceId: "ws_1",
      enrollmentId: "1b5a3f52-2c43-4a8a-8a64-0c9b1e2f3a40",
      details,
    },
    ACTION,
  );
}

function code(work: () => unknown): string | undefined {
  try {
    work();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

describe("FeeFollowUp", () => {
  it("logs a channel, trimmed note, and next follow-up date", () => {
    const followUp = logged({
      channel: "phone",
      note: "  Called parent, will pay Saturday ",
      nextFollowUpOn: "2026-10-10",
    });
    const props = followUp.toProps();
    expect(props.channel).toBe("phone");
    expect(props.note).toBe("Called parent, will pay Saturday");
    expect(props.nextFollowUpOn).toBe("2026-10-10");
    expect(props.loggedByUserId).toBe("user_owner");
    expect(followUp.open).toBe(true);
  });

  it("can't be saved without a channel", () => {
    expect(code(() => logged({ channel: "" }))).toBe(
      "FEE_FOLLOW_UP_CHANNEL_REQUIRED",
    );
    expect(code(() => logged({ channel: "email" }))).toBe(
      "FEE_FOLLOW_UP_CHANNEL_REQUIRED",
    );
  });

  it("stores a blank note as none and refuses a long one", () => {
    expect(logged({ channel: "other", note: "   " }).toProps().note).toBeNull();
    expect(
      code(() => logged({ channel: "other", note: "x".repeat(501) })),
    ).toBe("FEE_FOLLOW_UP_NOTE_INVALID");
  });

  it("refuses a next follow-up date before today", () => {
    expect(
      code(() => logged({ channel: "phone", nextFollowUpOn: "2026-10-08" })),
    ).toBe("FEE_FOLLOW_UP_DATE_IN_PAST");
    expect(
      code(() => logged({ channel: "phone", nextFollowUpOn: "2026-02-30" })),
    ).toBe("FEE_FOLLOW_UP_DATE_INVALID");
  });

  it("records who edited the open follow-up", () => {
    const followUp = logged();
    const later = new Date("2026-10-09T06:00:00.000Z");
    followUp.edit(
      { channel: "whatsapp_sms", note: "Sent reminder", nextFollowUpOn: null },
      { ...ACTION, userId: "user_other_owner", now: later },
    );
    const props = followUp.toProps();
    expect(props.channel).toBe("whatsapp_sms");
    expect(props.editedByUserId).toBe("user_other_owner");
    expect(props.editedAt).toEqual(later);
  });

  it("closes as done or superseded, then can't change", () => {
    const done = logged();
    done.markDone(ACTION);
    expect(done.open).toBe(false);
    expect(done.toProps().closeReason).toBe("done");
    expect(code(() => { done.edit({ channel: "phone" }, ACTION); })).toBe(
      "FEE_FOLLOW_UP_CLOSED",
    );
    expect(code(() => { done.markDone(ACTION); })).toBe("FEE_FOLLOW_UP_CLOSED");

    const older = logged();
    older.supersede(ACTION);
    expect(older.toProps().closeReason).toBe("superseded");
  });
});
