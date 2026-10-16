import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../.storybook/mocks/api";
import { signInAs } from "../../.storybook/mocks/auth";

import {
  callsTo,
  ISSUE_SOLVED,
  mockNotificationApi,
  NOTIFICATIONS,
  OLDER_NOTIFICATIONS,
  PR_WAITING,
  REPORT_READY,
  type NotificationApiOptions,
} from "./notification-fixtures";
import { MESSAGING_API } from "./notification-queries";
import { NotificationsScreen } from "./notifications-screen";

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
  title: "Notifications/Page",
  component: NotificationsScreen,
  beforeEach: withApi({ older: OLDER_NOTIFICATIONS }),
  parameters: { nextjs: { navigation: { pathname: "/app/notifications" } } },
  render: () => (
    <StoryQueries>
      <NotificationsScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NotificationsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No notifications: the empty state, and no Mark all read. */
export const Empty: Story = {
  beforeEach: withApi({ items: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No notifications yet")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Mark all read" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

/** The list: unread first-class, downloads on a ready report, Load more. */
export const WithItems: Story = {
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Notifications" }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(
      NOTIFICATIONS.length,
    );
    await expect(canvas.getByText("3 unread")).toBeVisible();
    await expect(
      list.getByRole("link", { name: `Unread: ${PR_WAITING.title}` }),
    ).toHaveAttribute("href", PR_WAITING.href);
    await expect(
      list.getByRole("link", { name: `Download Excel: ${REPORT_READY.title}` }),
    ).toHaveAttribute("href", REPORT_READY.attachment?.downloads[0]?.href);
    await expect(
      list.getByRole("link", { name: `Download PDF: ${REPORT_READY.title}` }),
    ).toHaveAttribute("download");
    // Read ones have no Mark read.
    await expect(
      list.queryByRole("button", { name: `Mark read: ${ISSUE_SOLVED.title}` }),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Load more" }),
    ).toBeVisible();
  },
};

/** Load more brings the next page under the first. */
export const LoadMore: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Load more" }),
    );
    await expect(
      await canvas.findByRole("link", { name: "Stock below minimum" }),
    ).toBeVisible();
    await expect(
      within(canvas.getByRole("list", { name: "Notifications" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(NOTIFICATIONS.length + OLDER_NOTIFICATIONS.length);
    await expect(
      callsTo(api, "GET", BASE).some((call) =>
        call.path.includes("cursor=page-2"),
      ),
    ).toBe(true);
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

/** Mark read on one, then Mark all read. */
export const MarkRead: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: `Mark read: ${PR_WAITING.title}`,
      }),
    );
    await waitFor(() =>
      expect(
        callsTo(api, "POST", `${BASE}/${PR_WAITING.id}/read`),
      ).toHaveLength(1),
    );
    await expect(await canvas.findByText("2 unread")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Mark all read" }),
    );
    await waitFor(() =>
      expect(callsTo(api, "POST", `${BASE}/read-all`)).toHaveLength(1),
    );
    await expect(await canvas.findByText("All read")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Mark all read" }),
    ).toBeDisabled();
  },
};

/** Downloading a ready report marks it read. */
export const DownloadMarksRead: Story = {
  play: async ({ canvas, userEvent }) => {
    const link = await canvas.findByRole("link", {
      name: `Download Excel: ${REPORT_READY.title}`,
    });
    // Keep the story on the page: the browser would fetch the file.
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });
    await userEvent.click(link);
    await waitFor(() =>
      expect(
        callsTo(api, "POST", `${BASE}/${REPORT_READY.id}/read`),
      ).toHaveLength(1),
    );
  },
};

/** Delete hides one from the list. */
export const Delete: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", {
        name: `Delete: ${ISSUE_SOLVED.title}`,
      }),
    );
    await waitFor(() =>
      expect(
        callsTo(api, "POST", `${BASE}/${ISSUE_SOLVED.id}/delete`),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: ISSUE_SOLVED.title }),
      ).toBeNull(),
    );
    await expect(
      within(canvas.getByRole("list", { name: "Notifications" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(NOTIFICATIONS.length - 1);
  },
};

/** A failed write says so. */
export const WriteFails: Story = {
  beforeEach: withApi({ failWrites: true }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Mark all read" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Couldn’t update your notifications. Please try again.",
    );
  },
};

/** At 375 px nothing scrolls sideways. */
export const Phone: Story = {
  render: () => (
    <StoryQueries>
      <div data-testid="phone" style={{ width: 375 }}>
        <NotificationsScreen />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Notifications" });
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(375);
  },
};
