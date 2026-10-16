import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  callsTo,
  mockNotificationApi,
  VAPID_PUBLIC_KEY,
  type NotificationApiOptions,
} from "@/components/notifications/notification-fixtures";
import {
  MESSAGING_API,
  type PushSubscriptionInput,
} from "@/components/notifications/notification-queries";

import { StoryQueries } from "../../.storybook/mocks/api";
import { signInAs } from "../../.storybook/mocks/auth";

import { NotificationSettings } from "./notification-settings";
import {
  PushPermissionError,
  type PushDevice,
  type PushPermission,
} from "./push-device";

const SUBSCRIPTION: PushSubscriptionInput = {
  endpoint: "https://fcm.googleapis.com/fcm/send/story-device",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

type FakeDevice = {
  supported?: boolean;
  permission?: PushPermission;
  subscribed?: boolean;
  /** What the browser's prompt answers. */
  answer?: PushPermission;
};

/** A stand-in for the browser's push APIs, in one state. */
function fakeDevice(state: FakeDevice = {}) {
  let permission = state.permission ?? "default";
  let subscription = state.subscribed === true ? SUBSCRIPTION : null;
  return {
    isSupported: () => state.supported ?? true,
    permission: () => permission,
    current: fn(() => Promise.resolve(subscription)),
    subscribe: fn((_publicKey: string) => {
      permission = state.answer ?? "granted";
      if (permission !== "granted")
        return Promise.reject(new PushPermissionError(permission));
      subscription = SUBSCRIPTION;
      return Promise.resolve(SUBSCRIPTION);
    }),
    unsubscribe: fn(() => {
      const endpoint = subscription?.endpoint ?? null;
      subscription = null;
      return Promise.resolve(endpoint);
    }),
  } satisfies PushDevice;
}

let api: ReturnType<typeof mockNotificationApi>;
let device: ReturnType<typeof fakeDevice>;

function setup(state: FakeDevice = {}, options: NotificationApiOptions = {}) {
  return () => {
    signInAs("member");
    device = fakeDevice(state);
    api = mockNotificationApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Profile/Notification settings",
  component: NotificationSettings,
  beforeEach: setup(),
  render: () => (
    <StoryQueries>
      <div className="max-w-2xl p-6">
        <NotificationSettings device={device} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof NotificationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

const DEVICE_SWITCH = "Turn on notifications on this device";
const SUBSCRIPTIONS = `${MESSAGING_API}/push-subscriptions`;

/** A browser without the Push API: the switch is off and explains why. */
export const Unsupported: Story = {
  beforeEach: setup({ supported: false }),
  play: async ({ canvas }) => {
    const toggle = await canvas.findByRole("switch", { name: DEVICE_SWITCH });
    await expect(toggle).toHaveAttribute("aria-disabled", "true");
    await expect(toggle).not.toBeChecked();
    await expect(
      canvas.getByText(/This browser can’t show notifications/),
    ).toBeVisible();
    await expect(
      callsTo(api, "GET", `${MESSAGING_API}/push/config`),
    ).toHaveLength(0);
  },
};

/** The server has no VAPID key: push is not set up. */
export const NotConfigured: Story = {
  beforeEach: setup({}, { publicKey: null }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Notifications on devices aren’t set up/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: DEVICE_SWITCH }),
    ).toHaveAttribute("aria-disabled", "true");
  },
};

/** The browser blocks notifications for the site. */
export const Blocked: Story = {
  beforeEach: setup({ permission: "denied" }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Your browser blocks notifications/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: DEVICE_SWITCH }),
    ).toHaveAttribute("aria-disabled", "true");
  },
};

/** Off: turning it on subscribes with the server's key and saves it. */
export const TurnOn: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        "Get a notification on this device, even when the app is closed.",
      ),
    ).toBeVisible();
    const toggle = canvas.getByRole("switch", { name: DEVICE_SWITCH });
    await expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await expect(device.subscribe).toHaveBeenCalledWith(VAPID_PUBLIC_KEY);
    await waitFor(() =>
      expect(callsTo(api, "POST", SUBSCRIPTIONS)).toHaveLength(1),
    );
    await expect(callsTo(api, "POST", SUBSCRIPTIONS)[0]?.body).toEqual(
      SUBSCRIPTION,
    );
    await waitFor(() => expect(toggle).toBeChecked());
    await expect(
      canvas.getByText("This device gets your notifications."),
    ).toBeVisible();
  },
};

/** The person says no at the browser's prompt: it shows as blocked. */
export const PromptDenied: Story = {
  beforeEach: setup({ answer: "denied" }),
  play: async ({ canvas, userEvent }) => {
    const toggle = await canvas.findByRole("switch", { name: DEVICE_SWITCH });
    await waitFor(() => expect(toggle).not.toHaveAttribute("aria-disabled"));
    await userEvent.click(toggle);
    await expect(
      await canvas.findByText(/Your browser blocks notifications/),
    ).toBeVisible();
    await expect(callsTo(api, "POST", SUBSCRIPTIONS)).toHaveLength(0);
  },
};

/** On: the subscription is sent again; turning off unsubscribes and deletes it. */
export const TurnOff: Story = {
  beforeEach: setup({ permission: "granted", subscribed: true }),
  play: async ({ canvas, userEvent }) => {
    const toggle = await canvas.findByRole("switch", { name: DEVICE_SWITCH });
    await waitFor(() => expect(toggle).toBeChecked());
    await expect(callsTo(api, "POST", SUBSCRIPTIONS)).toHaveLength(1);
    await userEvent.click(toggle);
    await expect(device.unsubscribe).toHaveBeenCalled();
    await waitFor(() =>
      expect(callsTo(api, "POST", `${SUBSCRIPTIONS}/delete`)).toHaveLength(1),
    );
    await expect(
      callsTo(api, "POST", `${SUBSCRIPTIONS}/delete`)[0]?.body,
    ).toEqual({ endpoint: SUBSCRIPTION.endpoint });
    await waitFor(() => expect(toggle).not.toBeChecked());
  },
};

/** A menu group's switch mutes its push; the full muted list is saved. */
export const MuteGroup: Story = {
  play: async ({ canvas, userEvent }) => {
    const groups = within(
      await canvas.findByRole("list", { name: "Push by menu" }),
    );
    await expect(
      groups.getByRole("switch", { name: "Payment & Accounting" }),
    ).not.toBeChecked();
    const hrms = groups.getByRole("switch", { name: "HRMS" });
    await expect(hrms).toBeChecked();
    await userEvent.click(hrms);
    await waitFor(() =>
      expect(
        callsTo(api, "POST", `${MESSAGING_API}/preferences/update`),
      ).toHaveLength(1),
    );
    await expect(
      callsTo(api, "POST", `${MESSAGING_API}/preferences/update`)[0]?.body,
    ).toEqual({ mutedGroups: ["payment_accounting", "hrms"] });
    await waitFor(() => expect(hrms).not.toBeChecked());
  },
};

/** A failed save says so. */
export const MuteFails: Story = {
  beforeEach: setup({}, { failWrites: true }),
  play: async ({ canvas, userEvent }) => {
    const groups = within(
      await canvas.findByRole("list", { name: "Push by menu" }),
    );
    await userEvent.click(groups.getByRole("switch", { name: "HRMS" }));
    await expect(
      await canvas.findByText("Couldn’t save your choice. Please try again."),
    ).toBeVisible();
    await expect(groups.getByRole("switch", { name: "HRMS" })).toBeChecked();
  },
};
