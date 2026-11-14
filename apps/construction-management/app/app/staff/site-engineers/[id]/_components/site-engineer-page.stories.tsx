import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "@/.storybook/mocks/api";
import { signInAs } from "@/.storybook/mocks/auth";
import {
  PERSON_STORY_NOW,
  personActivityEntries,
  personActivityPage,
} from "@/app/app/_components/activity/person-activity-fixtures";
import { PERSON_ACTIVITY_EMPTY } from "@/app/app/_components/activity/person-activity";
import {
  GREEN_VALLEY,
  PROJECT_OPTIONS,
  PROJECT_OPTIONS_URL,
  SITE_ENGINEERS_URL,
  SRI_HEIGHTS,
  siteEngineer,
} from "@/app/app/staff/site-engineers/_components/site-engineer-fixtures";
import type { PersonActivityPage } from "@/src/queries/activity";

import { EditSiteEngineer } from "./edit-site-engineer";

const KARTHIK = siteEngineer();
const ONE = `${SITE_ENGINEERS_URL}/${KARTHIK.id}`;
const ACTIVITY = `${ONE}/activity`;
const ENTRIES = personActivityEntries(
  { id: SRI_HEIGHTS, name: "Sri Heights" },
  { id: GREEN_VALLEY, name: "Green Valley" },
);

let api: ReturnType<typeof mockApi> | null = null;
/** The address after each change the page made to it. */
let addresses: string[] = [];

function serve(activity: (call: { path: string }) => PersonActivityPage) {
  return () => {
    signInAs("owner", { name: "Anugraha Engineers" });
    addresses = [];
    api = mockApi((call) => {
      if (call.method !== "GET") return undefined;
      if (call.path === PROJECT_OPTIONS_URL)
        return Response.json(PROJECT_OPTIONS);
      if (call.path === ONE) return Response.json(KARTHIK);
      if (call.path === ACTIVITY || call.path.startsWith(`${ACTIVITY}?`))
        return Response.json(activity(call));
      return undefined;
    });
    return api.restore;
  };
}

/** The activity paths fetched so far, query strings included. */
function activityCalls(): string[] {
  return (api?.calls.mock.calls ?? [])
    .map(([call]) => call.path)
    .filter((path) => path.startsWith(ACTIVITY));
}

const meta = {
  title: "Human Resources/Site Engineers/Page",
  component: EditSiteEngineer,
  args: { id: KARTHIK.id, canSeeSalary: true, now: PERSON_STORY_NOW },
  render: (args, context) => (
    // Its own adapter, to read back what the page writes to the address.
    <NuqsTestingAdapter
      hasMemory
      searchParams={
        typeof context.parameters["searchParams"] === "string"
          ? context.parameters["searchParams"]
          : undefined
      }
      onUrlUpdate={(event: UrlUpdateEvent) => {
        addresses.push(event.queryString);
      }}
    >
      <StoryQueries>
        <EditSiteEngineer {...args} />
      </StoryQueries>
    </NuqsTestingAdapter>
  ),
} satisfies Meta<typeof EditSiteEngineer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabsKeepTheAddressAndTypedChanges: Story = {
  beforeEach: serve(() => personActivityPage([])),
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Name");
    await expect(
      canvas.getByRole("tab", { name: "Details", selected: true }),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Karthik R");

    await userEvent.click(canvas.getByRole("tab", { name: "Activity" }));
    await expect(await canvas.findByText(PERSON_ACTIVITY_EMPTY)).toBeVisible();
    await expect(addresses.at(-1)).toBe("?tab=activity");
    await expect(canvas.getByLabelText("Name")).not.toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Details" }));
    await expect(addresses.at(-1)).toBe("");
    // The form stayed mounted: what was typed is still there to save.
    await expect(canvas.getByLabelText("Name")).toHaveValue("Karthik R");
    await expect(canvas.getByRole("button", { name: "Save" })).toBeVisible();
  },
};

export const ActivityEmpty: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: serve(() => personActivityPage([])),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("tab", { name: "Activity", selected: true }),
    ).toBeVisible();
    await expect(await canvas.findByText(PERSON_ACTIVITY_EMPTY)).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Load more" }),
    ).toBeNull();
  },
};

export const ActivityEntries: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: serve(() => personActivityPage(ENTRIES)),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const today = within(await canvas.findByRole("region", { name: "Today" }));
    await expect(today.getByText(/^Added to/)).toHaveTextContent(
      "Added to Green Valley",
    );
    await expect(
      today.getByRole("link", { name: "Green Valley" }),
    ).toHaveAttribute("href", `/app/projects/${GREEN_VALLEY}`);

    // The night shift's Check Out sits on the day the shift began.
    const yesterday = within(canvas.getByRole("region", { name: "Yesterday" }));
    const [out, voided, inside] = yesterday.getAllByRole("listitem");
    if (out == null || voided == null || inside == null)
      throw new Error("three check-in entries yesterday");
    await expect(
      within(out).getByText("Checked out").closest("p"),
    ).toHaveTextContent("Checked out at Sri Heights · 6:05 am");
    await expect(
      within(out).getByText(/240 m outside the site fence/),
    ).toBeVisible();
    await expect(
      within(out).getByRole("link", { name: "Open in Maps" }),
    ).toHaveAttribute("href", "https://www.google.com/maps?q=13.0841,80.2705");
    await expect(
      within(inside).getByText(/Inside the site fence/),
    ).toBeVisible();
    await expect(
      within(voided).getByText("Voided: Checked in twice by mistake"),
    ).toBeVisible();
    await expect(
      within(voided).getByText("Checked in").closest("p"),
    ).toHaveClass("line-through");

    // A Project the viewer may not open is named without a link.
    await expect(canvas.getByText(/^Removed from/)).toHaveTextContent(
      "Removed from Old Mall",
    );
    await expect(canvas.queryByRole("link", { name: "Old Mall" })).toBeNull();
    await expect(
      canvas.getByRole("img", { name: "Photo removed" }),
    ).toBeVisible();
    await expect(canvas.getByText("No location")).toBeVisible();

    await userEvent.click(
      within(out).getByRole("button", {
        name: "Open the photo: Checked out at Sri Heights · 6:05 am",
      }),
    );
    await expect(await body.findByRole("dialog")).toBeVisible();
  },
};

export const ActivityTypeFilter: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: serve(() => personActivityPage(ENTRIES)),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("region", { name: "Today" });
    await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
    await expect(
      (await body.findAllByRole("option")).map((option) => option.textContent),
    ).toEqual(["All", "Projects", "Check-In"]);
    await userEvent.click(body.getByRole("option", { name: "Check-In" }));
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toBe(`${ACTIVITY}?type=check_ins`);
    });
    await expect(addresses.at(-1)).toBe("?tab=activity&type=check_ins");

    await userEvent.click(canvas.getByRole("combobox", { name: "Project" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Sri Heights" }),
    );
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toBe(
        `${ACTIVITY}?type=check_ins&projectId=${SRI_HEIGHTS}`,
      );
    });
    await userEvent.type(canvas.getByLabelText("From"), "2026-11-01");
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toContain("from=2026-11-01");
    });
  },
};

export const ActivityOnAPhone: Story = {
  ...ActivityEntries,
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("region", { name: "Today" }),
    ).toBeVisible();
    await expect(canvas.getByRole("combobox", { name: "Type" })).toBeVisible();
    await expect(canvas.getByRole("tab", { name: "Details" })).toBeVisible();
  },
};
