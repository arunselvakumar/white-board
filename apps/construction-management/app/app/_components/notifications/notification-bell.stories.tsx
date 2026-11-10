import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../.storybook/mocks/api";
import { signInAs } from "../../.storybook/mocks/auth";

import { NotificationBell } from "./notification-bell";
import {
  callsTo,
  mockNotificationApi,
  NOTIFICATIONS,
  TASK_ASSIGNED,
  type NotificationApiOptions,
} from "./notification-fixtures";
import { MESSAGING_API } from "./notification-queries";

const BASE = `${MESSAGING_API}/notifications`;

let api: ReturnType<typeof mockNotificationApi>;

function withApi(options: NotificationApiOptions = {}) {
  return () => {
    signInAs("member");
    api = mockNotificationApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Notifications/Bell",
  component: NotificationBell,
  beforeEach: withApi(),
  render: () => (
    <StoryQueries>
      <div className="flex justify-end p-4">
        <NotificationBell />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof NotificationBell>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Nothing unread: no badge; the popover says so when the list is empty. */
export const NoneUnread: Story = {
  beforeEach: withApi({ items: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitFor(() =>
      expect(callsTo(api, "GET", `${BASE}/unread-count`)).toHaveLength(1),
    );
    const bell = await canvas.findByRole("button", { name: "Notifications" });
    await expect(canvas.queryByTestId("notification-badge")).toBeNull();
    await userEvent.click(bell);
    await expect(
      await body(canvasElement).findByText("No notifications yet"),
    ).toBeVisible();
    await expect(
      body(canvasElement).getByRole("button", { name: "Mark all read" }),
    ).toBeDisabled();
    await expect(
      body(canvasElement).getByRole("link", { name: "See all" }),
    ).toHaveAttribute("href", "/app/notifications");
  },
};

/** Three unread: the badge counts them and the popover lists the latest. */
export const SomeUnread: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const bell = await canvas.findByRole("button", {
      name: "Notifications, 3 unread",
    });
    await expect(canvas.getByTestId("notification-badge")).toHaveTextContent(
      "3",
    );
    await userEvent.click(bell);
    const list = within(
      await body(canvasElement).findByRole("list", {
        name: "Latest notifications",
      }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(
      NOTIFICATIONS.length,
    );
    await expect(
      list.getByRole("link", { name: `Unread: ${TASK_ASSIGNED.title}` }),
    ).toHaveAttribute("href", TASK_ASSIGNED.href);
    await expect(list.getByText("5 min ago")).toBeVisible();
    await expect(
      list.getByRole("link", { name: "Issue marked solved" }),
    ).toBeVisible();
    // No link: a plain row that only marks read.
    await expect(
      list.getByRole("button", { name: "Your September salary is paid" }),
    ).toBeVisible();
    await expect(callsTo(api, "GET", BASE)[0]?.path.includes("limit=10")).toBe(
      true,
    );
  },
};

/** Mark all read posts once and clears the badge. */
export const MarkAllRead: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Notifications, 3 unread" }),
    );
    await body(canvasElement).findByRole("list", {
      name: "Latest notifications",
    });
    await userEvent.click(
      body(canvasElement).getByRole("button", { name: "Mark all read" }),
    );
    await waitFor(() =>
      expect(callsTo(api, "POST", `${BASE}/read-all`)).toHaveLength(1),
    );
    await expect(
      await canvas.findByRole("button", { name: "Notifications" }),
    ).toBeVisible();
    await expect(canvas.queryByTestId("notification-badge")).toBeNull();
  },
};

/** Opening an unread one marks it read and goes to its record. */
export const OpenMarksRead: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Notifications, 3 unread" }),
    );
    await userEvent.click(
      await body(canvasElement).findByRole("link", {
        name: `Unread: ${TASK_ASSIGNED.title}`,
      }),
    );
    await waitFor(() =>
      expect(
        callsTo(api, "POST", `${BASE}/${TASK_ASSIGNED.id}/read`),
      ).toHaveLength(1),
    );
    await expect(
      await canvas.findByRole("button", { name: "Notifications, 2 unread" }),
    ).toBeVisible();
  },
};

/** Past 99 the badge caps at "99+"; the label keeps the real count. */
export const ManyUnread: Story = {
  beforeEach: withApi({ unreadCount: 250 }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Notifications, 250 unread" }),
    ).toBeVisible();
    await expect(canvas.getByTestId("notification-badge")).toHaveTextContent(
      "99+",
    );
  },
};

/** At 375 px the popover fits the screen. */
export const Phone: Story = {
  render: () => (
    <StoryQueries>
      <div
        data-testid="phone"
        style={{ width: 375 }}
        className="flex justify-end p-4"
      >
        <NotificationBell />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Notifications, 3 unread" }),
    );
    const list = await body(canvasElement).findByRole("list", {
      name: "Latest notifications",
    });
    await expect(canvas.getByTestId("phone").scrollWidth).toBeLessThanOrEqual(
      375,
    );
    await expect(list.getBoundingClientRect().width).toBeLessThanOrEqual(375);
  },
};
