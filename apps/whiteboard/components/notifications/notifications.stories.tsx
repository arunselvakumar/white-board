import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/components/app-shell/app-shell";
import type {
  NotificationView,
  NotificationsView,
} from "@/src/queries/notifications";
import { signInAs } from "../../.storybook/mocks/auth";

import {
  ashaGiven,
  allRead,
  meeraGiven,
  NOTIFICATIONS,
  notificationsPage,
  vikramWithdrawn,
} from "./notifications.fixtures";
import { NotificationsScreen } from "./notifications-screen";
import {
  callsTo,
  hasNoHorizontalOverflow,
  mockApi,
  withFreshQueryClient,
} from "./story-api";

/**
 * A Teacher's Notifications that Mark read and Mark all read change, so the
 * bell and the lists refetch what the API would now return.
 */
function mockNotifications(
  start: NotificationView[],
  pages?: Record<string, NotificationsView>,
) {
  let items = start;
  return mockApi({
    "GET /notifications/unread-count": () => ({
      json: { unreadCount: items.filter((item) => item.readAt == null).length },
    }),
    "GET /notifications": ({ url }) => {
      const after = url.searchParams.get("after");
      const before = url.searchParams.get("before");
      const page = pages?.[after ?? before ?? "first"];
      return { json: page ?? notificationsPage(items) };
    },
    "POST /notifications/read-all": () => {
      items = allRead(items);
      return { json: { unreadCount: 0 } };
    },
    ...Object.fromEntries(
      start.map((notification) => [
        `POST /notifications/${notification.id}/read`,
        () => {
          items = items.map((item) =>
            item.id === notification.id
              ? { ...item, readAt: "2026-10-12T05:00:00.000Z" }
              : item,
          );
          return {
            json: items.find((item) => item.id === notification.id),
          };
        },
      ]),
    ),
  });
}

function Placeholder() {
  return <div className="p-6">My Batches</div>;
}

const meta = {
  title: "Pages/Notifications",
  decorators: [withFreshQueryClient],
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/notifications" } },
  },
  beforeEach() {
    signInAs("teacher", { name: "Riverside Centre" });
  },
  render: () => (
    <AppShell>
      <NotificationsScreen />
    </AppShell>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------- bell ------------------------------- */

export const BellWithUnread: Story = {
  parameters: { nextjs: { navigation: { pathname: "/teacher" } } },
  beforeEach: () => mockNotifications(NOTIFICATIONS),
  render: () => (
    <AppShell>
      <Placeholder />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const bell = await canvas.findByRole("button", {
      name: "Notifications, 2 unread",
    });
    await expect(bell).toHaveTextContent("2");
    await userEvent.click(bell);

    const latest = within(
      await body.findByRole("list", { name: "Latest Notifications" }),
    );
    await expect(latest.getAllByRole("listitem")).toHaveLength(3);
    await expect(
      latest.getByRole("link", {
        name: "Unread: Asha Rao (Parent · Ramesh Rao) gave notice for 2 Classes",
      }),
    ).toHaveAttribute("href", "/teacher/absence-notices");
    await expect(
      latest.getByRole("link", {
        name: "Unread: Vikram Nair (Student) withdrew notice for 1 Class",
      }),
    ).toBeVisible();
    // The bell keeps it short: two Classes, then a count.
    await expect(latest.getByText("and 2 more")).toBeVisible();
    await expect(
      body.getByRole("link", { name: "See all Notifications" }),
    ).toHaveAttribute("href", "/notifications");

    await userEvent.click(body.getByRole("button", { name: "Mark all read" }));
    await waitFor(() =>
      expect(callsTo("POST /notifications/read-all")).toHaveLength(1),
    );
    await expect(
      await canvas.findByRole("button", { name: "Notifications" }),
    ).toBeVisible();
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

export const BellOpensANotification: Story = {
  parameters: { nextjs: { navigation: { pathname: "/teacher" } } },
  beforeEach: () => mockNotifications(NOTIFICATIONS),
  render: () => (
    <AppShell>
      <Placeholder />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Notifications, 2 unread" }),
    );
    await userEvent.click(
      await body.findByRole("link", { name: /^Unread: Asha Rao/ }),
    );
    await waitFor(() =>
      expect(callsTo(`POST /notifications/${ashaGiven.id}/read`)).toHaveLength(
        1,
      ),
    );
    await expect(
      await canvas.findByRole("button", { name: "Notifications, 1 unread" }),
    ).toBeVisible();
  },
};

export const BellWithNoneUnread: Story = {
  parameters: { nextjs: { navigation: { pathname: "/teacher" } } },
  beforeEach: () => mockNotifications([]),
  render: () => (
    <AppShell>
      <Placeholder />
    </AppShell>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const bell = await canvas.findByRole("button", { name: "Notifications" });
    await waitFor(() =>
      expect(callsTo("GET /notifications/unread-count")).toHaveLength(1),
    );
    await expect(bell.textContent).toBe("");
    await userEvent.click(bell);
    await expect(await body.findByText("No Notifications yet.")).toBeVisible();
    await expect(
      body.getByRole("button", { name: "Mark all read" }),
    ).toBeDisabled();
  },
};

/** Only Teachers receive Notifications, so only they see the bell. */
export const OwnerHasNoBell: Story = {
  parameters: { nextjs: { navigation: { pathname: "/" } } },
  beforeEach() {
    signInAs("owner", { name: "Riverside Centre" });
    return mockNotifications(NOTIFICATIONS);
  },
  render: () => (
    <AppShell>
      <Placeholder />
    </AppShell>
  ),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Account menu for Arun" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /^Notifications/ }),
    ).toBeNull();
    await expect(callsTo("GET /notifications/unread-count")).toHaveLength(0);
  },
};

/* ------------------------------- page ------------------------------- */

export const NotificationsList: Story = {
  beforeEach: () => mockNotifications(NOTIFICATIONS),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Notifications" }),
    ).toBeVisible();
    await expect(canvas.getByText("2 unread")).toBeVisible();
    const breadcrumb = within(
      canvas.getByRole("navigation", { name: "Breadcrumb" }),
    );
    await expect(breadcrumb.getByText("Notifications")).toBeVisible();

    const list = within(canvas.getByRole("list", { name: "Notifications" }));
    const items = list.getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    const item = (index: number) => {
      const found = items[index];
      if (found == null) throw new Error(`No Notification at ${String(index)}`);
      return within(found);
    };

    // Newest first: who, which Classes, the reason and note, and when.
    const asha = item(0);
    await expect(
      asha.getByText(
        "Asha Rao (Parent · Ramesh Rao) gave notice for 2 Classes",
      ),
    ).toBeVisible();
    await expect(asha.getByText("Tally Evening · Tally")).toBeVisible();
    await expect(asha.getByText("Thu 15 Oct, 5:00–6:00 pm")).toBeVisible();
    await expect(asha.getByText("Fri 16 Oct, 5:00–6:00 pm")).toBeVisible();
    await expect(asha.getByText("Sick")).toBeVisible();
    await expect(
      asha.getByText("“Fever since Sunday; the doctor said two days of rest.”"),
    ).toBeVisible();
    await expect(asha.getByText("12 Oct, 9:45 am")).toBeVisible();

    const vikram = item(1);
    await expect(
      vikram.getByText("Vikram Nair (Student) withdrew notice for 1 Class"),
    ).toBeVisible();
    await expect(vikram.getByText("Withdrawn")).toBeVisible();
    await expect(vikram.getByText("Travel")).toBeVisible();

    // The full list shows every Class of a week away.
    const meera = item(2);
    await expect(
      meera.getByRole("link", {
        name: "Meera Pillai (Student) gave notice for 4 Classes",
      }),
    ).toBeVisible();
    await expect(meera.getByText("Thu 22 Oct, 5:00–6:00 pm")).toBeVisible();
    await expect(meera.getByText("Family function")).toBeVisible();

    // Opening an unread one marks it read and goes to Absence Notices.
    const ashaLink = list.getByRole("link", { name: /^Unread: Asha Rao/ });
    await expect(ashaLink).toHaveAttribute("href", "/teacher/absence-notices");
    await userEvent.click(ashaLink);
    await waitFor(() =>
      expect(callsTo(`POST /notifications/${ashaGiven.id}/read`)).toHaveLength(
        1,
      ),
    );
    // Opening a read one sends nothing.
    await userEvent.click(list.getByRole("link", { name: /^Meera Pillai/ }));
    await expect(
      callsTo(`POST /notifications/${meeraGiven.id}/read`),
    ).toHaveLength(0);
    await expect(await canvas.findByText("1 unread")).toBeVisible();
    await expect(hasNoHorizontalOverflow(canvasElement)).toBe(true);
  },
};

export const MarkAllRead: Story = {
  beforeEach: () => mockNotifications(NOTIFICATIONS),
  play: async ({ canvas, userEvent }) => {
    const markAll = await canvas.findByRole("button", {
      name: "Mark all read",
    });
    await userEvent.click(markAll);
    await waitFor(() =>
      expect(callsTo("POST /notifications/read-all")).toHaveLength(1),
    );
    await expect(await canvas.findByText("All read")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Mark all read" }),
    ).toBeDisabled();
    await expect(
      canvas.queryAllByRole("link", { name: /^Unread:/ }),
    ).toHaveLength(0);
    await expect(
      canvas.getByRole("button", { name: "Notifications" }),
    ).toBeVisible();
  },
};

export const Paged: Story = {
  beforeEach: () =>
    mockNotifications(NOTIFICATIONS, {
      first: notificationsPage(
        [ashaGiven, vikramWithdrawn],
        { nextCursor: "cursor-2" },
        3,
      ),
      "cursor-2": notificationsPage(
        [meeraGiven],
        { prevCursor: "cursor-1" },
        3,
      ),
      "cursor-1": notificationsPage(
        [ashaGiven, vikramWithdrawn],
        { nextCursor: "cursor-2" },
        3,
      ),
    }),
  play: async ({ canvas, userEvent }) => {
    const pages = within(
      await canvas.findByRole("navigation", { name: "Notification pages" }),
    );
    await expect(pages.getByRole("button", { name: "Newer" })).toBeDisabled();
    await userEvent.click(pages.getByRole("button", { name: "Older" }));
    await expect(
      await canvas.findByRole("link", { name: /^Meera Pillai/ }),
    ).toBeVisible();
    await expect(
      callsTo("GET /notifications").some(
        (call) => call.url.searchParams.get("after") === "cursor-2",
      ),
    ).toBe(true);
    await expect(canvas.queryByRole("link", { name: /Asha Rao/ })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Newer" }));
    await expect(
      await canvas.findByRole("link", { name: /^Unread: Asha Rao/ }),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: () => mockNotifications([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Notifications yet")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Mark all read" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("navigation", { name: "Notification pages" }),
    ).toBeNull();
  },
};
