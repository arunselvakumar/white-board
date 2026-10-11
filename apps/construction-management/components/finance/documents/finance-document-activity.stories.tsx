import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import { FinanceDocumentActivity } from "./finance-document-activity";
import {
  FINANCE_DOCUMENTS_API,
  FINANCE_SAMPLE_DOCUMENT,
  financeFile,
  mockFinanceDocumentApi,
  type FinanceDocumentApiOptions,
} from "./finance-document-fixtures";

let api: ReturnType<typeof mockApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const BASE = `${FINANCE_DOCUMENTS_API}/${FINANCE_SAMPLE_DOCUMENT.type}/${FINANCE_SAMPLE_DOCUMENT.id}`;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi(options: FinanceDocumentApiOptions = {}, uploads = false) {
  return () => {
    api = mockApi(mockFinanceDocumentApi(options));
    xhr = uploads ? mockXhrUploads({ holdAt: 64 }) : null;
    return () => {
      xhr?.restore();
      api.restore();
    };
  };
}

function file(name: string, size: number, type = "") {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

const meta = {
  title: "Finance/Documents/Activity",
  component: FinanceDocumentActivity,
  args: {
    documentType: FINANCE_SAMPLE_DOCUMENT.type,
    documentId: FINANCE_SAMPLE_DOCUMENT.id,
    canEdit: true,
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl">
        <FinanceDocumentActivity {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof FinanceDocumentActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A voucher's remarks with the bill, and its photos and receipts. */
export const Voucher: Story = {
  beforeEach: withApi(),
  play: async ({ canvas }) => {
    const thread = within(await canvas.findByRole("list", { name: "Remarks" }));
    const items = thread
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.tagName === "OL");
    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent("Arun Selva Kumar");
    await expect(
      thread.getByText("Sri Murugan Fuels, near the site gate. Bill attached."),
    ).toBeVisible();
    await expect(
      thread.getByRole("button", { name: "Open Diesel bill.jpg" }),
    ).toBeVisible();
    const files = within(
      await canvas.findByRole("list", { name: "Photos & receipts" }),
    );
    // The remark's bill stays under the remark.
    await expect(files.queryByText("Diesel bill.jpg")).toBeNull();
    await expect(files.getByText("Receipt 1.jpg")).toBeVisible();
    await expect(
      canvas.getByText("PDF or photos (PNG, JPEG or WebP), up to 25 MB each."),
    ).toBeVisible();
    // Someone else's file: no remove for this viewer.
    await expect(
      files.queryByRole("button", { name: "Remove Shop invoice.pdf" }),
    ).toBeNull();
  },
};

/** A new Transaction: no remarks and no files yet. */
export const EmptyTransaction: Story = {
  args: { documentType: "transaction" },
  beforeEach: withApi({ remarks: [], files: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No remarks yet. Write the first remark below."),
    ).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Files" })).toBeVisible();
    await expect(
      canvas.getByText("No files yet. Add a receipt, a PDF or photos."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add files" }),
    ).toBeVisible();
  },
};

/** Writing a remark: empty is refused on the spot; Post adds it at the end. */
export const PostingARemark: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    const box = await canvas.findByPlaceholderText("Add a remark…");
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    await expect(await canvas.findByText("Write a few words.")).toBeVisible();
    await expect(calls("POST", `${BASE}/remarks`)).toHaveLength(0);

    await userEvent.type(box, "Approved; keep the original bill.");
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    const thread = within(canvas.getByRole("list", { name: "Remarks" }));
    await expect(
      await thread.findByText("Approved; keep the original bill."),
    ).toBeVisible();
    await expect(calls("POST", `${BASE}/remarks`)[0]?.body).toEqual({
      body: "Approved; keep the original bill.",
      fileIds: [],
    });
    await waitFor(async () => {
      await expect(box).toHaveValue("");
    });
  },
};

/** A receipt uploads with progress; a spreadsheet is refused at once. */
export const AddingReceipts: Story = {
  beforeEach: withApi({}, true),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grid = within(
      await canvas.findByRole("list", { name: "Photos & receipts" }),
    );
    await fireEvent.change(
      canvas.getByLabelText("Choose files for Photos & receipts"),
      {
        target: {
          files: [
            file("Cement bill.jpg", 2 * 1024 * 1024, "image/jpeg"),
            file("Statement.xlsx", 1024, ""),
          ],
        },
      },
    );
    await expect(
      await grid.findByRole("progressbar", { name: "Cement bill.jpg upload" }),
    ).toBeVisible();
    await expect(
      grid.getByText(
        "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
      ),
    ).toBeVisible();
    await expect(calls("POST", `${BASE}/files/uploads`)).toHaveLength(1);
    xhr?.release();
    await expect(
      await grid.findByRole("link", { name: "Open Cement bill.jpg" }),
    ).toBeVisible();

    await userEvent.click(
      grid.getByRole("button", { name: "Remove Receipt 1.jpg" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Remove Receipt 1.jpg?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(grid.queryByText("Receipt 1.jpg")).toBeNull();
    });
  },
};

/** An invoice copy (PDF) posted with a remark. */
export const InvoiceRemarkWithPdf: Story = {
  args: { documentType: "invoice" },
  beforeEach: withApi({ remarks: [], files: [] }, true),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText("No files yet. Add a receipt, a PDF or photos.");
    const box = canvas.getByPlaceholderText("Add a remark…");
    await userEvent.type(box, "Supplier's signed copy.");
    await userEvent.upload(
      canvas.getByLabelText("Choose files for the remark"),
      file("Signed invoice.pdf", 300_000, "application/pdf"),
    );
    const toPost = within(canvas.getByRole("list", { name: "Files to post" }));
    await expect(await toPost.findByText("Uploading 64%")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Post" })).toBeDisabled();
    xhr?.release();
    await waitFor(async () => {
      await expect(canvas.getByRole("button", { name: "Post" })).toBeEnabled();
    });
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    const thread = within(await canvas.findByRole("list", { name: "Remarks" }));
    await expect(
      await thread.findByRole("button", { name: "Open Signed invoice.pdf" }),
    ).toBeVisible();
    const path = BASE.replace("petty_cash_voucher", "invoice");
    await expect(calls("POST", `${path}/remarks`)[0]?.body).toMatchObject({
      body: "Supplier's signed copy.",
      fileIds: [expect.any(String)],
    });
  },
};

/** The server refuses the remark: its message stays under the box. */
export const PostRefused: Story = {
  beforeEach: withApi({
    postError: {
      status: 402,
      code: "PLAN_EXPIRED",
      message: "Your plan has ended. Renew it to keep working.",
    },
  }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByPlaceholderText("Add a remark…"),
      "Checked.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    await expect(
      await canvas.findByText("Your plan has ended. Renew it to keep working."),
    ).toBeVisible();
  },
};

/** Read only: remarks can be written, but no files added or removed. */
export const ReadOnly: Story = {
  args: { canEdit: false },
  beforeEach: withApi({ canAttach: false, canUpload: false }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByPlaceholderText("Add a remark…"),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Attach" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add files" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Remove/ })).toBeNull();
    await expect(
      await canvas.findByRole("link", { name: "Open Receipt 1.jpg" }),
    ).toBeVisible();
  },
};

/** At 20 files the document is full: Add files is off and says why. */
export const Full: Story = {
  beforeEach: withApi({
    remarks: [],
    files: Array.from({ length: 20 }, (_, index) =>
      financeFile(`Receipt ${String(index + 1)}.jpg`),
    ),
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Photos & receipts" });
    await expect(
      canvas.getByRole("button", { name: "Add files" }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(
        "This document has 20 files, the most it can keep. Remove one to add another.",
      ),
    ).toBeVisible();
  },
};

/** Mobile: remarks and files stack without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: withApi(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Remarks" });
    await canvas.findByRole("list", { name: "Photos & receipts" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
