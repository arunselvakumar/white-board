import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";

import { mockFetch, type MockRoute } from "@/.storybook/mock-fetch";
import {
  CATEGORY_LIST,
  DHURESH,
  PROJECT_OPTIONS,
  SUPERVISOR_LIST,
  TOWER,
  listOf,
} from "../../_components/labour-fixtures";
import {
  MIXED_ENTRIES,
  STORY_NOW,
  activityPage,
  attendanceDays,
} from "./labour-activity-fixtures";
import { LABOUR_ACTIVITY_EMPTY } from "./labour-activity";
import { LabourPage } from "./labour-page";

const LABOURS = "/api/construction/labour/labours";
const ACTIVITY = `${LABOURS}/${DHURESH.id}/activity`;

let api: ReturnType<typeof mockFetch>;

const PAGE: MockRoute[] = [
  {
    path: "/api/construction/projects/projects/options",
    respond: () => Response.json({ items: PROJECT_OPTIONS }),
  },
  {
    path: "/api/construction/masters/labour-categories",
    respond: () => Response.json(CATEGORY_LIST),
  },
  {
    path: "/api/construction/masters/supervisors",
    respond: () => Response.json(SUPERVISOR_LIST),
  },
  { path: LABOURS, respond: () => Response.json(listOf([DHURESH])) },
  {
    path: `${LABOURS}/${DHURESH.id}`,
    respond: () => Response.json(DHURESH),
  },
  {
    path: `${LABOURS}/${DHURESH.id}/documents`,
    respond: () => Response.json({ items: [] }),
  },
];

function withActivity(respond: MockRoute["respond"]) {
  return () => {
    api = mockFetch([...PAGE, { path: ACTIVITY, respond }]);
    return api.restore;
  };
}

/** The activity URLs fetched so far, query strings included. */
function activityCalls(): string[] {
  return api.spy.mock.calls
    .map(([input]) =>
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    )
    .filter((url) => url.startsWith(ACTIVITY));
}

const meta = {
  title: "Masters/Labours/Page",
  component: LabourPage,
  args: { id: DHURESH.id, now: STORY_NOW },
  render: (args) => (
    <StoryQueryClient>
      <LabourPage {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof LabourPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DetailsKeepsTypedChangesAcrossTabs: Story = {
  beforeEach: withActivity(() => Response.json(activityPage([]))),
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Labour name");
    await expect(
      canvas.getByRole("tab", { name: "Details", selected: true }),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Dhuresh N");

    await userEvent.click(canvas.getByRole("tab", { name: "Activity" }));
    await expect(await canvas.findByText(LABOUR_ACTIVITY_EMPTY)).toBeVisible();
    await expect(canvas.getByLabelText("Labour name")).not.toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Details" }));
    // The form stayed mounted: what was typed is still there to save.
    await expect(canvas.getByLabelText("Labour name")).toHaveValue("Dhuresh N");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeVisible();
  },
};

export const ActivityEmpty: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: withActivity(() => Response.json(activityPage([]))),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("tab", { name: "Activity", selected: true }),
    ).toBeVisible();
    await expect(await canvas.findByText(LABOUR_ACTIVITY_EMPTY)).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

export const ActivityMixed: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: withActivity(() => Response.json(activityPage(MIXED_ENTRIES))),
  play: async ({ canvas }) => {
    const today = await canvas.findByRole("region", { name: "Today" });
    await expect(within(today).getByText("Marked inactive")).toBeVisible();
    const yesterday = canvas.getByRole("region", { name: "Yesterday" });
    await expect(
      within(yesterday).getByText("09:00 – 18:00 · Overtime 1.5 h · Shift 1"),
    ).toBeVisible();
    await expect(within(yesterday).getByText("Work finished")).toBeVisible();
    await expect(
      canvas.getByText(/changed from Absent to Half Day/),
    ).toBeVisible();
    await expect(canvas.getByText(/Transferred from/)).toHaveTextContent(
      "Transferred from Tower A to Villa Phase 2",
    );
    await expect(canvas.getByText("Imported from Excel")).toBeVisible();
    await expect(canvas.getByText("Paid Leave")).toBeVisible();
    // A Project the viewer may open is a link; one they may not is not.
    await expect(
      canvas.getAllByRole("link", { name: "Tower A" })[0],
    ).toHaveAttribute("href", `/app/projects/${TOWER.id}`);
    await expect(canvas.queryByRole("link", { name: "Old Mall" })).toBeNull();
    await expect(canvas.getByText("Old Mall")).toBeVisible();
    await expect(
      canvas.getAllByText(/^by Arun Selva Kumar ·/)[0],
    ).toHaveTextContent("by Arun Selva Kumar · 11 Nov 2026, 11:40 am");
  },
};

export const ActivityLoadMore: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: () => {
    let calls = 0;
    return withActivity(() => {
      calls += 1;
      return Response.json(
        calls === 1
          ? activityPage(attendanceDays(30), "next-page")
          : activityPage(attendanceDays(8, 30)),
      );
    })();
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("button", { name: "Load more" });
    await expect(canvas.getAllByRole("listitem")).toHaveLength(30);
    await userEvent.click(canvas.getByRole("button", { name: "Load more" }));
    await waitFor(async () => {
      await expect(canvas.getAllByRole("listitem")).toHaveLength(38);
    });
    await expect(activityCalls().at(-1)).toContain("cursor=next-page");
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

export const ActivityFilters: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: withActivity(() => Response.json(activityPage(MIXED_ENTRIES))),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Marked inactive");
    await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Attendance" }),
    );
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toContain("type=attendance");
    });
    await userEvent.click(canvas.getByRole("combobox", { name: "Project" }));
    await userEvent.click(
      await body.findByRole("option", { name: PROJECT_OPTIONS[0]?.name ?? "" }),
    );
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toContain(
        `projectId=${PROJECT_OPTIONS[0]?.id ?? ""}`,
      );
    });
    await userEvent.type(canvas.getByLabelText("From"), "2026-11-01");
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toContain("from=2026-11-01");
    });
  },
};

export const ActivityError: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: () => {
    let calls = 0;
    return withActivity(() => {
      calls += 1;
      if (calls > 1) return Response.json(activityPage(MIXED_ENTRIES));
      return Response.json(
        { code: "INTERNAL_ERROR", message: "Something went wrong." },
        { status: 500 },
      );
    })();
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("Couldn't load the activity"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(await canvas.findByText("Marked inactive")).toBeVisible();
  },
};

export const ActivityOnAPhone: Story = {
  ...ActivityMixed,
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("region", { name: "Today" }),
    ).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Type" })).toBeVisible();
  },
};
