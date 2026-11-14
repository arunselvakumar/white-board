import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { storyHome } from "@/app/app/_components/projects/project-home-fixtures";
import { CHECK_INS_PATH, type CheckInPeople } from "@/src/queries/check-ins";

import { mockApi, StoryQueries } from "@/.storybook/mocks/api";
import {
  CheckInFindPage,
  READ_ONLY_LINE,
  SEARCH_PLACEHOLDER,
} from "./check-in-find-page";
import {
  DHURESH,
  KAVITHA,
  MURUGAN,
  PROJECT_ID,
  RAVI,
  peopleResponse,
} from "./check-in-fixtures";

const PEOPLE = `${CHECK_INS_PATH}/people?projectId=${PROJECT_ID}`;
const HOME = `/api/construction/projects/projects/${PROJECT_ID}/home`;

/** Serves the people (and the Project home, so Teams can be offered). */
function serve(people: CheckInPeople = peopleResponse()) {
  return () => {
    const api = mockApi((call) => {
      if (call.method === "GET" && call.path === PEOPLE)
        return Response.json(people);
      if (call.method === "GET" && call.path === HOME)
        return Response.json(storyHome());
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Attendance/Check-In/Find",
  component: CheckInFindPage,
  args: { projectId: PROJECT_ID },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <CheckInFindPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof CheckInFindPage>;

export default meta;
type Story = StoryObj<typeof meta>;

type Canvas = Parameters<NonNullable<Story["play"]>>[0]["canvas"];

function group(canvas: Canvas, name: string) {
  return within(canvas.getByRole("region", { name }));
}

const KNOWN = [
  "Ravi Shankar",
  "Priya Dharshini",
  "Murugan Ganesan",
  "Kavitha Murugan",
  "Dhuresh Nawin",
  "Anbu Selvan",
  "Raja Fabricators",
  "Selvam Shuttering Works",
];

/** The names of the people a group lists, in order. */
function names(canvas: Canvas, name: string): (string | undefined)[] {
  const list = canvas
    .getByRole("region", { name })
    .querySelector<HTMLElement>(`ul[aria-label="${name}"]`);
  return list == null
    ? []
    : within(list)
        .getAllByRole("link")
        .map((link) => KNOWN.find((known) => link.textContent.includes(known)));
}

/**
 * The three groups, all open, with their counts; each person shows role,
 * ID and phone, and today's state as a chip. The search box has focus.
 */
export const Loaded: Story = {
  play: async ({ canvas }) => {
    const search = canvas.getByRole("searchbox", { name: "Search people" });
    await expect(search).toHaveAttribute("placeholder", SEARCH_PLACEHOLDER);
    await waitFor(() => expect(search).toHaveFocus());
    await canvas.findByRole("region", { name: "Labours" });
    await expect(
      canvas
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Site Engineers · 2 · 1 in",
      "Labours · 4 · 1 in",
      "Vendors · 2 · 1 in",
    ]);
    const labours = group(canvas, "Labours");
    const murugan = labours.getByRole("link", { name: /Murugan Ganesan/ });
    await expect(murugan).toHaveTextContent(
      "Murugan GanesanMason · L-0042 · +91 98765 43210In · 10:02 am",
    );
    await expect(murugan).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/attendance/check-in/labour/${MURUGAN.id}`,
    );
    await expect(
      labours.getByRole("link", { name: /Kavitha Murugan/ }),
    ).toHaveTextContent("Out · 1:05 pm");
    await expect(
      labours.getByRole("link", { name: /Dhuresh Nawin/ }),
    ).not.toHaveTextContent(/In ·|Out ·/);
    await expect(
      group(canvas, "Site Engineers").getByRole("link", {
        name: /Ravi Shankar/,
      }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/attendance/check-in/site-engineer/${RAVI.id}`,
    );
    await expect(canvas.getByRole("link", { name: "Log" })).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/attendance/check-in/log`,
    );
  },
};

/** A group folds and opens again from its header. */
export const GroupFolds: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("region", { name: "Labours" });
    const header = canvas.getByRole("button", { name: /^Labours/ });
    await expect(header).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(header);
    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: /Murugan Ganesan/ }),
      ).toBeNull(),
    );
    await userEvent.click(header);
    await expect(
      await canvas.findByRole("link", { name: /Murugan Ganesan/ }),
    ).toBeVisible();
  },
};

/**
 * Typing part of a name filters every group, ignoring case, and keeps the
 * text for the capture screen's Back; a group with nobody left says so.
 */
export const SearchByName: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("region", { name: "Labours" });
    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search people" }),
      "MURUGAN",
    );
    await waitFor(() =>
      expect(names(canvas, "Labours")).toEqual([
        "Murugan Ganesan",
        "Kavitha Murugan",
      ]),
    );
    await expect(
      group(canvas, "Site Engineers").getByText("No match"),
    ).toBeVisible();
    await expect(
      group(canvas, "Labours").getByRole("link", { name: /Murugan Ganesan/ }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${PROJECT_ID}/attendance/check-in/labour/${MURUGAN.id}?q=MURUGAN`,
    );
    // Counts are the group's, not the match's.
    await expect(
      canvas.getByRole("heading", { name: "Labours · 4 · 1 in" }),
    ).toBeVisible();
  },
};

/** Digits find the phone however it was typed: spaces, +91, a leading 0. */
export const SearchByPhoneDigits: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("region", { name: "Labours" });
    const search = canvas.getByRole("searchbox", { name: "Search people" });
    await userEvent.type(search, "0770 889");
    await waitFor(() =>
      expect(names(canvas, "Labours")).toEqual([DHURESH.name]),
    );
    await userEvent.clear(search);
    await userEvent.type(search, "+91 95000");
    await waitFor(() =>
      expect(names(canvas, "Labours")).toEqual([KAVITHA.name]),
    );
    // Two digits are not a phone search.
    await userEvent.clear(search);
    await userEvent.type(search, "95");
    await expect(await canvas.findByText(/^Nobody matches/)).toBeVisible();
  },
};

/** Back from the capture screen: the typed text is in the address. */
export const SearchKeptInAddress: Story = {
  parameters: { searchParams: "q=ravi" },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("searchbox", { name: "Search people" }),
    ).toHaveValue("ravi");
    await waitFor(() =>
      expect(names(canvas, "Site Engineers")).toEqual(["Ravi Shankar"]),
    );
  },
};

/** Nothing anywhere: one empty state, and Clear search brings everyone back. */
export const NoMatch: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("region", { name: "Labours" });
    const search = canvas.getByRole("searchbox", { name: "Search people" });
    await userEvent.type(search, "Zakir");
    await expect(
      await canvas.findByText("Nobody matches “Zakir”"),
    ).toBeVisible();
    await expect(canvas.queryByRole("region", { name: "Labours" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(search).toHaveValue("");
    await expect(
      await canvas.findByRole("link", { name: /Murugan Ganesan/ }),
    ).toBeVisible();
  },
};

/** The clear button in the box empties it and keeps focus there. */
export const ClearButton: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("region", { name: "Labours" });
    const search = canvas.getByRole("searchbox", { name: "Search people" });
    await expect(
      canvas.queryByRole("button", { name: "Clear the search" }),
    ).toBeNull();
    await userEvent.type(search, "kav");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear the search" }),
    );
    await expect(search).toHaveValue("");
    await expect(search).toHaveFocus();
  },
};

/** A group with nobody on the Project says so and offers Teams. */
export const GroupWithNobody: Story = {
  beforeEach: serve(peopleResponse({ vendors: [] })),
  play: async ({ canvas }) => {
    const vendors = within(
      await canvas.findByRole("region", { name: "Vendors" }),
    );
    await expect(
      canvas.getByRole("heading", { name: "Vendors · 0 · 0 in" }),
    ).toBeVisible();
    await expect(vendors.getByText(/No Vendors on this Project/)).toBeVisible();
    await expect(
      await vendors.findByRole("link", { name: "Add them on Teams" }),
    ).toHaveAttribute("href", `/app/projects/${PROJECT_ID}/teams`);
  },
};

/** Without Attendance Create: people are listed, not links, and one line says why. */
export const ReadOnly: Story = {
  beforeEach: serve(peopleResponse({ canCheckIn: false, canVoid: false })),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(READ_ONLY_LINE)).toBeVisible();
    await expect(canvas.getByText("Murugan Ganesan")).toBeVisible();
    await expect(
      canvas.queryByRole("link", { name: /Murugan Ganesan/ }),
    ).toBeNull();
    await expect(canvas.getByRole("link", { name: "Log" })).toBeVisible();
  },
};

/** While the people load: the search box is already there, the groups are skeletons. */
export const Loading: Story = {
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = () => new Promise<Response>(() => undefined);
    return () => {
      globalThis.fetch = original;
    };
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("searchbox", { name: "Search people" }),
    ).toBeVisible();
    await expect(await canvas.findByText("Loading people")).toBeInTheDocument();
  },
};

/** 375 px: one column, no sideways scroll. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("region", { name: "Labours" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
    const cards = canvas
      .getAllByRole("link", { name: /Murugan|Kavitha/ })
      .map((card) => card.getBoundingClientRect());
    const [first, second] = cards;
    // Stacked, full width, and at least 64 px tall.
    await expect(second?.top).toBeGreaterThan(first?.bottom ?? 0);
    await expect(first?.height).toBeGreaterThanOrEqual(64);
  },
};

/** The same in the dark theme. */
export const Dark: Story = {
  globals: { theme: "dark" },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: /Murugan Ganesan/ }),
    ).toBeVisible();
  },
};
