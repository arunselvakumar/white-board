import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { mockApi, StoryQueries } from "../../../.storybook/mocks/api";
import { PRICE_INDICES } from "./escalation-fixtures";
import { PriceIndicesPage } from "./price-indices-page";

const API = "/api/construction/contracts/price-indices";

let api: ReturnType<typeof mockApi>;

function serve(list = PRICE_INDICES) {
  return () => {
    api = mockApi((call) => {
      const url = new URL(call.path, "http://storybook.local");
      if (call.method === "GET" && url.pathname === API)
        return Response.json(list);
      if (call.method === "POST" && url.pathname === API)
        return Response.json(
          {
            code: "PRICE_INDEX_EXISTS",
            message: "CPI-IW already has an index for Apr 2026. Edit that one.",
          },
          { status: 409 },
        );
      if (call.method === "POST" && url.pathname === `${API}/import`)
        return Response.json(
          {
            code: "IMPORT_HAS_ERRORS",
            message:
              "The sheet has 1 problem. Fix it and upload it again; nothing was saved.",
            details: {
              errors: [
                {
                  row: 3,
                  column: "Value",
                  message: "Enter an index of more than 0.",
                },
              ],
            },
          },
          { status: 400 },
        );
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Price indices",
  component: PriceIndicesPage,
  render: () => (
    <StoryQueries>
      <PriceIndicesPage />
    </StoryQueries>
  ),
} satisfies Meta<typeof PriceIndicesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One card per series with its months; a month already kept is refused under its field. */
export const BySeries: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    const cpi = await canvas.findByRole("region", { name: "CPI-IW" });
    await expect(within(cpi).getByText("147")).toBeVisible();
    await expect(within(cpi).getByText("Apr 2026")).toBeVisible();
    await expect(
      canvas.getByRole("region", { name: "WPI – Cement" }),
    ).toBeVisible();
    await userEvent.click(
      within(cpi).getByRole("button", { name: "Add month" }),
    );
    const dialog = within(document.body).getByRole("dialog");
    await expect(within(dialog).getByLabelText("Series")).toHaveValue("CPI-IW");
    await userEvent.type(within(dialog).getByLabelText("Index value"), "147");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await expect(
      await within(dialog).findByText(/already has an index for Apr 2026/),
    ).toBeVisible();
  },
};

/** The import lists the rows at fault and saves nothing. */
export const ImportErrors: Story = {
  beforeEach: serve(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Import" }),
    );
    const dialog = within(document.body).getByRole("dialog");
    const file = new File(["x"], "indices.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    await userEvent.upload(
      within(dialog).getByLabelText("Excel file (.xlsx)"),
      file,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Import" }),
    );
    await expect(
      await within(dialog).findByText(
        "Row 3, Value: Enter an index of more than 0.",
      ),
    ).toBeVisible();
  },
};

/** Nothing kept yet: the empty state says what to type. */
export const Empty: Story = {
  beforeEach: serve({ ...PRICE_INDICES, series: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No price indices yet")).toBeVisible();
  },
};

/** At 375 px the months wrap two to a row and nothing scrolls sideways. */
export const Phone: Story = {
  beforeEach: serve(),
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("region", { name: "CPI-IW" });
    await waitFor(() => {
      expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
        canvasElement.clientWidth + 1,
      );
    });
  },
};
