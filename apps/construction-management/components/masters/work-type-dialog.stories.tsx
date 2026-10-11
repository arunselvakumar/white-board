import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { STORY_DEPARTMENTS } from "./masters-story-support";
import { WorkTypeDialog } from "./work-type-dialog";
import { STORY_WORK_TYPES, workTypesHandler } from "./work-type-fixtures";

let api: ReturnType<typeof mockApi>;

function posted(path: string): unknown {
  return api.calls.mock.calls
    .map(([call]) => call)
    .find((call: ApiCall) => call.method === "POST" && call.path.endsWith(path))
    ?.body;
}

const RCC_SEED = STORY_WORK_TYPES[0] ?? null;
const COLUMN = STORY_WORK_TYPES[1] ?? null;
const RCC = STORY_DEPARTMENTS.find((item) => item.name === "RCC");

const meta = {
  title: "Masters/Work Types/Form",
  component: WorkTypeDialog,
  args: { item: null, onClose: fn() },
  render: (args) => (
    <StoryQueries>
      <WorkTypeDialog {...args} />
    </StoryQueries>
  ),
  beforeEach: () => {
    api = mockApi(workTypesHandler());
    return api.restore;
  },
} satisfies Meta<typeof WorkTypeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Add: required fields first, then a Department and two Materials. */
export const AddValidatesAndSaves: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the Work Type name"),
    ).toBeVisible();
    await expect(dialog.getByText("Choose a Department")).toBeVisible();
    await expect(dialog.getByText("No Materials assigned.")).toBeVisible();

    await userEvent.type(
      dialog.getByLabelText("Work Type name"),
      "Slab casting",
    );
    await userEvent.click(dialog.getByLabelText("Department"));
    await userEvent.click(await body.findByRole("option", { name: "RCC" }));
    await userEvent.click(dialog.getByLabelText("Add a Material"));
    await userEvent.click(
      await body.findByRole("option", { name: /Cement OPC 53 Grade/ }),
    );
    await userEvent.click(dialog.getByLabelText("Add a Material"));
    await userEvent.click(
      await body.findByRole("option", { name: /TMT Steel Bar 12 mm/ }),
    );
    const assigned = within(
      dialog.getByRole("list", { name: "Assigned Materials" }),
    );
    await expect(assigned.getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(
      assigned.getByRole("button", { name: "Remove TMT Steel Bar 12 mm" }),
    );
    await expect(assigned.getAllByRole("listitem")).toHaveLength(1);

    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted("/work-types")).toEqual({
      name: "Slab casting",
      departmentId: RCC?.id,
      materialIds: ["0199c4a0-0000-7000-8000-00000000a001"],
    });
  },
};

/** A taken name comes back under the name field. */
export const NameInUse: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Work Type name"), "brick work");
    await userEvent.click(dialog.getByLabelText("Department"));
    await userEvent.click(
      await body.findByRole("option", { name: "Plumbing" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("A Work Type with this name already exists."),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Work Type name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

/** Edit: the loaded Materials show; the update carries `updatedAt`. */
export const EditSendsLoadedUpdatedAt: Story = {
  args: { item: COLUMN },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByRole("heading", { name: "Edit Column casting" }),
    ).toBeVisible();
    const assigned = within(
      dialog.getByRole("list", { name: "Assigned Materials" }),
    );
    await userEvent.click(
      assigned.getByRole("button", { name: "Remove Cement OPC 53 Grade" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted(`${String(COLUMN?.id)}/update`)).toEqual({
      name: "Column casting",
      departmentId: COLUMN?.departmentId,
      materialIds: ["0199c4a0-0000-7000-8000-00000000a002"],
      expectedUpdatedAt: COLUMN?.updatedAt,
    });
  },
};

/** The Default Work Type keeps its name and Department; Materials change. */
export const EditDefault: Story = {
  args: { item: RCC_SEED },
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByText(
        "This Default Work Type keeps its name and Department. You can change its Materials.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Work Type name")).toHaveAttribute(
      "readonly",
    );
    await expect(dialog.getByLabelText("Department")).toBeDisabled();
    await userEvent.click(dialog.getByLabelText("Add a Material"));
    await userEvent.click(await body.findByRole("option", { name: /M Sand/ }));
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(posted(`${String(RCC_SEED?.id)}/update`)).toMatchObject({
      name: "RCC",
      materialIds: ["0199c4a0-0000-7000-8000-00000000a003"],
    });
  },
};
