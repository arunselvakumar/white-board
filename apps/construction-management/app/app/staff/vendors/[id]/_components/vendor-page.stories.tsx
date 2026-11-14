import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { expect, waitFor, within } from "storybook/test";

import { mockFetch, type MockRoute } from "@/.storybook/mock-fetch";
import {
  PERSON_STORY_NOW,
  personActivityEntries,
  personActivityPage,
} from "@/app/app/_components/activity/person-activity-fixtures";
import { PERSON_ACTIVITY_EMPTY } from "@/app/app/_components/activity/person-activity";
import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";
import {
  CATEGORY_LIST,
  MUTHU_GANG,
  PROJECT_OPTIONS,
} from "@/app/app/staff/vendors/_components/vendor-fixtures";

import { VendorPage } from "./vendor-page";

const ONE = `/api/construction/labour/vendors/${MUTHU_GANG.id}`;
const ACTIVITY = `${ONE}/activity`;
const [TOWER, VILLA] = PROJECT_OPTIONS;
const ENTRIES = personActivityEntries(
  { id: TOWER?.id ?? "", name: TOWER?.name ?? "" },
  { id: VILLA?.id ?? "", name: VILLA?.name ?? "" },
);

let api: ReturnType<typeof mockFetch>;
/** The address after each change the page made to it. */
let addresses: string[] = [];

function withActivity(respond: MockRoute["respond"]) {
  return () => {
    addresses = [];
    api = mockFetch([
      {
        path: "/api/construction/projects/projects/options",
        respond: () => Response.json({ items: PROJECT_OPTIONS }),
      },
      {
        path: "/api/construction/masters/labour-categories",
        respond: () => Response.json(CATEGORY_LIST),
      },
      { path: ONE, respond: () => Response.json(MUTHU_GANG) },
      { path: ACTIVITY, respond },
    ]);
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
  title: "Masters/Vendors/Page",
  component: VendorPage,
  args: { id: MUTHU_GANG.id, now: PERSON_STORY_NOW },
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
      <StoryQueryClient>
        <VendorPage {...args} />
      </StoryQueryClient>
    </NuqsTestingAdapter>
  ),
} satisfies Meta<typeof VendorPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TabsKeepTheAddressAndTypedChanges: Story = {
  beforeEach: withActivity(() => Response.json(personActivityPage([]))),
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Vendor name");
    await expect(
      canvas.getByRole("tab", { name: "Details", selected: true }),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Muthu Gang (Nagercoil)");

    await userEvent.click(canvas.getByRole("tab", { name: "Activity" }));
    await expect(await canvas.findByText(PERSON_ACTIVITY_EMPTY)).toBeVisible();
    await expect(addresses.at(-1)).toBe("?tab=activity");
    await expect(canvas.getByLabelText("Vendor name")).not.toBeVisible();

    await userEvent.click(canvas.getByRole("tab", { name: "Details" }));
    await expect(addresses.at(-1)).toBe("");
    // The form stayed mounted: what was typed is still there to save.
    await expect(canvas.getByLabelText("Vendor name")).toHaveValue(
      "Muthu Gang (Nagercoil)",
    );
    await expect(canvas.getByRole("button", { name: "Save" })).toBeVisible();
  },
};

export const ActivityEmpty: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: withActivity(() => Response.json(personActivityPage([]))),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("tab", { name: "Activity", selected: true }),
    ).toBeVisible();
    await expect(await canvas.findByText(PERSON_ACTIVITY_EMPTY)).toBeVisible();
  },
};

export const ActivityEntries: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: withActivity(() => Response.json(personActivityPage(ENTRIES))),
  play: async ({ canvas }) => {
    const today = within(await canvas.findByRole("region", { name: "Today" }));
    await expect(today.getByText(/^Added to/)).toHaveTextContent(
      `Added to ${VILLA?.name ?? ""}`,
    );
    const yesterday = within(canvas.getByRole("region", { name: "Yesterday" }));
    const [out, voided, inside] = yesterday.getAllByRole("listitem");
    if (out == null || voided == null || inside == null)
      throw new Error("three check-in entries yesterday");
    await expect(
      within(out).getByText("Checked out").closest("p"),
    ).toHaveTextContent(`Checked out at ${TOWER?.name ?? ""} · 6:05 am`);
    await expect(
      within(out).getByRole("link", { name: "Open in Maps" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      within(inside).getByText(/Inside the site fence/),
    ).toBeVisible();
    await expect(
      within(voided).getByText("Voided: Checked in twice by mistake"),
    ).toBeVisible();
    await expect(
      within(voided).getByText("Checked in").closest("p"),
    ).toHaveClass("line-through");
    await expect(canvas.getByText(/^Removed from/)).toHaveTextContent(
      "Removed from Old Mall",
    );
    await expect(
      canvas.getByRole("img", { name: "Photo removed" }),
    ).toBeVisible();
  },
};

export const ActivityTypeFilter: Story = {
  parameters: { searchParams: "?tab=activity" },
  beforeEach: withActivity(() => Response.json(personActivityPage(ENTRIES))),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("region", { name: "Today" });
    await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
    await expect(
      (await body.findAllByRole("option")).map((option) => option.textContent),
    ).toEqual(["All", "Projects", "Check-In"]);
    await userEvent.click(body.getByRole("option", { name: "Projects" }));
    await waitFor(async () => {
      await expect(activityCalls().at(-1)).toBe(`${ACTIVITY}?type=projects`);
    });
    await expect(addresses.at(-1)).toBe("?tab=activity&type=projects");
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
    await expect(canvas.getByRole("tab", { name: "Activity" })).toBeVisible();
  },
};
