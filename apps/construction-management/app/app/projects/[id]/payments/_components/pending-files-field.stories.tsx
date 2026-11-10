import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fireEvent, waitFor, within } from "storybook/test";
import { Button } from "@repo/ui/components/button";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import type { FinanceDocumentType } from "@/src/finance/domain/finance-documents";
import { FinancePendingFilesField } from "./pending-files-field";
import {
  FINANCE_DOCUMENTS_API,
  mockFinanceDocumentApi,
} from "./finance-document-fixtures";
import { useUploadPendingFinanceFiles } from "./use-upload-pending-files";

let api: ReturnType<typeof mockApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const NEW_ID = "0199c4a0-0000-7000-8000-0000000b0001";

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi() {
  return () => {
    const documents = mockFinanceDocumentApi({ files: [], remarks: [] });
    api = mockApi(
      (call) =>
        documents(call) ??
        (call.method === "POST" && call.path === "/api/demo/vouchers"
          ? Response.json({ id: NEW_ID }, { status: 201 })
          : undefined),
    );
    xhr = mockXhrUploads({ stepMs: 5 });
    return () => {
      xhr?.restore();
      api.restore();
    };
  };
}

function file(name: string, size: number, type: string) {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

/**
 * A new form's files field, saved the way a real form does: create the
 * document, then `uploadAll(saved.id, files)`.
 */
function NewFormDemo({ documentType }: { documentType: FinanceDocumentType }) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const { uploadAll, uploading, done, total } =
    useUploadPendingFinanceFiles(documentType);
  return (
    <form
      noValidate
      className="w-full max-w-4xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const created = await fetch("/api/demo/vouchers", {
            method: "POST",
            body: JSON.stringify({}),
          });
          const saved = (await created.json()) as { id: string };
          const { uploaded, failed } = await uploadAll(saved.id, files);
          setResult(
            `Saved with ${String(uploaded.length)} uploaded, ${String(failed.length)} failed.`,
          );
        })();
      }}
    >
      <FinancePendingFilesField
        documentType={documentType}
        value={files}
        onChange={setFiles}
      />
      <Button type="submit" disabled={uploading}>
        {uploading ? `Uploading ${String(done)} of ${String(total)}…` : "Save"}
      </Button>
      {result == null ? null : <p>{result}</p>}
    </form>
  );
}

const meta = {
  title: "Finance/Documents/Pending files field",
  component: NewFormDemo,
  args: { documentType: "petty_cash_voucher" },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <NewFormDemo {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewFormDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Picking receipts on a new voucher: tiles appear, nothing uploads yet. */
export const PickingReceipts: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Photos & receipts")).toBeVisible();
    await fireEvent.change(
      canvas.getByLabelText("Choose files for Photos & receipts"),
      {
        target: {
          files: [
            file("Diesel bill.jpg", 800_000, "image/jpeg"),
            file("Shop invoice.pdf", 60_000, "application/pdf"),
            file("Statement.xlsx", 10_000, ""),
          ],
        },
      },
    );
    const tiles = within(
      canvas.getByRole("list", { name: "Photos & receipts to upload" }),
    );
    await expect(tiles.getAllByRole("listitem")).toHaveLength(2);
    await expect(tiles.getByText("Diesel bill.jpg")).toBeVisible();
    await expect(
      canvas.getByText(
        "Statement.xlsx: Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
      ),
    ).toBeVisible();
    await expect(api.calls).not.toHaveBeenCalled();

    await userEvent.click(
      tiles.getByRole("button", { name: "Remove Diesel bill.jpg" }),
    );
    await expect(tiles.getAllByRole("listitem")).toHaveLength(1);
    await expect(tiles.queryByText("Diesel bill.jpg")).toBeNull();
  },
};

/** Any other finance document names the field "Files"; too large is refused. */
export const TransactionFiles: Story = {
  args: { documentType: "transaction" },
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Files")).toBeVisible();
    await expect(
      canvas.getByText(
        "PDF or photos (PNG, JPEG or WebP), up to 25 MB each. They upload when you save.",
      ),
    ).toBeVisible();
    await userEvent.upload(canvas.getByLabelText("Choose files for Files"), [
      file("Bank advice.pdf", 90_000, "application/pdf"),
      file("Huge.jpg", 26 * 1024 * 1024, "image/jpeg"),
    ]);
    const tiles = within(canvas.getByRole("list", { name: "Files to upload" }));
    await expect(tiles.getByText("Bank advice.pdf")).toBeVisible();
    await expect(
      canvas.getByText("Huge.jpg: Files can be at most 25 MB."),
    ).toBeVisible();
  },
};

/** Save: the document is created first, then each file uploads to it. */
export const UploadsAfterSave: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      canvas.getByLabelText("Choose files for Photos & receipts"),
      [
        file("Bill 1.jpg", 800_000, "image/jpeg"),
        file("Bill 2.jpg", 700_000, "image/jpeg"),
      ],
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Saved with 2 uploaded, 0 failed."),
    ).toBeVisible();
    const base = `${FINANCE_DOCUMENTS_API}/petty_cash_voucher/${NEW_ID}/files`;
    await waitFor(async () => {
      await expect(
        calls("POST", `${base}/uploads`).map((call) => call.body),
      ).toEqual([
        { fileName: "Bill 1.jpg", bytes: 800_000 },
        { fileName: "Bill 2.jpg", bytes: 700_000 },
      ]);
    });
    await expect(calls("POST", base)).toHaveLength(2);
  },
};
