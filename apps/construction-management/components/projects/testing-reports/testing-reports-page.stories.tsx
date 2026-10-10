import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  BRICKS_ID,
  RCC_CUBE_ID,
  STEEL_ID,
  TESTING_API,
  TESTING_PROJECT_ID,
  mockTestingReportsApi,
} from "./testing-report-fixtures";
import { TestingReportsPage } from "./testing-reports-page";

let api: ReturnType<typeof mockTestingReportsApi>;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function testingApi(options: Parameters<typeof mockTestingReportsApi>[0] = {}) {
  return () => {
    api = mockTestingReportsApi(options);
    return api.restore;
  };
}

const PATH = `/app/projects/${TESTING_PROJECT_ID}/testing-reports`;

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

/** Opens a material's menu (Rename, Delete). */
async function itemActions(
  { canvas, canvasElement, userEvent }: PlayContext,
  name: string,
) {
  await userEvent.click(
    await canvas.findByRole("button", { name: `Actions for ${name}` }),
  );
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("menu"),
  );
}

function rows(context: PlayContext) {
  return within(context.canvas.getByRole("list", { name: "Testing materials" }))
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

const meta = {
  title: "Projects/Testing reports/Materials",
  component: TestingReportsPage,
  args: {
    projectId: TESTING_PROJECT_ID,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  beforeEach: testingApi(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: (args) => (
    <StoryQueries>
      <TestingReportsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TestingReportsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The four every Project starts with, by name, each with its report count. */
export const Materials: Story = {
  play: async (context) => {
    const { canvas } = context;
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Testing reports" }),
    ).toBeVisible();
    await expect(canvas.getByText("4 materials · 35 reports")).toBeVisible();
    await expect(rows(context)).toEqual([
      "Bricks2 reports",
      "Cement3 reports",
      "Rcc cube30 reports",
      "Steel0 reports",
    ]);
    await expect(
      canvas.getByRole("link", { name: /^Rcc cube/ }),
    ).toHaveAttribute("href", `${PATH}/${RCC_CUBE_ID}`);
    await expect(
      canvas.getByRole("button", { name: "Add testing material" }),
    ).toBeVisible();
    const menu = await itemActions(context, "Bricks");
    await expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Rename", "Delete"]);
  },
};

/** Add a material: the name is required, then it joins the list by name. */
export const AddMaterial: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add testing material" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add testing material" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText("Enter the testing material name."),
    ).toBeVisible();
    await expect(calls("POST", `${TESTING_API}/items`)).toHaveLength(0);

    await userEvent.type(dialog.getByLabelText("Name"), "  Sand ");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await waitFor(async () => {
      await expect(body.queryByRole("dialog")).toBeNull();
    });
    await expect(calls("POST", `${TESTING_API}/items`)[0]?.body).toEqual({
      name: "Sand",
    });
    await waitFor(async () => {
      await expect(rows(context)).toEqual([
        "Bricks2 reports",
        "Cement3 reports",
        "Rcc cube30 reports",
        "Sand0 reports",
        "Steel0 reports",
      ]);
    });
    await expect(canvas.getByText("5 materials · 35 reports")).toBeVisible();

    // Opening Add again starts from a blank name.
    await userEvent.click(
      canvas.getByRole("button", { name: "Add testing material" }),
    );
    await expect(
      within(
        await body.findByRole("dialog", { name: "Add testing material" }),
      ).getByLabelText("Name"),
    ).toHaveValue("");
  },
};

/** A name already on the Project (any case) is refused on the name field. */
export const NameInUse: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add testing material" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add testing material" }),
    );
    await userEvent.type(dialog.getByLabelText("Name"), "cement");
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await expect(
      await dialog.findByText(
        "A testing material with this name is already on the Project.",
      ),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(
      body.getByRole("dialog", { name: "Add testing material" }),
    ).toBeVisible();
  },
};

/** Rename sends the `updatedAt` it loaded; the reports stay with it. */
export const Rename: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    const menu = await itemActions(context, "Steel");
    await userEvent.click(menu.getByRole("menuitem", { name: "Rename" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename testing material" }),
    );
    const name = dialog.getByLabelText("Name");
    await expect(name).toHaveValue("Steel");
    await userEvent.clear(name);
    await userEvent.type(name, "Steel TMT Fe 500");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByRole("link", { name: /^Steel TMT Fe 500/ }),
    ).toBeVisible();
    await expect(
      calls("POST", `${TESTING_API}/items/${STEEL_ID}/update`)[0]?.body,
    ).toEqual({
      name: "Steel TMT Fe 500",
      updatedAt: "2026-09-01T05:00:00.000Z",
    });
  },
};

/**
 * A material with reports can't be deleted: the dialog shows the server's
 * reason and the material stays. One without reports goes.
 */
export const DeleteRefusedWithReports: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    let menu = await itemActions(context, "Bricks");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    let confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Bricks?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(
      await confirm.findByText(
        "This testing material has reports. Delete them first.",
      ),
    ).toBeVisible();
    await expect(
      calls("POST", `${TESTING_API}/items/${BRICKS_ID}/delete`),
    ).toHaveLength(1);
    await userEvent.click(confirm.getByRole("button", { name: "Keep it" }));
    await waitFor(async () => {
      await expect(body.queryByRole("alertdialog")).toBeNull();
    });
    await expect(canvas.getByRole("link", { name: /^Bricks/ })).toBeVisible();

    menu = await itemActions(context, "Steel");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Steel?" }),
    );
    // The earlier refusal does not linger.
    await expect(
      confirm.queryByText(
        "This testing material has reports. Delete them first.",
      ),
    ).toBeNull();
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(canvas.queryByRole("link", { name: /^Steel/ })).toBeNull();
    });
    await expect(canvas.getByText("3 materials · 35 reports")).toBeVisible();
  },
};

/** A Team Member with only Read sees the materials and opens them; no actions. */
export const ReadOnly: Story = {
  args: { canCreate: false, canUpdate: false, canDelete: false },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: /^Cement/ }),
    ).toHaveAttribute("href", expect.stringContaining(PATH));
    await expect(
      canvas.queryByRole("button", { name: "Add testing material" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
  },
};

/** Every material deleted: an invitation to add one. */
export const Empty: Story = {
  beforeEach: testingApi({ items: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("No testing materials yet"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Add a material you send to the lab, then keep its reports under it.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Add testing material" }),
    ).toHaveLength(1);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add testing material" }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Add testing material",
      }),
    ).toBeVisible();
  },
};

export const ReadOnlyEmpty: Story = {
  args: { canCreate: false, canUpdate: false, canDelete: false },
  beforeEach: testingApi({ items: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Materials tested on this Project and their lab reports show here.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add testing material" }),
    ).toBeNull();
  },
};
