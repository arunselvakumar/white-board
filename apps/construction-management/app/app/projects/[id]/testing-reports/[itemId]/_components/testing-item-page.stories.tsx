import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import { TestingItemPage } from "./testing-item-page";
import {
  BRICKS_ID,
  RCC_CUBE_ID,
  STEEL_ID,
  TESTING_API,
  TESTING_PROJECT_ID,
  mockTestingReportsApi,
} from "./testing-report-fixtures";

let api: ReturnType<typeof mockTestingReportsApi>;
let xhr: ReturnType<typeof mockXhrUploads>;

function reportReads(itemId: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter(
      (call) =>
        call.method === "GET" &&
        call.path.startsWith(`${TESTING_API}/items/${itemId}/reports?`),
    );
}

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function testingApi() {
  return () => {
    api = mockTestingReportsApi();
    xhr = mockXhrUploads();
    return () => {
      xhr.restore();
      api.restore();
    };
  };
}

function file(name: string, size: number, type = "") {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

const PATH = `/app/projects/${TESTING_PROJECT_ID}/testing-reports`;

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

function reportNames({ canvas }: PlayContext): string[] {
  return within(canvas.getByRole("list", { name: "Reports" }))
    .getAllByRole("listitem")
    .map((row) => row.querySelector("p")?.textContent ?? "");
}

/**
 * Story tests run 414px wide, where each report's actions fold into its
 * menu (from `sm` up they are inline buttons).
 */
async function reportActions(
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

const meta = {
  title: "Projects/Testing reports/Material",
  component: TestingItemPage,
  args: {
    projectId: TESTING_PROJECT_ID,
    itemId: RCC_CUBE_ID,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    today: "2026-10-09",
  },
  beforeEach: testingApi(),
  parameters: {
    nextjs: { navigation: { pathname: `${PATH}/${RCC_CUBE_ID}` } },
  },
  render: (args) => (
    <StoryQueries>
      <TestingItemPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TestingItemPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 30 cube tests, newest report date first, 25 to a page. */
export const Paging: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Rcc cube" }),
    ).toBeVisible();
    await expect(canvas.getByText("30 reports")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Back to Testing reports" }),
    ).toHaveAttribute("href", PATH);

    let names = reportNames(context);
    await expect(names).toHaveLength(25);
    await expect(names[0]).toBe("Cube test – pour 30");
    await expect(names[24]).toBe("Cube test – pour 6");
    // Report date and uploader, then the remark.
    await expect(canvas.getByText("4 Mar 2026 · Karthik R")).toBeVisible();
    await expect(
      canvas.getByText(/^28-day strength 31.2 N\/mm²/),
    ).toBeVisible();
    await expect(canvas.getByText("Showing 25 of 30")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();

    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(await canvas.findByText("Showing 5 of 30")).toBeVisible();
    names = reportNames(context);
    await expect(names).toEqual([
      "Cube test – pour 5",
      "Cube test – pour 4",
      "Cube test – pour 3",
      "Cube test – pour 2",
      "Cube test – pour 1",
    ]);
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
    await expect(reportReads(RCC_CUBE_ID).at(-1)?.path).toContain("after=o25");

    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(await canvas.findByText("Showing 25 of 30")).toBeVisible();
    await expect(reportReads(RCC_CUBE_ID).at(-1)?.path).toContain("before=o25");
  },
};

/** Search narrows by report name and starts again from the first page. */
export const SearchNarrows: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await userEvent.click(await canvas.findByRole("button", { name: "Next" }));
    await expect(await canvas.findByText("Showing 5 of 30")).toBeVisible();

    await userEvent.type(
      canvas.getByRole("searchbox", { name: "Search reports" }),
      "pour 1",
    );
    await expect(
      await canvas.findByText("Showing 11 of 11 matching"),
    ).toBeVisible();
    const names = reportNames(context);
    await expect(names[0]).toBe("Cube test – pour 19");
    await expect(names.at(-1)).toBe("Cube test – pour 1");
    const last = reportReads(RCC_CUBE_ID).at(-1)?.path ?? "";
    await expect(last).toContain("q=pour+1");
    await expect(last).not.toContain("after=");
    // One request for the whole word, not one per letter.
    await expect(
      reportReads(RCC_CUBE_ID).filter((call) => call.path.includes("q=")),
    ).toHaveLength(1);
    await expect(canvas.queryByRole("button", { name: "Next" })).toBeNull();
  },
};

/** Nothing matches: say so and offer to clear the search. */
export const EmptySearchResult: Story = {
  args: { itemId: BRICKS_ID },
  play: async (context) => {
    const { canvas, userEvent } = context;
    await userEvent.type(
      await canvas.findByRole("searchbox", { name: "Search reports" }),
      "slump",
    );
    await expect(
      await canvas.findByText("No reports match “slump”"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(await canvas.findByText("Showing 2 of 2")).toBeVisible();
    await expect(
      canvas.getByRole("searchbox", { name: "Search reports" }),
    ).toHaveValue("");
  },
};

/** A material without reports: an invitation to add the first. */
export const EmptyMaterial: Story = {
  args: { itemId: STEEL_ID },
  parameters: {
    nextjs: { navigation: { pathname: `${PATH}/${STEEL_ID}` } },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("No reports for Steel yet"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("searchbox", { name: "Search reports" }),
    ).toBeNull();
    await expect(
      canvas.getAllByRole("button", { name: "Add report" }),
    ).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Add report" }));
    const sheet = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Add report",
      }),
    );
    await expect(sheet.getByLabelText("Report date")).toHaveValue("2026-10-09");
  },
};

/**
 * Bricks: a photo without an uploader shows the date alone; View opens
 * the file; Delete asks first.
 */
export const ViewAndDelete: Story = {
  args: { itemId: BRICKS_ID },
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Bricks" }),
    ).toBeVisible();
    await expect(reportNames(context)).toEqual([
      "Water absorption – lot 1",
      "Compressive strength – lot 1",
    ]);
    await expect(canvas.getByText("14 Feb 2026")).toBeVisible();
    await expect(canvas.getByText("Average 4.1 N/mm². Class B.")).toBeVisible();

    let menu = await reportActions(context, "Water absorption – lot 1");
    await userEvent.click(menu.getByRole("menuitem", { name: "View" }));
    const viewer = within(
      await body.findByRole("dialog", { name: "Water absorption lot 1.jpg" }),
    );
    await expect(
      viewer.getByRole("img", { name: "Water absorption lot 1.jpg" }),
    ).toBeVisible();
    await expect(
      viewer.getByText("Water absorption – lot 1 · 14 Feb 2026"),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(body.queryByRole("dialog")).toBeNull();
    });

    menu = await reportActions(context, "Water absorption – lot 1");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Delete Water absorption – lot 1?",
      }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(await canvas.findByText("1 report")).toBeVisible();
    await expect(reportNames(context)).toEqual([
      "Compressive strength – lot 1",
    ]);
  },
};

/** Add report from the page: the new report lands at the top. */
export const AddReport: Story = {
  args: { itemId: BRICKS_ID },
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add report" }),
    );
    const sheet = within(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Add report",
      }),
    );
    await userEvent.type(sheet.getByLabelText("Name"), "Efflorescence – lot 2");
    await userEvent.upload(
      sheet.getByLabelText("Report file"),
      file("Efflorescence lot 2.pdf", 300 * 1024, "application/pdf"),
    );
    await userEvent.click(sheet.getByRole("button", { name: "Add report" }));
    await expect(await canvas.findByText("3 reports")).toBeVisible();
    await expect(reportNames(context)[0]).toBe("Efflorescence – lot 2");
    await expect(xhr.sent).toHaveLength(1);
    await expect(
      calls("POST", `${TESTING_API}/items/${BRICKS_ID}/reports`),
    ).toHaveLength(1);
  },
};

/** A Team Member with only Read views reports; nothing to add, edit or delete. */
export const ReadOnly: Story = {
  args: { canCreate: false, canUpdate: false, canDelete: false },
  play: async (context) => {
    const { canvas } = context;
    await canvas.findByText("Showing 25 of 30");
    await expect(
      canvas.queryByRole("button", { name: "Add report" }),
    ).toBeNull();
    const menu = await reportActions(context, "Cube test – pour 30");
    await expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["View"]);
  },
};
