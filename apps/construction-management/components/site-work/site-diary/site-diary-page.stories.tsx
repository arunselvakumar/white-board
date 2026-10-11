import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { addDays } from "@/src/shared-kernel/calendar-date";

import {
  DIARY_DATE,
  DIARY_PROJECT_ID,
  mockSiteDiaryApi,
  SITE_DIARY_API,
  type SiteDiaryApiOptions,
} from "./site-diary-fixtures";
import { SiteDiaryPage } from "./site-diary-page";

let api: ReturnType<typeof mockSiteDiaryApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function diaryApi(options: SiteDiaryApiOptions = {}) {
  return () => {
    api = mockSiteDiaryApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${DIARY_PROJECT_ID}/site-diary`;

const meta = {
  title: "Site work/Site Diary/Page",
  component: SiteDiaryPage,
  args: { projectId: DIARY_PROJECT_ID, initialDate: DIARY_DATE },
  beforeEach: diaryApi(),
  parameters: { nextjs: { navigation: { pathname: BASE } } },
  render: (args) => (
    <StoryQueries>
      <SiteDiaryPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof SiteDiaryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A day's diary: weather chips, rainfall, condition, visitors, instructions and notes. */
export const View: Story = {
  play: async ({ canvas }) => {
    const diary = within(
      await canvas.findByRole("article", { name: "Site Diary" }),
    );
    await expect(diary.getByText("Morning · Sunny")).toBeVisible();
    await expect(diary.getByText("Afternoon · Light rain")).toBeVisible();
    await expect(diary.getByText("4.5 mm")).toBeVisible();
    await expect(
      diary.getByText("Slushy near the ramp; access road usable."),
    ).toBeVisible();
    const visitors = within(diary.getByRole("table", { name: "Visitors" }));
    await expect(visitors.getAllByRole("row")).toHaveLength(3);
    await expect(visitors.getByText("Ravi Shankar")).toBeVisible();
    await expect(visitors.getByText("11:30")).toBeVisible();
    await expect(
      diary.getByRole("table", { name: "Instructions" }),
    ).toBeVisible();
    await expect(diary.getByText(/Slab pour moved to Monday/)).toBeVisible();
    await expect(diary.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${BASE}/0199c4a0-0000-7000-8000-0000000e1001/edit`,
    );
    const month = within(
      canvas.getByRole("complementary", { name: "Diaries this month" }),
    );
    await expect(
      await month.findByRole("button", { current: "date" }),
    ).toBeVisible();
  },
};

/** A date without a diary offers "Write the diary" to members with Create. */
export const EmptyState: Story = {
  args: { initialDate: addDays(DIARY_DATE, -1) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^No diary for /)).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Write the diary" }),
    ).toHaveAttribute("href", `${BASE}/new?date=${addDays(DIARY_DATE, -1)}`);
  },
};

/** Without Create the empty state has no action, and the diary no Edit or Delete. */
export const ReadOnly: Story = {
  args: { initialDate: addDays(DIARY_DATE, -1) },
  beforeEach: diaryApi({
    flags: { "site_work.site_diary": ["read"] },
    diaries: {},
  }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/^No diary for /)).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: "Write the diary" }),
    ).toBeNull();
  },
};

/** The stepper opens on today, cannot go past it, and steps back a day. */
export const Stepper: Story = {
  args: { initialDate: undefined },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText(/^No diary for /)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Next day" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Previous day" }));
    await expect(
      await canvas.findByRole("article", { name: "Site Diary" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Date")).toHaveValue(DIARY_DATE);
    await expect(
      canvas.getByRole("button", { name: "Next day" }),
    ).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Today" })).toBeVisible();
  },
};

/** Delete asks first, then posts the diary's `updatedAt`. */
export const Delete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete" }),
    );
    const dialog = within(
      await within(canvasElement.ownerDocument.body).findByRole("alertdialog"),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    const path = `${SITE_DIARY_API}/0199c4a0-0000-7000-8000-0000000e1001/delete`;
    await waitFor(async () => {
      await expect(posts(path)[0]?.body).toEqual({
        expectedUpdatedAt: "2026-10-10T12:00:00.000Z",
      });
    });
  },
};
