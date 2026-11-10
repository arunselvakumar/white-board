import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  EQUIPMENT_API,
  JCB_ID,
  mockEquipmentApi,
  TOWER,
  type EquipmentApiOptions,
} from "./equipment-fixtures";
import { EquipmentRegister, ProjectEquipmentList } from "./equipment-list";

let api: ReturnType<typeof mockEquipmentApi>;

function listCalls(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "GET" && call.path.startsWith(`${EQUIPMENT_API}?`),
    );
}

function equipmentApi(options: EquipmentApiOptions = {}) {
  return () => {
    api = mockEquipmentApi(options);
    return api.restore;
  };
}

const meta = {
  title: "Site Work/Equipment/Register",
  component: EquipmentRegister,
  beforeEach: equipmentApi(),
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/equipments" } },
  },
  render: () => (
    <StoryQueries>
      <EquipmentRegister />
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentRegister>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Each machine with its number, ownership, place and state; nothing scrolls sideways. */
export const Register: Story = {
  play: async ({ canvas, canvasElement }) => {
    const list = within(await canvas.findByRole("list", { name: "Equipment" }));
    const items = list.getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    await expect(items[0]).toHaveTextContent("JCB 3DX");
    await expect(items[0]).toHaveTextContent(
      "TN-09-AB-1234 · Company owned · Hourly · Both",
    );
    await expect(items[0]).toHaveTextContent("Anugraha Towers · Block C yard");
    await expect(items[0]).toHaveTextContent("Available");
    await expect(items[1]).toHaveTextContent("Rented");
    await expect(items[2]).toHaveTextContent(
      "Warehouse / off system · Ambattur godown",
    );
    await expect(items[2]).toHaveTextContent("In maintenance");
    await expect(list.getByRole("link", { name: /JCB 3DX/ })).toHaveAttribute(
      "href",
      `/app/masters/equipments/${JCB_ID}`,
    );
    await expect(
      canvas.getAllByRole("link", { name: "Add Equipment" })[0],
    ).toHaveAttribute("href", "/app/masters/equipments/new");
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Ownership, place and state filters go to the server. */
export const Filters: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("list", { name: "Equipment" });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("combobox", { name: "Ownership" }));
    await userEvent.click(await body.findByRole("option", { name: "Rented" }));
    await waitFor(async () => {
      await expect(listCalls().at(-1)?.path).toContain("ownership=rented");
    });
    await expect(await canvas.findByText("1 machine")).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Where" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Warehouse / off system" }),
    );
    await waitFor(async () => {
      await expect(listCalls().at(-1)?.path).toContain("warehouse=true");
    });
    await expect(
      await canvas.findByText("No equipment matches these filters."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("combobox", { name: "Where" }));
    await userEvent.click(
      await body.findByRole("option", { name: "Anugraha Towers" }),
    );
    await waitFor(async () => {
      await expect(listCalls().at(-1)?.path).toContain(`projectId=${TOWER.id}`);
    });
  },
};

/** No equipment yet, with the way to add some. */
export const Empty: Story = {
  beforeEach: equipmentApi({ items: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No equipment yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Equipment" }),
    ).toHaveLength(2);
  },
};

/** Without Create, no Add Equipment. */
export const ReadOnly: Story = {
  beforeEach: equipmentApi({ flags: { "masters.equipments": ["read"] } }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Equipment" });
    await expect(
      canvas.queryByRole("link", { name: "Add Equipment" }),
    ).toBeNull();
  },
};

/** A Project's Equipment tab: the machines there now, linking to their detail. */
export const ProjectTab: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${TOWER.id}/equipment/register`,
      },
    },
  },
  render: () => (
    <StoryQueries>
      <div className="w-full p-6">
        <ProjectEquipmentList projectId={TOWER.id} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    const list = within(await canvas.findByRole("list", { name: "Equipment" }));
    await expect(list.getAllByRole("listitem")).toHaveLength(2);
    await expect(listCalls()[0]?.path).toContain(`projectId=${TOWER.id}`);
    await expect(list.getByRole("link", { name: /JCB 3DX/ })).toHaveAttribute(
      "href",
      `/app/projects/${TOWER.id}/equipment/register/${JCB_ID}`,
    );
    await expect(
      canvas.getByRole("link", { name: "Add equipment" }),
    ).toHaveAttribute(
      "href",
      `/app/projects/${TOWER.id}/equipment/register/new`,
    );
  },
};

/** Nothing at the Project yet; Equipment Usage Create alone can add here. */
export const ProjectTabEmpty: Story = {
  beforeEach: equipmentApi({
    items: [],
    flags: {
      "masters.equipments": [],
      "site_work.equipment_usage": ["read", "create"],
    },
  }),
  render: () => (
    <StoryQueries>
      <div className="w-full p-6">
        <ProjectEquipmentList projectId={TOWER.id} />
      </div>
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No equipment yet")).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add equipment" }),
    ).toHaveLength(2);
  },
};
