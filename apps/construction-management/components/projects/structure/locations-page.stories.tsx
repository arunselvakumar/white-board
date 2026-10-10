import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { ProjectShell } from "../project-shell";
import { LocationsPage } from "./locations-page";
import {
  CULVERT,
  KUMARI_HEIGHTS,
  LOCATIONS_API,
  TOLL_PLAZA,
  mockStructureApi,
} from "./structure-fixtures";

let api: ReturnType<typeof mockStructureApi>;

function structureApi(options: Parameters<typeof mockStructureApi>[0] = {}) {
  return () => {
    api = mockStructureApi(options);
    return api.restore;
  };
}

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

const ALL = { create: true, update: true, delete: true };

function names(list: HTMLElement): string[] {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent ?? "");
}

const meta = {
  title: "Projects/Structure/Locations",
  component: LocationsPage,
  args: { projectId: KUMARI_HEIGHTS.id, access: ALL },
  beforeEach: structureApi(),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${KUMARI_HEIGHTS.id}/locations`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <ProjectShell id={KUMARI_HEIGHTS.id}>
        <LocationsPage {...args} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof LocationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In the Team Member's order; up and down swap with the neighbour. */
export const Reorder: Story = {
  play: async ({ canvas, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Locations" });
    await expect(names(list)).toEqual([
      "Chainage 0+000 – 2+500",
      "Culvert C3",
      "Toll plaza",
    ]);
    await expect(canvas.getByText("3 Locations")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Move Chainage 0+000 – 2+500 up" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Move Toll plaza down" }),
    ).toBeDisabled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Move Toll plaza up" }),
    );
    await waitFor(() =>
      expect(names(canvas.getByRole("list", { name: "Locations" }))).toEqual([
        "Chainage 0+000 – 2+500",
        "Toll plaza",
        "Culvert C3",
      ]),
    );
    await expect(
      calls("POST", `${LOCATIONS_API}/${TOLL_PLAZA.id}/move`)[0]?.body,
    ).toEqual({ direction: "up" });
  },
};

export const Empty: Story = {
  beforeEach: structureApi({ locations: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Name the places on this Project"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Location" }),
    ).toBeVisible();
  },
};

export const EmptyReadOnly: Story = {
  args: { access: { create: false, update: false, delete: false } },
  beforeEach: structureApi({ locations: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Locations on this Project yet"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add Location" }),
    ).toBeNull();
  },
};

/** Add: the name is required; the server's "in use" lands under the name. */
export const AddLocation: Story = {
  beforeEach: structureApi({
    locationError: {
      status: 409,
      code: "LOCATION_NAME_IN_USE",
      message: "A Location with this name already exists on this Project.",
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Location" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Location name"),
    ).toBeVisible();
    const name = dialog.getByLabelText("Location name");
    await userEvent.type(name, "Culvert C3");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(
        "A Location with this name already exists on this Project.",
      ),
    ).toBeVisible();
    await userEvent.clear(name);
    await userEvent.type(name, "Minor bridge MB1");
    await userEvent.type(
      dialog.getByLabelText("Description (optional)"),
      "Two spans",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(calls("POST", LOCATIONS_API).at(-1)?.body).toEqual({
      name: "Minor bridge MB1",
      description: "Two spans",
    });
    await expect(await canvas.findByText("Minor bridge MB1")).toBeVisible();
  },
};

/** Edit sends the `updatedAt` it loaded; Delete asks first. */
export const EditAndDelete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Culvert C3" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    let dialog = within(await body.findByRole("dialog"));
    const name = dialog.getByLabelText("Location name");
    await userEvent.clear(name);
    await userEvent.type(name, "Culvert C3 (box)");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      calls("POST", `${LOCATIONS_API}/${CULVERT.id}/update`)[0]?.body,
    ).toEqual({
      name: "Culvert C3 (box)",
      description: null,
      expectedUpdatedAt: CULVERT.updatedAt,
    });

    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Actions for Culvert C3 (box)",
      }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    dialog = within(await body.findByRole("alertdialog"));
    await expect(dialog.getByText("Delete Culvert C3 (box)?")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(canvas.queryByText("Culvert C3 (box)")).toBeNull(),
    );
  },
};
