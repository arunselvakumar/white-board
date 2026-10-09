import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";
import type { ObjectStorage } from "@/src/shared-kernel/files";

import type { CompanyProfile } from "../domain/company-profile";
import { CompanyImages } from "./company-images";
import { CompanyProfileHandlers } from "./company-profile-handlers";
import type { CompanyProfileStore } from "./company-profile-store";

const LOADED = new Date("2026-10-08T06:30:00Z");
const NOW = new Date("2026-10-08T07:00:00Z");
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function setup(options: { failSave?: boolean } = {}) {
  let profile: CompanyProfile = {
    id: "0199c3a0-0000-7000-8000-000000000001",
    workspaceId: "company-a",
    name: "Anugraha Engineers",
    mobile: null,
    email: null,
    country: "IN",
    gstin: null,
    pan: null,
    address: null,
    currency: "INR",
    isIndian: true,
    timezone: "Asia/Kolkata",
    logoKey: "companies/company-a/logo/old.png",
    createdAt: LOADED,
    updatedAt: LOADED,
  };
  const renamed: string[] = [];
  const objects = new Map<string, Uint8Array>([
    ["companies/company-a/logo/old.png", PNG],
  ]);
  const store: CompanyProfileStore = {
    findByWorkspace: (workspaceId) =>
      Promise.resolve(workspaceId === "company-a" ? profile : null),
    save: (next) => {
      if (options.failSave === true)
        return Promise.reject(new Error("database down"));
      profile = next;
      return Promise.resolve();
    },
  };
  const storage: ObjectStorage = {
    put: (key, bytes) => {
      objects.set(key, bytes);
      return Promise.resolve();
    },
    get: () => Promise.resolve(null),
    head: () => Promise.resolve(null),
    delete: (key) => {
      objects.delete(key);
      return Promise.resolve();
    },
  };
  const handlers = new CompanyProfileHandlers(
    store,
    {
      renameWorkspace: (_, name) => {
        renamed.push(name);
        return Promise.resolve();
      },
    },
    new CompanyImages(storage),
    () => NOW,
  );
  return { handlers, renamed, objects, current: () => profile };
}

const changes = {
  name: "Anugraha Engineers",
  currency: "INR",
  timezone: "Asia/Kolkata",
};

describe("CompanyProfileHandlers", () => {
  it("keeps the country it was created with", async () => {
    const { handlers } = setup();
    const updated = await handlers.update({
      workspaceId: "company-a",
      by: "user-1",
      changes: { ...changes, gstin: "33AAPFA0939F1ZM" },
    });
    expect(updated).toMatchObject({
      country: "IN",
      gstin: "33AAPFA0939F1ZM",
      updatedAt: NOW,
    });
  });

  it("keeps omitted fields and clears null ones", async () => {
    const { handlers } = setup();
    await handlers.update({
      workspaceId: "company-a",
      by: "u",
      changes: { ...changes, gstin: "33AAPFA0939F1ZM", address: "Nagercoil" },
    });
    const updated = await handlers.update({
      workspaceId: "company-a",
      by: "u",
      changes: { ...changes, address: null },
    });
    expect(updated).toMatchObject({ gstin: "33AAPFA0939F1ZM", address: null });
  });

  it("renames the Workspace only when the name changes", async () => {
    const { handlers, renamed } = setup();
    await handlers.update({ workspaceId: "company-a", by: "u", changes });
    expect(renamed).toEqual([]);
    await handlers.update({
      workspaceId: "company-a",
      by: "u",
      changes: { ...changes, name: "  Anugraha Infra " },
    });
    expect(renamed).toEqual(["Anugraha Infra"]);
  });

  it("refuses a save based on an older load", async () => {
    const { handlers } = setup();
    const error = await handlers
      .update({
        workspaceId: "company-a",
        by: "u",
        changes,
        expectedUpdatedAt: new Date("2026-10-08T06:00:00Z"),
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: "COMPANY_PROFILE_CHANGED",
      kind: "conflict",
    });
  });

  it("replaces the logo and deletes the old object", async () => {
    const { handlers, objects, current } = setup();
    await handlers.setLogo({
      workspaceId: "company-a",
      by: "u",
      bytes: PNG,
      contentType: "image/png",
    });
    expect(current().logoKey).toMatch(/^companies\/company-a\/logo\/.+\.png$/);
    expect([...objects.keys()]).toEqual([current().logoKey]);
  });

  it("deletes the uploaded object when the database write fails", async () => {
    const { handlers, objects } = setup({ failSave: true });
    await expect(
      handlers.setLogo({
        workspaceId: "company-a",
        by: "u",
        bytes: PNG,
        contentType: "image/png",
      }),
    ).rejects.toThrow("database down");
    expect([...objects.keys()]).toEqual(["companies/company-a/logo/old.png"]);
  });
});
