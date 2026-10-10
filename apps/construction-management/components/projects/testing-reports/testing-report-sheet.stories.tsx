import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import {
  BRICKS_ID,
  TESTING_API,
  TESTING_PROJECT_ID,
  COMPRESSIVE_LOT_1,
  mockTestingReportsApi,
} from "./testing-report-fixtures";
import { TestingReportSheet } from "./testing-report-sheet";

let api: ReturnType<typeof mockTestingReportsApi>;
let xhr: ReturnType<typeof mockXhrUploads>;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function testingApi(
  options: Parameters<typeof mockTestingReportsApi>[0] = {},
  holdAt?: number,
) {
  return () => {
    api = mockTestingReportsApi(options);
    xhr = mockXhrUploads({ holdAt });
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

const UPLOADS = `${TESTING_API}/uploads`;
/** Where the mock puts the story's first upload. */
const FIRST_KEY = `companies/w1/testing-reports/${TESTING_PROJECT_ID}/501.bin`;
const ADD = `${TESTING_API}/items/${BRICKS_ID}/reports`;
const COMPRESSIVE = COMPRESSIVE_LOT_1;
const UPDATE = `${TESTING_API}/reports/${COMPRESSIVE.id}/update`;

async function openSheet(canvasElement: HTMLElement, name: string) {
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name,
    }),
  );
}

const meta = {
  title: "Projects/Testing reports/Report sheet",
  component: TestingReportSheet,
  args: {
    projectId: TESTING_PROJECT_ID,
    itemId: BRICKS_ID,
    open: true,
    report: null,
    today: "2026-10-09",
    onClose: fn(),
  },
  beforeEach: testingApi(),
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/app/projects/${TESTING_PROJECT_ID}/testing-reports/${BRICKS_ID}`,
      },
    },
  },
  render: (args) => (
    <StoryQueries>
      <TestingReportSheet {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof TestingReportSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Add: name, today's date, a remark with its count and a PDF; the bar
 * shows the file going up (held at 64%), then the report is saved.
 */
export const AddWithProgress: Story = {
  beforeEach: testingApi({}, 64),
  play: async ({ args, canvasElement, userEvent }) => {
    const sheet = await openSheet(canvasElement, "Add report");
    await expect(sheet.getByLabelText("Report date")).toHaveValue("2026-10-09");
    await expect(sheet.getByText("No file chosen")).toBeVisible();
    await expect(sheet.getByText("0/500")).toBeVisible();

    await userEvent.type(sheet.getByLabelText("Name"), "Efflorescence – lot 2");
    await userEvent.type(sheet.getByLabelText(/^Remark/), "Nil efflorescence.");
    await expect(sheet.getByText("18/500")).toBeVisible();
    await userEvent.upload(
      sheet.getByLabelText("Report file"),
      file("Efflorescence lot 2.pdf", 2 * 1024 * 1024, "application/pdf"),
    );
    await expect(sheet.getByText("Efflorescence lot 2.pdf")).toBeVisible();
    await expect(sheet.getByText("2 MB")).toBeVisible();

    await userEvent.click(sheet.getByRole("button", { name: "Add report" }));
    await expect(
      await sheet.findByRole("progressbar", {
        name: "Uploading Efflorescence lot 2.pdf",
      }),
    ).toBeVisible();
    await expect(await sheet.findByText("64%")).toBeVisible();
    await expect(calls("POST", UPLOADS)[0]?.body).toEqual({
      fileName: "Efflorescence lot 2.pdf",
      bytes: 2 * 1024 * 1024,
    });
    await expect(calls("POST", ADD)).toHaveLength(0);

    xhr.release();
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
    await expect(xhr.sent[0]?.contentType).toBe("application/pdf");
    await expect(calls("POST", ADD)[0]?.body).toEqual({
      name: "Efflorescence – lot 2",
      reportDate: "2026-10-09",
      remark: "Nil efflorescence.",
      key: FIRST_KEY,
      fileName: "Efflorescence lot 2.pdf",
    });
  },
};

/** Name, date and file are required; nothing is sent until they are there. */
export const RequiredFields: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const sheet = await openSheet(canvasElement, "Add report");
    await userEvent.clear(sheet.getByLabelText("Report date"));
    await userEvent.click(sheet.getByRole("button", { name: "Add report" }));
    await expect(
      await sheet.findByText("Enter the report name."),
    ).toBeVisible();
    await expect(sheet.getByText("Enter the report date.")).toBeVisible();
    await expect(sheet.getByText("Choose the report file.")).toBeVisible();
    await expect(sheet.getByLabelText("Name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(calls("POST", UPLOADS)).toHaveLength(0);
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

const BACKDATED =
  "Material Testing Report entries older than 7 days cannot be created. The earliest date allowed is 2026-10-02.";

/** The Back-dated Entry policy refuses an old date: the reason shows on the date. */
export const BackdatedRefused: Story = {
  beforeEach: testingApi({
    saveError: {
      status: 403,
      code: "BACKDATED_CREATE_BLOCKED",
      message: BACKDATED,
    },
  }),
  play: async ({ args, canvasElement, userEvent }) => {
    const sheet = await openSheet(canvasElement, "Add report");
    await userEvent.type(sheet.getByLabelText("Name"), "Compressive – lot 0");
    const date = sheet.getByLabelText("Report date");
    await userEvent.clear(date);
    await userEvent.type(date, "2026-08-14");
    await userEvent.upload(
      sheet.getByLabelText("Report file"),
      file("Lot 0.pdf", 200 * 1024, "application/pdf"),
    );
    await userEvent.click(sheet.getByRole("button", { name: "Add report" }));
    await expect(await sheet.findByText(BACKDATED)).toBeVisible();
    await expect(date).toHaveAttribute("aria-invalid", "true");
    await expect(calls("POST", ADD)[0]?.body).toMatchObject({
      reportDate: "2026-08-14",
    });
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

/** Edit keeps the file unless another is chosen: no upload, no `file`. */
export const EditKeepingFile: Story = {
  args: { report: COMPRESSIVE },
  play: async ({ args, canvasElement, userEvent }) => {
    const sheet = await openSheet(canvasElement, "Edit report");
    await expect(sheet.getByLabelText("Name")).toHaveValue(
      "Compressive strength – lot 1",
    );
    await expect(sheet.getByLabelText("Report date")).toHaveValue("2026-02-12");
    await expect(sheet.getByLabelText(/^Remark/)).toHaveValue(
      "Average 4.1 N/mm². Class B.",
    );
    await expect(
      sheet.getByText("Compressive strength – lot 1.pdf"),
    ).toBeVisible();
    await expect(sheet.getByText("Current file")).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Replace file" }),
    ).toBeVisible();

    await userEvent.clear(sheet.getByLabelText(/^Remark/));
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
    await expect(calls("POST", UPLOADS)).toHaveLength(0);
    await expect(calls("POST", UPDATE)[0]?.body).toEqual({
      name: "Compressive strength – lot 1",
      reportDate: "2026-02-12",
      remark: null,
      updatedAt: COMPRESSIVE.updatedAt,
    });
  },
};

/** Replace file: the new one goes up first, then the edit carries it. */
export const EditReplacingFile: Story = {
  args: { report: COMPRESSIVE },
  play: async ({ args, canvasElement, userEvent }) => {
    const sheet = await openSheet(canvasElement, "Edit report");
    await userEvent.upload(
      sheet.getByLabelText("Report file"),
      file("Lot 1 retest.jpg", 900 * 1024, "image/jpeg"),
    );
    await expect(sheet.getByText("Lot 1 retest.jpg")).toBeVisible();
    await expect(sheet.queryByText("Current file")).toBeNull();
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(args.onClose).toHaveBeenCalled();
    });
    await expect(calls("POST", UPLOADS)[0]?.body).toEqual({
      fileName: "Lot 1 retest.jpg",
      bytes: 900 * 1024,
    });
    await expect(xhr.sent[0]?.contentType).toBe("image/jpeg");
    await expect(calls("POST", UPDATE)[0]?.body).toMatchObject({
      updatedAt: COMPRESSIVE.updatedAt,
      file: {
        key: FIRST_KEY,
        fileName: "Lot 1 retest.jpg",
      },
    });
  },
};

/** A spreadsheet is refused in the browser, before any request. */
export const RefusedFileType: Story = {
  play: async ({ args, canvasElement }) => {
    // A picker set to "All files" (or a drop) ignores `accept`.
    const user = userEvent.setup({ applyAccept: false });
    const sheet = await openSheet(canvasElement, "Add report");
    await user.type(sheet.getByLabelText("Name"), "Sieve analysis");
    await user.upload(
      sheet.getByLabelText("Report file"),
      file("Sieve analysis.xlsx", 40 * 1024),
    );
    await expect(
      await sheet.findByText("Choose a PDF or an image (PNG, JPEG, WebP)."),
    ).toBeVisible();
    await user.click(sheet.getByRole("button", { name: "Add report" }));
    await expect(
      sheet.getByText("Choose a PDF or an image (PNG, JPEG, WebP)."),
    ).toBeVisible();
    await expect(calls("POST", UPLOADS)).toHaveLength(0);
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};
