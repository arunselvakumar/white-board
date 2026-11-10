import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Label } from "@repo/ui/components/label";

import type { MaterialOption } from "@/src/queries/material-options";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import {
  CATEGORY_OPTIONS,
  CREATED_MATERIAL_ID,
  MATERIAL_OPTIONS,
  materialCreateHandler,
  materialOptionsHandler,
  UNIT_OPTIONS,
  type MaterialCreateOptions,
} from "./material-options-fixtures";
import { MaterialPicker, type MaterialPickerProps } from "./material-picker";

const [CEMENT, STEEL, , PAINT] = MATERIAL_OPTIONS as [
  MaterialOption,
  MaterialOption,
  MaterialOption,
  MaterialOption,
];
const NOS = UNIT_OPTIONS.find((unit) => unit.name === "Nos");
const BRICKS = CATEGORY_OPTIONS.find((item) => item.name === "Bricks & Blocks");

let api: ReturnType<typeof mockApi>;

function serve(create: MaterialCreateOptions = {}) {
  return () => {
    api = mockApi(
      (call) =>
        materialOptionsHandler(call) ?? materialCreateHandler(call, create),
    );
    return api.restore;
  };
}

type HarnessProps = Omit<MaterialPickerProps, "value" | "onChange"> & {
  initial?: string | null;
  onChange: (material: MaterialOption | null) => void;
  /** The procurement form around the picker. */
  onSubmitForm: () => void;
};

/** The picker on a procurement line, inside the line's form. */
function Harness({
  initial = null,
  onChange,
  onSubmitForm,
  ...props
}: HarnessProps) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <form
      className="w-full p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmitForm();
      }}
    >
      <div className="w-full max-w-md space-y-2">
        <Label htmlFor="line-material">Material</Label>
        <MaterialPicker
          id="line-material"
          {...props}
          value={value}
          onChange={(material) => {
            setValue(material?.id ?? null);
            onChange(material);
          }}
        />
        <p className="text-muted-foreground text-xs">
          Chosen id: <output aria-label="Chosen id">{value ?? "none"}</output>
        </p>
      </div>
    </form>
  );
}

const meta = {
  title: "Procurement/MaterialPicker",
  component: Harness,
  args: { onChange: fn(), onSubmitForm: fn() },
  beforeEach: serve(),
  render: (args) => (
    <StoryQueries>
      <Harness {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The picker's reads, as their decoded query strings. */
const optionReads = () =>
  api.calls.mock.calls
    .map(([call]) => call.path)
    .filter((path) =>
      path.startsWith("/api/construction/masters/materials/options"),
    )
    .map((path) =>
      Object.fromEntries(new URL(path, "http://storybook.local").searchParams),
    );

export const SearchAndPick: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox", { name: "Material" });
    await userEvent.click(input);
    const list = within(
      await body.findByRole("listbox", { name: "Materials" }),
    );
    // Name, then specification · unit · category.
    await expect(
      await list.findByRole("option", { name: /^Cement OPC 53 Grade/ }),
    ).toHaveTextContent(
      "Cement OPC 53 GradeUltraTech, 50 kg bag · Bag · Civil Work Materials",
    );
    await expect(list.getAllByRole("option")).toHaveLength(4);

    // The server searches name or specification.
    await userEvent.type(input, "fe 550");
    await waitFor(() =>
      expect(optionReads()).toContainEqual({ search: "fe 550" }),
    );
    await waitFor(() => expect(list.getAllByRole("option")).toHaveLength(1));
    await userEvent.click(
      list.getByRole("option", { name: /^TMT Steel Bar 12 mm/ }),
    );
    await expect(args.onChange).toHaveBeenLastCalledWith(STEEL);
    await expect(input).toHaveValue("TMT Steel Bar 12 mm");
    await expect(canvas.getByLabelText("Chosen id")).toHaveTextContent(
      STEEL.id,
    );
    // The pick is remembered: no read by id.
    await expect(optionReads().some((read) => "ids" in read)).toBe(false);
  },
};

export const ShowsTheChosenMaterial: Story = {
  args: { initial: PAINT.id },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Material" });
    await waitFor(() =>
      expect(input).toHaveValue("Asian Paints Apex Exterior Emulsion"),
    );
    // Loaded by id, before (and without) any search.
    await expect(optionReads()).toEqual([{ ids: PAINT.id }]);
  },
};

export const LeavesOutLinesAlreadyOnTheForm: Story = {
  args: { initial: STEEL.id, excludeIds: [CEMENT.id, STEEL.id] },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox", { name: "Material" });
    await waitFor(() => expect(input).toHaveValue("TMT Steel Bar 12 mm"));
    await userEvent.click(input);
    const list = within(
      await body.findByRole("listbox", { name: "Materials" }),
    );
    await waitFor(() => expect(list.getAllByRole("option")).toHaveLength(3));
    // This line's own Material stays; another line's is left out.
    await expect(
      list.getAllByRole("option").map((option) => option.textContent),
    ).toEqual([
      expect.stringMatching(/^TMT Steel Bar 12 mm/),
      expect.stringMatching(/^M Sand/),
      expect.stringMatching(/^Asian Paints/),
    ]);
    await expect(list.queryByRole("option", { name: /^Cement/ })).toBeNull();
  },
};

export const NothingMatches: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox", { name: "Material" });
    await userEvent.click(input);
    await body.findByRole("option", { name: /^M Sand/ });
    await userEvent.type(input, "granite");
    await expect(
      await body.findByText("No material matches “granite”"),
    ).toBeVisible();
    await expect(body.queryByRole("option")).toBeNull();
    // No Create New unless the form allows it.
    await expect(body.queryByText(/Create/)).toBeNull();
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

async function startCreate(
  canvasElement: HTMLElement,
  userEvent: {
    click: (element: Element) => Promise<void>;
    type: (element: Element, text: string) => Promise<void>;
  },
  text: string,
) {
  const body = within(canvasElement.ownerDocument.body);
  const input = within(canvasElement).getByRole("combobox", {
    name: "Material",
  });
  await userEvent.click(input);
  await userEvent.type(input, text);
  await expect(
    await body.findByText(`No material matches “${text}”`),
  ).toBeVisible();
  await userEvent.click(
    await body.findByRole("option", { name: `Create “${text}”` }),
  );
  return within(await body.findByRole("dialog"));
}

export const CreateNew: Story = {
  args: { allowCreate: true },
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await startCreate(
      canvasElement,
      userEvent,
      "Fly Ash Bricks",
    );
    await expect(
      dialog.getByRole("heading", { name: "Create new material" }),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Material name")).toHaveValue(
      "Fly Ash Bricks",
    );

    // The unit is required.
    await userEvent.click(
      dialog.getByRole("button", { name: "Create material" }),
    );
    await expect(
      await dialog.findByText("Choose the Measurement Unit"),
    ).toBeVisible();

    await userEvent.click(dialog.getByLabelText("Measurement Unit"));
    await userEvent.click(await body.findByRole("option", { name: "Nos" }));
    await userEvent.click(dialog.getByLabelText(/Material Category/));
    await userEvent.click(
      await body.findByRole("option", {
        name: "Civil Work Materials › Bricks & Blocks",
      }),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Create material" }),
    );

    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(
      api.calls.mock.calls
        .map(([call]) => call)
        .find((call) => call.method === "POST")?.body,
    ).toEqual({
      name: "Fly Ash Bricks",
      uomId: NOS?.id,
      categoryId: BRICKS?.id,
    });
    await expect(args.onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: CREATED_MATERIAL_ID,
        name: "Fly Ash Bricks",
        uomName: "Nos",
        categoryName: "Bricks & Blocks",
        unitRate: null,
      }),
    );
    await expect(
      canvas.getByRole("combobox", { name: "Material" }),
    ).toHaveValue("Fly Ash Bricks");
    // The dialog's form never submits the procurement form around it.
    await expect(args.onSubmitForm).not.toHaveBeenCalled();
  },
};

export const CreateNewNameInUse: Story = {
  args: { allowCreate: true },
  beforeEach: serve({ taken: ["fly ash bricks"] }),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await startCreate(
      canvasElement,
      userEvent,
      "Fly Ash Bricks",
    );
    await userEvent.click(dialog.getByLabelText("Measurement Unit"));
    await userEvent.click(await body.findByRole("option", { name: "Nos" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Create material" }),
    );
    await expect(
      await dialog.findByText("A Material with this name already exists."),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Material name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(args.onChange).not.toHaveBeenCalled();

    // Cancel leaves the line as it was.
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const CreateNewWithoutPermission: Story = {
  args: { allowCreate: true },
  beforeEach: serve({ forbidden: true }),
  play: async ({ args, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = within(canvasElement).getByRole("combobox", {
      name: "Material",
    });
    // With nothing typed the row reads "Create new material".
    await userEvent.click(input);
    await userEvent.click(
      await body.findByRole("option", { name: "Create new material" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Material name"),
      "Binding Wire",
    );
    await userEvent.click(dialog.getByLabelText("Measurement Unit"));
    await userEvent.click(await body.findByRole("option", { name: "kg" }));
    await userEvent.click(
      dialog.getByRole("button", { name: "Create material" }),
    );
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "You do not have permission to add Materials.",
    );
    await expect(args.onChange).not.toHaveBeenCalled();
  },
};

export const ClearsTheMaterial: Story = {
  args: { initial: CEMENT.id },
  play: async ({ args, canvas, userEvent }) => {
    const input = canvas.getByRole("combobox", { name: "Material" });
    await waitFor(() => expect(input).toHaveValue("Cement OPC 53 Grade"));
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear material" }),
    );
    await waitFor(() => expect(args.onChange).toHaveBeenLastCalledWith(null));
    await waitFor(() => expect(input).toHaveValue(""));
    await expect(canvas.getByLabelText("Chosen id")).toHaveTextContent("none");
  },
};

export const OnlyACategory: Story = {
  args: { categoryId: PAINT.categoryId },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Material" }));
    const list = within(
      await body.findByRole("listbox", { name: "Materials" }),
    );
    await waitFor(() =>
      expect(
        list.getAllByRole("option").map((option) => option.textContent),
      ).toEqual([expect.stringMatching(/^Asian Paints/)]),
    );
    await expect(optionReads()).toEqual([{ categoryId: PAINT.categoryId }]);
  },
};

export const Disabled: Story = {
  args: { initial: CEMENT.id, disabled: true },
  play: async ({ canvas }) => {
    const input = canvas.getByRole("combobox", { name: "Material" });
    await waitFor(() => expect(input).toHaveValue("Cement OPC 53 Grade"));
    await expect(input).toBeDisabled();
    await expect(
      canvas.queryByRole("button", { name: "Clear material" }),
    ).toBeNull();
  },
};

export const Invalid: Story = {
  args: { invalid: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("combobox", { name: "Material" }),
    ).toHaveAttribute("aria-invalid", "true");
  },
};

export const Phone: Story = {
  args: { allowCreate: true },
  render: (args) => (
    <StoryQueries>
      <div style={{ width: 375 }} data-testid="phone">
        <Harness {...args} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const input = canvas.getByRole("combobox", { name: "Material" });
    await userEvent.click(input);
    const option = await body.findByRole("option", {
      name: /^Asian Paints Apex Exterior Emulsion/,
    });
    const phone = canvas.getByTestId("phone");
    await expect(phone.scrollWidth).toBeLessThanOrEqual(375);
    await expect(option.getBoundingClientRect().width).toBeLessThanOrEqual(375);
  },
};
