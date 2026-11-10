import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import {
  DocumentActivity,
  DocumentFiles,
  type DocumentActivityProps,
  type DocumentFilesProps,
} from "./document-activity";
import {
  DOCUMENTS_API,
  SAMPLE_DOCUMENT,
  mockDocumentsApi,
  type DocumentsApiOptions,
} from "./document-fixtures";

let api: ReturnType<typeof mockDocumentsApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const BASE = `${DOCUMENTS_API}/${SAMPLE_DOCUMENT.type}/${SAMPLE_DOCUMENT.id}`;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi(options: DocumentsApiOptions = {}, uploads = false) {
  return () => {
    api = mockDocumentsApi(options);
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

/** A detail page's lower half: the thread and the files side by side. */
function DetailSections(
  props: DocumentActivityProps & Pick<DocumentFilesProps, "canEdit">,
) {
  return (
    <div className="grid w-full max-w-4xl gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <DocumentActivity
        documentType={props.documentType}
        documentId={props.documentId}
        {...(props.heading == null ? {} : { heading: props.heading })}
      />
      <DocumentFiles
        documentType={props.documentType}
        documentId={props.documentId}
        canEdit={props.canEdit}
      />
    </div>
  );
}

const meta = {
  title: "Procurement/Documents/Activity and files",
  component: DetailSections,
  args: {
    documentType: SAMPLE_DOCUMENT.type,
    documentId: SAMPLE_DOCUMENT.id,
    canEdit: true,
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <DetailSections {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof DetailSections>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A Purchase Order's remarks, oldest first, a reply with its quote. */
export const Thread: Story = {
  beforeEach: withApi(),
  play: async ({ canvas }) => {
    const thread = within(await canvas.findByRole("list", { name: "Remarks" }));
    const items = thread
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.tagName === "OL");
    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent("Arun Selva Kumar");
    await expect(items[0]).toHaveTextContent("AK");
    await expect(thread.getByText(/Rate holds till Friday/)).toBeVisible();
    await expect(thread.getByText("2 h ago")).toBeVisible();
    await expect(
      thread.getByRole("button", { name: "Open Quote SMT-114.pdf" }),
    ).toBeVisible();
    // The quote belongs to the remark, not the attachments.
    const attachments = within(
      await canvas.findByRole("list", { name: "Attachments files" }),
    );
    await expect(attachments.queryByText("Quote SMT-114.pdf")).toBeNull();
    await expect(attachments.getByText("Signed PO.pdf")).toBeVisible();
  },
};

/** A new Material Transfer: no comments yet; the box invites the first. */
export const EmptyThread: Story = {
  args: { documentType: "material_transfer" },
  beforeEach: withApi({ remarks: [], files: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "No comments yet. Write the first comment below.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Comments" }),
    ).toBeVisible();
    await expect(canvas.getByPlaceholderText("Add a comment…")).toBeVisible();
    await expect(
      canvas.getByText(
        "No attachments yet. Attach a quotation, an invoice, a challan or photos.",
      ),
    ).toBeVisible();
  },
};

/** Writing a remark: empty is refused on the spot; Post adds it at the end. */
export const PostingAComment: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    const box = await canvas.findByPlaceholderText("Add a remark…");
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    await expect(await canvas.findByText("Write a few words.")).toBeVisible();
    await expect(calls("POST", `${BASE}/remarks`)).toHaveLength(0);

    await userEvent.type(box, "Approved at ₹62.50. Send the PO today.");
    await expect(canvas.getByText("38/500")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    const thread = within(canvas.getByRole("list", { name: "Remarks" }));
    await expect(
      await thread.findByText("Approved at ₹62.50. Send the PO today."),
    ).toBeVisible();
    await expect(calls("POST", `${BASE}/remarks`)[0]?.body).toEqual({
      body: "Approved at ₹62.50. Send the PO today.",
      fileIds: [],
    });
    await waitFor(async () => {
      await expect(box).toHaveValue("");
    });
  },
};

/** A comment with a photo: it uploads first, then posts with the comment. */
export const CommentWithPhoto: Story = {
  args: { documentType: "goods_receipt" },
  beforeEach: withApi({ remarks: [], files: [] }, true),
  play: async ({ canvas, userEvent }) => {
    const box = await canvas.findByPlaceholderText("Add a remark…");
    await userEvent.type(box, "Two bags torn on arrival.");
    await userEvent.upload(
      canvas.getByLabelText("Choose files for the remark"),
      file("Torn bags.pdf", 300_000, "application/pdf"),
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
      await thread.findByRole("button", { name: "Open Torn bags.pdf" }),
    ).toBeVisible();
    const posted = calls(
      "POST",
      `${BASE.replace("purchase_order", "goods_receipt")}/remarks`,
    );
    await expect(posted[0]?.body).toMatchObject({
      body: "Two bags torn on arrival.",
      fileIds: [expect.any(String)],
    });
  },
};

/** Attachments: upload with progress, then remove after confirming. */
export const FilesUploadAndRemove: Story = {
  beforeEach: withApi({}, true),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grid = within(
      await canvas.findByRole("list", { name: "Attachments files" }),
    );
    await userEvent.upload(
      canvas.getByLabelText("Choose files for Attachments"),
      [
        file("Invoice 2231.pdf", 2 * 1024 * 1024, "application/pdf"),
        file("setup.exe", 1024),
      ],
    );
    await expect(
      await grid.findByRole("progressbar", { name: "Invoice 2231.pdf upload" }),
    ).toBeVisible();
    await expect(grid.getByText("Programs can't be attached.")).toBeVisible();
    await expect(calls("POST", `${BASE}/files/uploads`)[0]?.body).toEqual({
      fileName: "Invoice 2231.pdf",
      bytes: 2 * 1024 * 1024,
    });
    xhr?.release();
    await expect(
      await grid.findByRole("link", { name: "Open Invoice 2231.pdf" }),
    ).toBeVisible();

    // Someone else's photo: no remove for this viewer.
    await expect(
      grid.queryByRole("button", { name: "Remove Site photo.jpg" }),
    ).toBeNull();
    await userEvent.click(
      grid.getByRole("button", { name: "Remove BOQ.xlsx" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Remove BOQ.xlsx?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(grid.queryByText("BOQ.xlsx")).toBeNull();
    });
  },
};

/** Read-only: no box to write, no Attach, no remove. */
export const ReadOnly: Story = {
  args: { canEdit: false },
  beforeEach: withApi({
    canComment: false,
    canAttach: false,
    canUpload: false,
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Remarks" });
    await expect(canvas.queryByPlaceholderText("Add a remark…")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Attach files" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Remove/ })).toBeNull();
    await expect(
      await canvas.findByRole("link", { name: "Open Signed PO.pdf" }),
    ).toBeVisible();
  },
};

/** Read on the document but not Create / Update: comments, no attaching. */
export const CommentWithoutAttach: Story = {
  args: { canEdit: false },
  beforeEach: withApi({ canAttach: false, canUpload: false, files: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByPlaceholderText("Add a remark…"),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Attach" })).toBeNull();
    await expect(await canvas.findByText("No attachments.")).toBeVisible();
  },
};

/** Mobile: the thread and the grid stack without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: withApi(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Remarks" });
    const root = canvasElement.ownerDocument.documentElement;
    const wide = [...canvasElement.querySelectorAll("*")]
      .filter((el) => el.getBoundingClientRect().right > root.clientWidth)
      .map(
        (el) =>
          `${el.tagName}.${String(el.getAttribute("class")).slice(0, 80)}`,
      )
      .slice(0, 6);
    await expect(wide).toEqual([]);
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
