import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import { SiteWorkDocumentActivity } from "./site-work-document-activity";
import {
  SITE_WORK_DOCUMENTS_API,
  SITE_WORK_SAMPLE_DOCUMENT,
  mockSiteWorkDocumentApi,
  siteWorkFile,
  type SiteWorkDocumentApiOptions,
} from "./site-work-document-fixtures";

let api: ReturnType<typeof mockApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const BASE = `${SITE_WORK_DOCUMENTS_API}/${SITE_WORK_SAMPLE_DOCUMENT.type}/${SITE_WORK_SAMPLE_DOCUMENT.id}`;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi(options: SiteWorkDocumentApiOptions = {}, uploads = false) {
  return () => {
    api = mockApi(mockSiteWorkDocumentApi(options));
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
  title: "Site work/Documents/Activity",
  component: SiteWorkDocumentActivity,
  args: {
    documentType: SITE_WORK_SAMPLE_DOCUMENT.type,
    documentId: SITE_WORK_SAMPLE_DOCUMENT.id,
    canEdit: true,
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-6xl">
        <SiteWorkDocumentActivity {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof SiteWorkDocumentActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A worksheet's remarks with a photo, and its Work Photos. */
export const Worksheet: Story = {
  beforeEach: withApi(),
  play: async ({ canvas }) => {
    const thread = within(await canvas.findByRole("list", { name: "Remarks" }));
    const items = thread
      .getAllByRole("listitem")
      .filter((item) => item.parentElement?.tagName === "OL");
    await expect(items).toHaveLength(2);
    await expect(items[0]).toHaveTextContent("Arun Selva Kumar");
    await expect(
      thread.getByText("Cast at 3 pm. Curing started."),
    ).toBeVisible();
    await expect(
      thread.getByRole("button", { name: "Open Curing C4.jpg" }),
    ).toBeVisible();
    const photos = within(
      await canvas.findByRole("list", { name: "Work Photos" }),
    );
    // The remark's photo stays under the remark.
    await expect(photos.queryByText("Curing C4.jpg")).toBeNull();
    await expect(photos.getByText("Column C4 before.jpg")).toBeVisible();
    await expect(
      canvas.getByText("Photos (PNG, JPEG or WebP), up to 25 MB each."),
    ).toBeVisible();
    // Someone else's photo: no remove for this viewer.
    await expect(
      photos.queryByRole("button", { name: "Remove Column C4 after.jpg" }),
    ).toBeNull();
  },
};

/** A new Site Diary: no remarks and no photos yet. */
export const EmptySiteDiary: Story = {
  args: { documentType: "site_diary" },
  beforeEach: withApi({ remarks: [], files: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No remarks yet. Write the first remark below."),
    ).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Photos" })).toBeVisible();
    await expect(
      canvas.getByText("No photos yet. Add photos of the work."),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add photos" }),
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

    await userEvent.type(box, "Shuttering on grid C is loose.");
    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    const thread = within(canvas.getByRole("list", { name: "Remarks" }));
    await expect(
      await thread.findByText("Shuttering on grid C is loose."),
    ).toBeVisible();
    await expect(calls("POST", `${BASE}/remarks`)[0]?.body).toEqual({
      body: "Shuttering on grid C is loose.",
      fileIds: [],
    });
    await waitFor(async () => {
      await expect(box).toHaveValue("");
    });
  },
};

/** Work Photos: a photo uploads with progress; a PDF is refused at once. */
export const AddingPhotos: Story = {
  beforeEach: withApi({}, true),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grid = within(
      await canvas.findByRole("list", { name: "Work Photos" }),
    );
    // "All files" in the picker lets a PDF through `accept`; the field refuses it.
    await fireEvent.change(
      canvas.getByLabelText("Choose photos for Work Photos"),
      {
        target: {
          files: [
            file("Slab level 3.jpg", 2 * 1024 * 1024, "image/jpeg"),
            file("Report.pdf", 1024, "application/pdf"),
          ],
        },
      },
    );
    await expect(
      await grid.findByRole("progressbar", { name: "Slab level 3.jpg upload" }),
    ).toBeVisible();
    await expect(
      grid.getByText("Only photos (PNG, JPEG or WebP) can be added here."),
    ).toBeVisible();
    await expect(calls("POST", `${BASE}/files/uploads`)).toHaveLength(1);
    xhr?.release();
    await expect(
      await grid.findByRole("link", { name: "Open Slab level 3.jpg" }),
    ).toBeVisible();

    await userEvent.click(
      grid.getByRole("button", { name: "Remove Column C4 before.jpg" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Remove Column C4 before.jpg?",
      }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(grid.queryByText("Column C4 before.jpg")).toBeNull();
    });
  },
};

/** A hindrance takes a PDF too, and posts it with a remark. */
export const HindranceRemarkWithPdf: Story = {
  args: { documentType: "hindrance" },
  beforeEach: withApi({ remarks: [], files: [] }, true),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("No files yet. Add a PDF or photos."),
    ).toBeVisible();
    const box = canvas.getByPlaceholderText("Add a remark…");
    await userEvent.type(box, "Client letter on the drawing delay.");
    await userEvent.upload(
      canvas.getByLabelText("Choose files for the remark"),
      file("Client letter.pdf", 300_000, "application/pdf"),
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
      await thread.findByRole("button", { name: "Open Client letter.pdf" }),
    ).toBeVisible();
    const path = BASE.replace("worksheet", "hindrance");
    await expect(calls("POST", `${path}/remarks`)[0]?.body).toMatchObject({
      body: "Client letter on the drawing delay.",
      fileIds: [expect.any(String)],
    });
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
      canvas.queryByRole("button", { name: "Add photos" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Remove/ })).toBeNull();
    await expect(
      await canvas.findByRole("link", { name: "Open Column C4 before.jpg" }),
    ).toBeVisible();
  },
};

/** At 20 files the document is full: Add photos is off and says why. */
export const Full: Story = {
  beforeEach: withApi({
    remarks: [],
    files: Array.from({ length: 20 }, (_, index) =>
      siteWorkFile(`Photo ${String(index + 1)}.jpg`),
    ),
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Work Photos" });
    await expect(
      canvas.getByRole("button", { name: "Add photos" }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(
        "This document has 20 photos, the most it can keep. Remove one to add another.",
      ),
    ).toBeVisible();
  },
};

/** Mobile: remarks and photos stack without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: withApi(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Remarks" });
    await canvas.findByRole("list", { name: "Work Photos" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
