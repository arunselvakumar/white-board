import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";
import { describe, expect, it } from "vitest";

import { POST as authPost } from "@/app/api/auth/[...all]/route";
import {
  addPushSubscription,
  CHROME_ON_ANDROID,
  pushSubscriptionCount,
  sessionIdOf,
  signInAgain,
} from "@/test/accounts";
import { jsonRequest } from "@/test/companies";
import { signInByEmail, TEST_ORIGIN } from "@/test/sessions";

import type { ListConstructionOrganizationDevicesResponseModel } from "./device-models";
import { POST as signOutOne } from "./[id]/sign-out/route";
import { GET as listDevices } from "./route";
import { POST as signOutOthers } from "./sign-out-others/route";

const BASE = `${TEST_ORIGIN}/api/construction/organization/me/devices`;

async function devices(
  cookie: string,
): Promise<ListConstructionOrganizationDevicesResponseModel["items"]> {
  const response = await listDevices(jsonRequest(BASE, cookie));
  expect(response.status).toBe(StatusCodes.OK);
  return (
    (await response.json()) as ListConstructionOrganizationDevicesResponseModel
  ).items;
}

function signOut(cookie: string, id: string) {
  return signOutOne(jsonRequest(`${BASE}/${id}/sign-out`, cookie, {}), {
    params: Promise.resolve({ id }),
  });
}

async function threeDevices() {
  const first = await signInByEmail();
  const phone = await signInAgain(first.email, CHROME_ON_ANDROID);
  const mac = await signInAgain(first.email);
  return {
    ...first,
    firstSessionId: await sessionIdOf(first.cookie),
    phone,
    mac,
  };
}

describe("My Profile → Devices (CM-907)", () => {
  it("lists the User's sessions with browser, system, this device and push", async () => {
    const user = await threeDevices();
    await addPushSubscription(user.userId, user.phone.sessionId);
    const other = await signInByEmail();

    const items = await devices(user.mac.cookie);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      id: user.mac.sessionId,
      isCurrent: true,
      browser: "Safari",
      os: "macOS",
      kind: "desktop",
      pushOn: false,
    });
    expect(
      items.find((item) => item.id === user.phone.sessionId),
    ).toMatchObject({
      browser: "Chrome",
      os: "Android",
      kind: "phone",
      isCurrent: false,
      pushOn: true,
    });
    expect(items.every((item) => item.signedInAt.length > 0)).toBe(true);
    // Another User's sessions never show.
    const otherId = await sessionIdOf(other.cookie);
    expect(items.some((item) => item.id === otherId)).toBe(false);
  });

  it("signs one other device out and deletes its push subscriptions", async () => {
    const user = await threeDevices();
    await addPushSubscription(user.userId, user.phone.sessionId);
    await addPushSubscription(user.userId, user.mac.sessionId);

    const response = await signOut(user.mac.cookie, user.phone.sessionId);
    expect(response.status).toBe(StatusCodes.NO_CONTENT);
    await expect(
      prisma.identitySession.count({ where: { id: user.phone.sessionId } }),
    ).resolves.toBe(0);
    await expect(
      pushSubscriptionCount({ sessionId: user.phone.sessionId }),
    ).resolves.toBe(0);
    await expect(
      pushSubscriptionCount({ sessionId: user.mac.sessionId }),
    ).resolves.toBe(1);
    // The signed-out device is signed out.
    expect(
      (await listDevices(jsonRequest(BASE, user.phone.cookie))).status,
    ).toBe(StatusCodes.UNAUTHORIZED);

    const again = await signOut(user.mac.cookie, user.phone.sessionId);
    expect(again.status).toBe(StatusCodes.NOT_FOUND);
    expect(await again.json()).toMatchObject({ code: "DEVICE_NOT_FOUND" });
    const self = await signOut(user.mac.cookie, user.mac.sessionId);
    expect(self.status).toBe(StatusCodes.CONFLICT);
    expect(await self.json()).toMatchObject({ code: "DEVICE_IS_THIS_ONE" });
  });

  it("never signs out another User's session", async () => {
    const user = await threeDevices();
    const stranger = await signInByEmail();
    const strangerSession = await sessionIdOf(stranger.cookie);
    const response = await signOut(user.cookie, strangerSession);
    expect(response.status).toBe(StatusCodes.NOT_FOUND);
    await expect(
      prisma.identitySession.count({ where: { id: strangerSession } }),
    ).resolves.toBe(1);
  });

  it("signs out of every other device", async () => {
    const user = await threeDevices();
    await addPushSubscription(user.userId, user.phone.sessionId);
    await addPushSubscription(user.userId, user.firstSessionId);
    await addPushSubscription(user.userId, user.mac.sessionId);

    const response = await signOutOthers(
      jsonRequest(`${BASE}/sign-out-others`, user.mac.cookie, {}),
    );
    expect(response.status).toBe(StatusCodes.OK);
    expect(await response.json()).toEqual({ signedOut: 2 });
    const items = await devices(user.mac.cookie);
    expect(items.map((item) => item.id)).toEqual([user.mac.sessionId]);
    await expect(pushSubscriptionCount({ userId: user.userId })).resolves.toBe(
      1,
    );
  });

  it("Sign out from the account menu deletes that session's push subscription", async () => {
    const user = await threeDevices();
    await addPushSubscription(user.userId, user.phone.sessionId);
    await addPushSubscription(user.userId, user.mac.sessionId);
    const response = await authPost(
      new Request(`${TEST_ORIGIN}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: TEST_ORIGIN,
          cookie: user.phone.cookie,
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(StatusCodes.OK);
    await expect(
      pushSubscriptionCount({ sessionId: user.phone.sessionId }),
    ).resolves.toBe(0);
    await expect(
      pushSubscriptionCount({ sessionId: user.mac.sessionId }),
    ).resolves.toBe(1);
  });

  it("answers 401 without a session", async () => {
    expect((await listDevices(jsonRequest(BASE, ""))).status).toBe(
      StatusCodes.UNAUTHORIZED,
    );
  });
});
