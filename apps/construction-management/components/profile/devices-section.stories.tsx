import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { DeviceItem } from "@/src/queries/account";

import { signInAs } from "../../.storybook/mocks/auth";
import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { DevicesSection } from "./devices-section";

const BASE = "/api/construction/organization/me/devices";

const THIS_DEVICE: DeviceItem = {
  id: "session-mac",
  browser: "Safari",
  os: "macOS",
  kind: "desktop",
  signedInAt: "2026-10-01T04:30:00.000Z",
  lastActiveAt: "2026-10-16T05:00:00.000Z",
  isCurrent: true,
  pushOn: false,
};
const PHONE: DeviceItem = {
  id: "session-phone",
  browser: "Chrome",
  os: "Android",
  kind: "phone",
  signedInAt: "2026-09-20T03:00:00.000Z",
  lastActiveAt: "2026-10-15T12:00:00.000Z",
  isCurrent: false,
  pushOn: true,
};
const TABLET: DeviceItem = {
  id: "session-tablet",
  browser: "Safari",
  os: "iPadOS",
  kind: "tablet",
  signedInAt: "2026-08-02T03:00:00.000Z",
  lastActiveAt: "2026-09-01T12:00:00.000Z",
  isCurrent: false,
  pushOn: false,
};

let devices: DeviceItem[] = [];
let calls: ApiCall[] = [];

function serve(start: DeviceItem[]) {
  devices = start;
  calls = [];
  const api = mockApi((call) => {
    calls.push(call);
    if (call.method === "GET" && call.path === BASE)
      return Response.json({ items: devices });
    if (call.method === "POST" && call.path === `${BASE}/sign-out-others`) {
      const before = devices.length;
      devices = devices.filter((item) => item.isCurrent);
      return Response.json({ signedOut: before - devices.length });
    }
    const match = /\/me\/devices\/([^/]+)\/sign-out$/.exec(call.path);
    if (call.method === "POST" && match != null) {
      devices = devices.filter((item) => item.id !== match[1]);
      return new Response(null, { status: 204 });
    }
    return undefined;
  });
  return api.restore;
}

const meta = {
  title: "Account/DevicesSection",
  component: DevicesSection,
  render: () => (
    <StoryQueries>
      <DevicesSection />
    </StoryQueries>
  ),
  beforeEach() {
    signInAs("member");
  },
} satisfies Meta<typeof DevicesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignOutOneDevice: Story = {
  beforeEach: () => serve([THIS_DEVICE, PHONE, TABLET]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const mac = await canvas.findByRole("listitem", {
      name: "Safari on macOS",
    });
    await expect(within(mac).getByText("This device")).toBeVisible();
    await expect(
      within(mac).queryByRole("button", { name: "Sign out" }),
    ).toBeNull();
    const phone = canvas.getByRole("listitem", { name: "Chrome on Android" });
    await expect(within(phone).getByText("Push on")).toBeVisible();

    await userEvent.click(
      within(phone).getByRole("button", { name: "Sign out" }),
    );
    await expect(
      await body.findByText("Sign out of Chrome on Android?"),
    ).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Sign out" }));
    await expect(
      await canvas.findByText("Chrome on Android is signed out."),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        canvas.queryByRole("listitem", { name: "Chrome on Android" }),
      ).toBeNull(),
    );
    await expect(
      calls.some((call) => call.path === `${BASE}/session-phone/sign-out`),
    ).toBe(true);
  },
};

export const SignOutAllOthers: Story = {
  beforeEach: () => serve([THIS_DEVICE, PHONE, TABLET]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("listitem", { name: "Safari on iPadOS" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Sign out of all other devices" }),
    );
    await expect(
      await body.findByText("Sign out of all other devices?"),
    ).toBeVisible();
    await userEvent.click(body.getByRole("button", { name: "Sign out" }));
    await expect(
      await canvas.findByText("2 other devices are signed out."),
    ).toBeVisible();
    await expect(
      await canvas.findByText("You are not signed in anywhere else."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Sign out of all other devices" }),
    ).toBeDisabled();
  },
};

export const OnlyThisDevice: Story = {
  beforeEach: () => serve([THIS_DEVICE]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("You are not signed in anywhere else."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Sign out of all other devices" }),
    ).toBeDisabled();
  },
};

export const SignOutFails: Story = {
  beforeEach() {
    devices = [THIS_DEVICE, PHONE];
    const api = mockApi((call) => {
      if (call.method === "GET" && call.path === BASE)
        return Response.json({ items: devices });
      if (call.method === "POST")
        return Response.json(
          {
            code: "DEVICE_NOT_FOUND",
            message: "This device is already signed out.",
          },
          { status: 404 },
        );
      return undefined;
    });
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const phone = await canvas.findByRole("listitem", {
      name: "Chrome on Android",
    });
    await userEvent.click(
      within(phone).getByRole("button", { name: "Sign out" }),
    );
    await userEvent.click(
      await body.findByRole("button", { name: "Sign out" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This device is already signed out.",
    );
  },
};
