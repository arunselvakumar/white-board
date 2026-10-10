import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  DEFAULT_HRMS_SETTINGS,
  type HrmsSettingsInput,
} from "../domain/hrms-settings";
import { accessFor, FakeHrmsSettingsStore } from "./hrms-fakes";
import { HrmsSettingsHandlers } from "./hrms-settings-handlers";

const NOW = new Date("2026-10-10T05:00:00.000Z");
const LATER = new Date("2026-10-10T06:00:00.000Z");

const SIX_DAYS: HrmsSettingsInput = {
  ...DEFAULT_HRMS_SETTINGS,
  workingDays: [1, 2, 3, 4, 5, 6],
  gpsRequirement: "record_only",
};

function setup() {
  const store = new FakeHrmsSettingsStore();
  let now = NOW;
  const handlers = new HrmsSettingsHandlers(store, () => now);
  return {
    store,
    handlers,
    later: () => {
      now = LATER;
    },
  };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

describe("HrmsSettingsHandlers (CM-303)", () => {
  it("answers the defaults, unsaved, until the first save", async () => {
    const { handlers } = setup();
    expect(await handlers.getHrmsSettings({ access: accessFor() })).toEqual({
      settings: DEFAULT_HRMS_SETTINGS,
      updatedAt: null,
    });
  });

  it("saves, audits before and after, and returns the new version", async () => {
    const { handlers, store } = setup();
    const saved = await handlers.updateHrmsSettings({
      access: accessFor(),
      settings: SIX_DAYS,
      expectedUpdatedAt: null,
    });
    expect(saved.updatedAt).toEqual(NOW);
    expect(saved.settings.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await handlers.getHrmsSettings({ access: accessFor() })).toEqual(
      saved,
    );
    expect(store.audits).toEqual([
      {
        workspaceId: "company-1",
        before: DEFAULT_HRMS_SETTINGS,
        after: saved.settings,
        by: "user-1",
      },
    ]);
  });

  it("refuses a save made from a stale read with HRMS_SETTINGS_CHANGED", async () => {
    const { handlers, later } = setup();
    await handlers.updateHrmsSettings({
      access: accessFor(),
      settings: SIX_DAYS,
      expectedUpdatedAt: null,
    });
    later();
    expect(
      await codeOf(
        handlers.updateHrmsSettings({
          access: accessFor(),
          settings: DEFAULT_HRMS_SETTINGS,
          expectedUpdatedAt: null,
        }),
      ),
    ).toBe("HRMS_SETTINGS_CHANGED");
    const next = await handlers.updateHrmsSettings({
      access: accessFor(),
      settings: DEFAULT_HRMS_SETTINGS,
      expectedUpdatedAt: NOW,
    });
    expect(next.updatedAt).toEqual(LATER);
  });

  it("validates before saving", async () => {
    const { handlers, store } = setup();
    expect(
      await codeOf(
        handlers.updateHrmsSettings({
          access: accessFor(),
          settings: { ...SIX_DAYS, halfDayHours: 8 },
          expectedUpdatedAt: null,
        }),
      ),
    ).toBe("HALF_DAY_HOURS_INVALID");
    expect(store.rows.size).toBe(0);
  });

  it("needs hrms.settings read to see and update to save", async () => {
    const { handlers } = setup();
    const nobody = accessFor({ "hrms.attendance": ["read"] });
    const reader = accessFor({ "hrms.settings": ["read"] });
    const editor = accessFor({ "hrms.settings": ["read", "update"] });
    expect(await codeOf(handlers.getHrmsSettings({ access: nobody }))).toBe(
      "PERMISSION_DENIED",
    );
    await expect(
      handlers.getHrmsSettings({ access: reader }),
    ).resolves.toBeDefined();
    expect(
      await codeOf(
        handlers.updateHrmsSettings({
          access: reader,
          settings: SIX_DAYS,
          expectedUpdatedAt: null,
        }),
      ),
    ).toBe("PERMISSION_DENIED");
    await expect(
      handlers.updateHrmsSettings({
        access: editor,
        settings: SIX_DAYS,
        expectedUpdatedAt: null,
      }),
    ).resolves.toMatchObject({ updatedAt: NOW });
  });
});
