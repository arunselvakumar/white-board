import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { DevelopmentItem } from "@/src/queries/developments";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { AmenitiesList, CommonDevelopmentsList } from "./developments-list";
import { chooseFromMenu } from "./masters-story-support";

const AMENITIES = "/api/construction/masters/amenities";
const COMMON = "/api/construction/masters/common-developments";
const OPTIONS = "/api/construction/projects/projects/options";
const AT = "2026-10-08T06:30:00.000Z";

const KUMARI = "0199c4a0-0000-7000-8000-000000000001";
const ZEN = "0199c4a0-0000-7000-8000-000000000005";

const PROJECT_OPTIONS = {
  items: [
    { id: KUMARI, name: "Kumari Heights", status: "ongoing" },
    { id: ZEN, name: "Zen Villas", status: "completed" },
  ],
};

function row(
  n: number,
  name: string,
  extra: Partial<DevelopmentItem> = {},
): DevelopmentItem {
  return {
    id: `0199a1b2-0000-7000-8000-0000000006${String(n).padStart(2, "0")}`,
    name,
    isSeed: true,
    disabled: false,
    projectIds: [],
    createdAt: AT,
    updatedAt: AT,
    ...extra,
  };
}

const STORY_AMENITIES: DevelopmentItem[] = [
  row(1, "Swimming Pool", { projectIds: [KUMARI, ZEN] }),
  row(2, "Club House", { projectIds: [KUMARI] }),
  row(3, "Gymnasium", { disabled: true }),
  row(4, "Tennis Court", { isSeed: false }),
];

let api: ReturnType<typeof mockApi>;

/** An in-memory Amenities list with its Projects. */
function serve(base: string, initial: DevelopmentItem[]) {
  return () => {
    let items = [...initial];
    api = mockApi(({ method, path, body }) => {
      if (method === "GET" && path === OPTIONS)
        return Response.json(PROJECT_OPTIONS);
      if (method === "GET" && path === base)
        return Response.json({ items, total: items.length });
      const fields = (body ?? {}) as Record<string, unknown>;
      if (method === "POST" && path === base) {
        const created = row(9, String(fields["name"]).trim(), {
          isSeed: false,
          projectIds: (fields["projectIds"] as string[] | undefined) ?? [],
        });
        items = [...items, created];
        return Response.json(created, { status: 201 });
      }
      const [, id, verb] = /\/([^/]+)\/(\w+)$/.exec(path) ?? [];
      const current = items.find((item) => item.id === id);
      if (current == null) return undefined;
      const replace = (next: DevelopmentItem) => {
        items = items.map((item) => (item.id === next.id ? next : item));
        return Response.json(next);
      };
      switch (verb) {
        case "projects":
          return replace({
            ...current,
            projectIds: fields["projectIds"] as string[],
          });
        case "disable":
        case "enable":
          return replace({ ...current, disabled: verb === "disable" });
        case "delete":
          if (current.projectIds.length > 0)
            return Response.json(
              {
                code: "AMENITY_IN_USE",
                message:
                  "Projects are assigned this Amenity, so it cannot be deleted. Remove it from those Projects or disable it instead.",
              },
              { status: 409 },
            );
          items = items.filter((item) => item.id !== current.id);
          return new Response(null, { status: 204 });
        default:
          return undefined;
      }
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Amenities/List",
  component: AmenitiesList,
  beforeEach: serve(AMENITIES, STORY_AMENITIES),
  render: () => (
    <StoryQueries>
      <AmenitiesList />
    </StoryQueries>
  ),
} satisfies Meta<typeof AmenitiesList>;

export default meta;
type Story = StoryObj<typeof meta>;

function rowNamed(list: HTMLElement, name: string): HTMLElement {
  const found = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("p")?.textContent === name);
  if (found == null) throw new Error(`No row ${name}`);
  return found;
}

export const WithAmenities: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Amenities" });
    await expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.querySelector("p")?.textContent),
    ).toEqual(["Club House", "Gymnasium", "Swimming Pool", "Tennis Court"]);
    const pool = rowNamed(list, "Swimming Pool");
    await expect(pool).toHaveTextContent("On Kumari Heights, Zen Villas");
    await expect(within(pool).getByText("Default")).toBeVisible();
    await expect(rowNamed(list, "Tennis Court")).toHaveTextContent(
      "Not on any Project",
    );
    await expect(
      within(rowNamed(list, "Gymnasium")).getByText("Disabled"),
    ).toBeVisible();

    // A Default row can be assigned and disabled, not renamed or deleted.
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Swimming Pool" }),
    );
    await expect(
      await body.findByRole("menuitem", { name: "Assign Projects" }),
    ).toBeVisible();
    await expect(body.queryByRole("menuitem", { name: "Rename" })).toBeNull();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).toBeNull());
  },
};

export const AddWithProjects: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Amenities" });
    await userEvent.click(canvas.getByRole("button", { name: "Add Amenity" }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Amenity name"),
    ).toBeVisible();
    await userEvent.type(dialog.getByLabelText("Amenity name"), "Party Lawn");
    await userEvent.click(dialog.getByRole("checkbox", { name: /Zen Villas/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    const created = api.calls.mock.calls.find(
      ([call]) => call.method === "POST" && call.path === AMENITIES,
    );
    await expect(created?.[0].body).toEqual({
      name: "Party Lawn",
      projectIds: [ZEN],
    });
    const list = canvas.getByRole("list", { name: "Amenities" });
    await waitFor(() =>
      expect(rowNamed(list, "Party Lawn")).toHaveTextContent("On Zen Villas"),
    );
  },
};

export const AssignProjects: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Amenities" });
    await chooseFromMenu(
      canvasElement,
      userEvent,
      "Club House",
      "Assign Projects",
    );
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByRole("heading", { name: "Projects with Club House" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: /Kumari Heights/ }),
    ).toBeChecked();
    await userEvent.click(dialog.getByRole("checkbox", { name: /Zen Villas/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    const assigned = api.calls.mock.calls.find(([call]) =>
      call.path.endsWith("/projects"),
    );
    await expect(assigned?.[0].body).toEqual({ projectIds: [KUMARI, ZEN] });
    await waitFor(() =>
      expect(
        rowNamed(canvas.getByRole("list", { name: "Amenities" }), "Club House"),
      ).toHaveTextContent("On Kumari Heights, Zen Villas"),
    );
  },
};

export const DeleteWhileAssigned: Story = {
  beforeEach: serve(AMENITIES, [
    row(4, "Tennis Court", { isSeed: false, projectIds: [KUMARI] }),
  ]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Amenities" });
    await chooseFromMenu(canvasElement, userEvent, "Tennis Court", "Delete");
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(
      await dialog.findByText(/Remove it from those Projects/),
    ).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: serve(AMENITIES, []),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Amenities yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add Amenity" }),
    ).toHaveLength(2);
  },
};

export const CommonDevelopments: Story = {
  beforeEach: serve(COMMON, [
    row(11, "Compound Wall", { projectIds: [KUMARI] }),
    row(12, "Internal Roads"),
  ]),
  render: () => (
    <StoryQueries>
      <CommonDevelopmentsList />
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Common Developments" }),
    ).toBeVisible();
    const list = canvas.getByRole("list", { name: "Common Developments" });
    await expect(rowNamed(list, "Compound Wall")).toHaveTextContent(
      "On Kumari Heights",
    );
    await expect(
      canvas.getByRole("button", { name: "Add Common Development" }),
    ).toBeVisible();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Amenities" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
