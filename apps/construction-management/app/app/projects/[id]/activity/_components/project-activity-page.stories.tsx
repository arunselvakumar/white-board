import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";

import { mockFetch, type MockRoute } from "@/.storybook/mock-fetch";
import {
  PROJECT_ENTRIES,
  PROJECT_ID,
  STORY_NOW,
  additions,
  projectActivityPage,
} from "./project-activity-fixtures";
import {
  PROJECT_ACTIVITY_EMPTY,
  ProjectActivityPage,
} from "./project-activity-page";

const ACTIVITY = `/api/construction/projects/projects/${PROJECT_ID}/activity`;

let api: ReturnType<typeof mockFetch>;

function serve(respond: MockRoute["respond"]) {
  return () => {
    api = mockFetch([{ path: ACTIVITY, respond }]);
    return api.restore;
  };
}

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
  title: "Projects/Activity",
  component: ProjectActivityPage,
  args: { projectId: PROJECT_ID, now: STORY_NOW },
  render: (args) => (
    <StoryQueryClient>
      <ProjectActivityPage {...args} />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof ProjectActivityPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  beforeEach: serve(() => Response.json(projectActivityPage([]))),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Activity", level: 1 }),
    ).toBeVisible();
    await expect(await canvas.findByText(PROJECT_ACTIVITY_EMPTY)).toBeVisible();
  },
};

export const Mixed: Story = {
  beforeEach: serve(() => Response.json(projectActivityPage(PROJECT_ENTRIES))),
  play: async ({ canvas, userEvent }) => {
    const today = await canvas.findByRole("region", { name: "Today" });
    await expect(
      within(today).getByRole("link", { name: "Karthik Raja" }),
    ).toHaveAttribute(
      "href",
      "/app/staff/site-engineers/0199a1b2-0000-7000-8000-00000000e001",
    );
    // Deleted, or not the viewer's to open: named without a link.
    await expect(within(today).getByText("Meena")).toBeVisible();
    await expect(
      within(today).queryByRole("link", { name: "Meena" }),
    ).toBeNull();
    await expect(
      canvas.getByText("L-001 · Mason · Work finished"),
    ).toBeVisible();
    await expect(canvas.queryByRole("link", { name: "Selvi" })).toBeNull();
    await expect(canvas.getByText(/transferred out to/)).toHaveTextContent(
      "Selvi transferred out to Green Park",
    );
    await expect(canvas.getByText(/transferred in from/)).toHaveTextContent(
      "2 Labours transferred in from Green Park",
    );

    // A batch is one entry that opens to the names.
    await expect(canvas.getByText(/^12 Labours$/)).toBeVisible();
    await expect(canvas.getByText("New gang")).toBeVisible();
    const names = canvas.getAllByRole("button", { name: "Show names" });
    const batchNames = names.at(-1);
    if (batchNames != null) await userEvent.click(batchNames);
    await expect(
      await canvas.findByRole("link", { name: "Naveen" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/staff\/labours\//) as string,
    );
  },
};

export const LoadMore: Story = {
  beforeEach: () => {
    let calls = 0;
    return serve(() => {
      calls += 1;
      return Response.json(
        calls === 1
          ? projectActivityPage(additions(30), "next-page")
          : projectActivityPage(additions(5, 30)),
      );
    })();
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Load more" }),
    );
    await waitFor(async () => {
      await expect(canvas.getAllByRole("listitem")).toHaveLength(35);
    });
    await expect(activityCalls().at(-1)).toContain("cursor=next-page");
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

export const FilterByWho: Story = {
  parameters: { searchParams: "?from=2026-11-01" },
  beforeEach: serve(() => Response.json(projectActivityPage(PROJECT_ENTRIES))),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("region", { name: "Today" });
    await expect(activityCalls()[0]).toContain("from=2026-11-01");
    await expect(canvas.getByLabelText("From")).toHaveValue("2026-11-01");
    await userEvent.click(canvas.getByRole("combobox", { name: "Who" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Site Engineers" }),
    );
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toContain("who=site_engineers");
    });
  },
};

export const OnAPhone: Story = {
  ...Mixed,
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("region", { name: "Today" }),
    ).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Who" })).toBeVisible();
  },
};
