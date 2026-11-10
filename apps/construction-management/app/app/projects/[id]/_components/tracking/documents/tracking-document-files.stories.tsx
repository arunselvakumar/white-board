import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor, within } from "storybook/test";

import {
  StoryQueries,
  mockApi,
  type ApiCall,
} from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import {
  TRACKING_DOCUMENTS_API,
  TRACKING_SAMPLE_DOCUMENT,
  mockTrackingDocumentApi,
  type TrackingDocumentApiOptions,
} from "./tracking-document-fixtures";
import { TrackingDocumentFiles } from "./tracking-document-files";

let api: ReturnType<typeof mockApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const BASE = `${TRACKING_DOCUMENTS_API}/${TRACKING_SAMPLE_DOCUMENT.type}/${TRACKING_SAMPLE_DOCUMENT.id}`;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi(options: TrackingDocumentApiOptions = {}, uploads = false) {
  return () => {
    api = mockApi(mockTrackingDocumentApi(options));
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
  title: "Tracking/Documents/Files",
  component: TrackingDocumentFiles,
  args: {
    documentType: TRACKING_SAMPLE_DOCUMENT.type,
    documentId: TRACKING_SAMPLE_DOCUMENT.id,
    canEdit: true,
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-4xl">
        <TrackingDocumentFiles {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof TrackingDocumentFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An issue's own photos and PDF; an update's photo stays with the update. */
export const IssueFiles: Story = {
  beforeEach: withApi(),
  play: async ({ canvas }) => {
    const grid = within(await canvas.findByRole("list", { name: "Files" }));
    await expect(grid.getAllByRole("listitem")).toHaveLength(3);
    await expect(grid.getByText("Structural note.pdf")).toBeVisible();
    await expect(grid.queryByText("Patch done.jpg")).toBeNull();
    await expect(
      canvas.getByText("PDF or photos (PNG, JPEG or WebP), up to 25 MB each."),
    ).toBeVisible();
    // Someone else's photo: no remove for this viewer.
    await expect(
      grid.queryByRole("button", { name: "Remove Wall east.jpg" }),
    ).toBeNull();
  },
};

/** A task with no photos yet: photos only. */
export const EmptyTask: Story = {
  args: { documentType: "task" },
  beforeEach: withApi({ files: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No photos yet. Add photos of the work."),
    ).toBeVisible();
    await expect(canvas.getByRole("heading", { name: "Photos" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add photos" }),
    ).toBeVisible();
  },
};

/** A file uploads with progress; a program is refused at once; × removes. */
export const UploadingAndRemoving: Story = {
  beforeEach: withApi({}, true),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const grid = within(await canvas.findByRole("list", { name: "Files" }));
    await fireEvent.change(canvas.getByLabelText("Choose files for Files"), {
      target: {
        files: [
          file("Site visit.pdf", 2 * 1024 * 1024, "application/pdf"),
          file("Setup.exe", 1024, "application/octet-stream"),
        ],
      },
    });
    await expect(
      await grid.findByRole("progressbar", { name: "Site visit.pdf upload" }),
    ).toBeVisible();
    await expect(
      grid.getByText(
        "Only a PDF or a photo (PNG, JPEG or WebP) can be added here.",
      ),
    ).toBeVisible();
    await expect(calls("POST", `${BASE}/files/uploads`)).toHaveLength(1);
    xhr?.release();
    await expect(
      await grid.findByRole("link", { name: "Open Site visit.pdf" }),
    ).toBeVisible();

    await userEvent.click(
      grid.getByRole("button", { name: "Remove Structural note.pdf" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Remove Structural note.pdf?",
      }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(grid.queryByText("Structural note.pdf")).toBeNull();
    });
  },
};

/** Read only: files open, but none can be added or removed. */
export const ReadOnly: Story = {
  args: { canEdit: false },
  beforeEach: withApi({ canUpload: false }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("link", { name: "Open Structural note.pdf" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add files" }),
    ).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Remove/ })).toBeNull();
  },
};

/** Mobile: the grid wraps without sideways scroll. */
export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  beforeEach: withApi(),
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByRole("list", { name: "Files" });
    const root = canvasElement.ownerDocument.documentElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
  },
};
