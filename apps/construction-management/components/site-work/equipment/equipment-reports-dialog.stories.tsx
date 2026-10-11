import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import {
  CENTRAL_LIST_PATH,
  CENTRAL_MAINTENANCE,
  CENTRAL_TRANSFERS,
  CENTRAL_VENDOR,
  TODAY,
} from "@/components/reports/report-fixtures";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import {
  equipmentHandler,
  type EquipmentApiOptions,
} from "./equipment-fixtures";
import { EquipmentRegister } from "./equipment-list";
import { EquipmentReportsDialog } from "./equipment-reports-dialog";

let api: ReturnType<typeof mockApi>;

function posted(): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST");
}

/** The register's API plus the central reports list and Generate. */
function serve(options: Pick<EquipmentApiOptions, "flags"> = {}) {
  return () => {
    const equipment = equipmentHandler({ flags: options.flags });
    api = mockApi((call) => {
      if (call.method === "GET" && call.path === CENTRAL_LIST_PATH)
        return Response.json({
          items: [CENTRAL_TRANSFERS, CENTRAL_VENDOR],
        });
      if (call.method === "POST" && call.path === CENTRAL_LIST_PATH)
        return Response.json(CENTRAL_MAINTENANCE, { status: 201 });
      return equipment(call);
    });
    return api.restore;
  };
}

const meta = {
  title: "Site Work/Equipment/Reports dialog",
  component: EquipmentReportsDialog,
  args: { open: true, onClose: () => undefined, today: TODAY },
  beforeEach: serve(),
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/equipments" } },
  },
  render: (args) => (
    <StoryQueries>
      <EquipmentReportsDialog {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentReportsDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The central Maintenance and Transfers reports, and only the equipment ones among recent reports. */
export const CentralReports: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = within(
      await body.findByRole("dialog", { name: "Equipment reports" }),
    );
    const maintenance = within(
      dialog.getByRole("form", { name: "Equipment Maintenance" }),
    );
    await expect(
      dialog.getByRole("form", { name: "Equipment Transfers" }),
    ).toBeVisible();
    await expect(maintenance.getByLabelText("From")).toHaveValue("2026-10-01");

    const recent = within(
      await dialog.findByRole("list", { name: "Recent reports" }),
    );
    await expect(recent.getAllByRole("listitem")).toHaveLength(1);
    await expect(recent.getByText("Equipment Transfers")).toBeVisible();
    await expect(recent.queryByText("Vendor Attendance")).toBeNull();

    await userEvent.click(
      maintenance.getByRole("button", { name: "Generate" }),
    );
    await expect(
      await maintenance.findByText("Ready to download"),
    ).toBeVisible();
    await expect(posted()[0]?.body).toEqual({
      kind: "equipment_maintenance",
      projectId: null,
      params: { from: "2026-10-01", to: TODAY },
    });
    await expect(
      maintenance.getByRole("link", { name: "Equipment Maintenance PDF" }),
    ).toHaveAttribute(
      "href",
      `${CENTRAL_LIST_PATH}/${CENTRAL_MAINTENANCE.id}/download?format=pdf`,
    );
  },
};

/** Masters → Equipments shows Reports with Equipments Report and opens the dialog. */
export const FromTheRegister: Story = {
  render: () => (
    <StoryQueries>
      <EquipmentRegister />
    </StoryQueries>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reports" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("dialog", { name: "Equipment reports" }),
    ).toBeVisible();
  },
};

/** Without Equipments Report there is no Reports button. */
export const WithoutReportFlag: Story = {
  beforeEach: serve({
    flags: { "masters.equipments": ["read", "create"] },
  }),
  render: () => (
    <StoryQueries>
      <EquipmentRegister />
    </StoryQueries>
  ),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Equipment" });
    await expect(
      canvas.getAllByRole("link", { name: "Add Equipment" })[0],
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Reports" })).toBeNull();
  },
};
