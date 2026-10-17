import { z } from "zod";

import type { DeviceView } from "@/src/organization/application/device-handlers";

export const DEVICES_PATH = "/api/construction/organization/me/devices";

const ConstructionOrganizationDeviceModel = z.object({
  id: z.string().describe("The session id"),
  browser: z.string().describe('e.g. "Chrome", or "Unknown browser"'),
  os: z.string().describe('e.g. "Android", or "Unknown system"'),
  kind: z.enum(["phone", "tablet", "desktop"]),
  signedInAt: z.iso.datetime(),
  lastActiveAt: z.iso
    .datetime()
    .describe("Refreshed at most once a day while the device is used"),
  isCurrent: z.boolean().describe("The device making this request"),
  pushOn: z.boolean().describe("Web push notifications are on for it"),
});

/** My Profile → Devices: the User's signed-in sessions (CM-907). */
export const ListConstructionOrganizationDevicesResponseModel = z.object({
  items: z.array(ConstructionOrganizationDeviceModel),
});

export type ListConstructionOrganizationDevicesResponseModel = z.infer<
  typeof ListConstructionOrganizationDevicesResponseModel
>;

export const ConstructionOrganizationDeviceParamsModel = z.object({
  id: z.string().min(1).max(200),
});

export const SignOutConstructionOrganizationOtherDevicesResponseModel =
  z.object({ signedOut: z.number().int().min(0) });

export type SignOutConstructionOrganizationOtherDevicesResponseModel = z.infer<
  typeof SignOutConstructionOrganizationOtherDevicesResponseModel
>;

export function toDevicesResponse(
  items: readonly DeviceView[],
): ListConstructionOrganizationDevicesResponseModel {
  return {
    items: items.map((item) => ({
      id: item.id,
      browser: item.browser,
      os: item.os,
      kind: item.kind,
      signedInAt: item.signedInAt.toISOString(),
      lastActiveAt: item.lastActiveAt.toISOString(),
      isCurrent: item.isCurrent,
      pushOn: item.pushOn,
    })),
  };
}
