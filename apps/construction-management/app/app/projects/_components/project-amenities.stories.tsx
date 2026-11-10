import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type { ProjectDevelopments } from "@/src/queries/developments";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI } from "./project-fixtures";
import { ProjectAmenities } from "./project-amenities";

const PATH = `/api/construction/projects/projects/${KUMARI.id}/developments`;

const id = (n: number) =>
  `0199a1b2-0000-7000-8000-0000000006${String(n).padStart(2, "0")}`;

const POOL = { id: id(1), name: "Swimming Pool", disabled: false };
const CLUB = { id: id(2), name: "Club House", disabled: false };
const GYM = { id: id(3), name: "Gymnasium", disabled: true };
const WALL = { id: id(11), name: "Compound Wall", disabled: false };
const ROADS = { id: id(12), name: "Internal Roads", disabled: false };

const DEVELOPMENTS: ProjectDevelopments = {
  amenities: { assigned: [GYM, POOL], choices: [CLUB, POOL] },
  commonDevelopments: { assigned: [], choices: [WALL, ROADS] },
};

let api: ReturnType<typeof mockApi>;

function serve(initial: ProjectDevelopments) {
  return () => {
    let current = initial;
    api = mockApi(({ method, path, body }) => {
      if (method === "GET" && path === PATH) return Response.json(current);
      if (method === "POST" && path === `${PATH}/update`) {
        const input = body as {
          amenityIds: string[];
          commonDevelopmentIds: string[];
        };
        const pick = (ids: string[], rows: typeof current.amenities) =>
          [...rows.assigned, ...rows.choices].filter(
            (row, index, all) =>
              ids.includes(row.id) &&
              all.findIndex((other) => other.id === row.id) === index,
          );
        current = {
          amenities: {
            ...current.amenities,
            assigned: pick(input.amenityIds, current.amenities),
          },
          commonDevelopments: {
            ...current.commonDevelopments,
            assigned: pick(
              input.commonDevelopmentIds,
              current.commonDevelopments,
            ),
          },
        };
        return Response.json(current);
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Projects/Amenities",
  component: ProjectAmenities,
  args: { projectId: KUMARI.id, canEdit: true },
  beforeEach: serve(DEVELOPMENTS),
  render: (args) => (
    <StoryQueries>
      <ProjectAmenities {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectAmenities>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TickAndSave: Story = {
  play: async ({ canvas, userEvent }) => {
    const amenities = within(
      await canvas.findByRole("region", { name: "Amenities" }),
    );
    // What the Project has (a disabled one too) and what can be added.
    await expect(
      amenities
        .getAllByRole("checkbox")
        .map((box) => box.closest("label")?.textContent),
    ).toEqual(["Club House", "GymnasiumDisabled", "Swimming Pool"]);
    await expect(
      amenities.getByRole("checkbox", { name: /Gymnasium/ }),
    ).toBeChecked();
    await expect(amenities.getByText("Disabled")).toBeVisible();
    const save = canvas.getByRole("button", { name: "Save" });
    await expect(save).toBeDisabled();

    await userEvent.click(
      amenities.getByRole("checkbox", { name: /Club House/ }),
    );
    const common = within(
      canvas.getByRole("region", { name: "Common Developments" }),
    );
    await userEvent.click(
      common.getByRole("checkbox", { name: /Compound Wall/ }),
    );
    await userEvent.click(save);
    await expect(await canvas.findByText("Saved.")).toBeVisible();
    const posted = api.calls.mock.calls.find(
      ([call]) => call.method === "POST",
    );
    await expect(posted?.[0].body).toEqual({
      amenityIds: [CLUB.id, GYM.id, POOL.id],
      commonDevelopmentIds: [WALL.id],
    });
    await waitFor(() => expect(save).toBeDisabled());
  },
};

export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async ({ canvas }) => {
    const amenities = within(
      await canvas.findByRole("region", { name: "Amenities" }),
    );
    await expect(amenities.queryByRole("checkbox")).toBeNull();
    await expect(amenities.getByText("Swimming Pool")).toBeVisible();
    await expect(
      canvas.getByText("This Project has no Common Developments yet."),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Save" })).toBeNull();
  },
};

export const NothingInMasters: Story = {
  beforeEach: serve({
    amenities: { assigned: [], choices: [] },
    commonDevelopments: { assigned: [], choices: [] },
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Amenities in Masters"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open Common Developments" }),
    ).toHaveAttribute("href", "/app/masters/common-developments");
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("region", { name: "Amenities" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
