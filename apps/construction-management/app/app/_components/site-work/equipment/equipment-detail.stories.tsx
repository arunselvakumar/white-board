import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { EquipmentDetailView } from "./equipment-detail";
import {
  ALL_ACTIONS,
  brokenDetail,
  EQUIPMENT_API,
  equipmentDetail,
  JCB_ID,
  mockEquipmentApi,
  rentedDetail,
  type EquipmentApiOptions,
} from "./equipment-fixtures";

let api: ReturnType<typeof mockEquipmentApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function equipmentApi(options: EquipmentApiOptions = {}) {
  return () => {
    api = mockEquipmentApi(options);
    return api.restore;
  };
}

const BASE = "/app/masters/equipments";

const meta = {
  title: "Site Work/Equipment/Detail",
  component: EquipmentDetailView,
  args: {
    equipment: equipmentDetail(),
    back: { label: "Equipments", href: BASE },
    editHref: `${BASE}/${JCB_ID}/edit`,
    afterDeleteHref: BASE,
  },
  beforeEach: equipmentApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/${JCB_ID}` } } },
  render: (args) => (
    <StoryQueries>
      <EquipmentDetailView {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof EquipmentDetailView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Facts, the Transfer Report (newest first) and the maintenance log with costs. */
export const WithHistory: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { name: "JCB 3DX" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Anugraha Towers · Block C yard"),
    ).toBeVisible();
    await expect(canvas.getByText("8 hrs/day")).toBeVisible();
    await expect(canvas.getByText("6.5 Litre/hr")).toBeVisible();
    const history = within(
      canvas.getByRole("region", { name: "Movement history" }),
    );
    const rows = history.getAllByRole("row");
    await expect(rows).toHaveLength(3);
    await expect(rows[1]).toHaveTextContent("5 Oct 2026");
    await expect(rows[1]).toHaveTextContent("Villa Phase 2");
    await expect(rows[1]).toHaveTextContent("Anugraha Towers");
    await expect(rows[1]).toHaveTextContent("For the basement excavation");
    await expect(rows[1]).toHaveTextContent("Karthik R");
    await expect(rows[2]).toHaveTextContent("Added");
    const log = within(canvas.getByRole("list", { name: "Maintenance log" }));
    await expect(log.getByText(/Sri Balaji Motors/)).toHaveTextContent(
      "₹12,500.00",
    );
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${BASE}/${JCB_ID}/edit`,
    );
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** In maintenance and unavailable: both banners, and only Return to Service. */
export const InMaintenanceAndUnavailable: Story = {
  args: { equipment: brokenDetail() },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      canvas.getByText("Unavailable for worksheet entry — Since 8 Oct 2026"),
    ).toBeVisible();
    await expect(
      canvas.getByText("In maintenance since 9 Oct 2026"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const menu = within(canvasElement.ownerDocument.body);
    await expect(
      await menu.findByRole("menuitem", { name: "Return to Service" }),
    ).toBeVisible();
    await expect(menu.queryByRole("menuitem", { name: "Transfer" })).toBeNull();
    await expect(
      menu.queryByRole("menuitem", { name: "Log Maintenance" }),
    ).toBeNull();
    await userEvent.click(
      menu.getByRole("menuitem", {
        name: "Make it available for worksheet entry",
      }),
    );
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_API}/${JCB_ID}/availability`)[0]?.body,
      ).toEqual({
        expectedUpdatedAt: brokenDetail().updatedAt,
        available: true,
      });
    });
  },
};

/** Mark unavailable for worksheet entry. */
export const MarkUnavailable: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Mark unavailable for worksheet entry",
      }),
    );
    await waitFor(async () => {
      await expect(
        posts(`${EQUIPMENT_API}/${JCB_ID}/availability`)[0]?.body,
      ).toMatchObject({ available: false });
    });
  },
};

/** Rented with the hire party and rate; without Financial the rate and costs are gone. */
export const RentedWithoutFinancial: Story = {
  args: {
    equipment: rentedDetail({
      hireRate: null,
      maintenance: equipmentDetail().maintenance.map((entry) => ({
        ...entry,
        cost: null,
      })),
      actions: {
        ...ALL_ACTIONS,
        edit: false,
        delete: false,
        transfer: false,
        logMaintenance: false,
        editMaintenance: false,
        changeAvailability: false,
        seeRates: false,
        seeCosts: false,
      },
    }),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Velan Earth Movers")).toBeVisible();
    await expect(canvas.getByText("Trip")).toBeVisible();
    await expect(canvas.queryByText("Rate")).toBeNull();
    await expect(canvas.queryByText(/₹/)).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "More actions" }),
    ).toBeNull();
  },
};

/** Rented with Financial: the rate per trip. */
export const Rented: Story = {
  args: { equipment: rentedDetail() },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("₹1,500.00 / trip")).toBeVisible();
    await expect(canvas.getByText("Idle hours are not billed")).toBeVisible();
  },
};

/** No maintenance yet. */
export const NoMaintenance: Story = {
  args: { equipment: equipmentDetail({ maintenance: [] }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No maintenance logged yet.")).toBeVisible();
  },
};

/** Delete asks first, then leaves for the register. */
export const Delete: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await page.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = within(await page.findByRole("alertdialog"));
    await expect(dialog.getByText("Delete JCB 3DX?")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(posts(`${EQUIPMENT_API}/${JCB_ID}/delete`)[0]?.body).toEqual(
        { expectedUpdatedAt: equipmentDetail().updatedAt },
      );
    });
  },
};
