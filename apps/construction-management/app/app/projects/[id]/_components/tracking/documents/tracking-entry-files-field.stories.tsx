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
import type { TrackingDocumentFile } from "@/src/queries/tracking-documents";
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";
import {
  TRACKING_DOCUMENTS_API,
  TRACKING_SAMPLE_DOCUMENT,
  mockTrackingDocumentApi,
} from "./tracking-document-fixtures";
import { TrackingEntryFilesField } from "./tracking-entry-files-field";
import { TrackingFileStrip } from "./tracking-file-strip";

let api: ReturnType<typeof mockApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const DEMO_POST = "/api/demo/updates";

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi(holdAt?: number) {
  return () => {
    const files = mockTrackingDocumentApi({ files: [] });
    api = mockApi(
      (call) =>
        files(call) ??
        (call.method === "POST" && call.path === DEMO_POST
          ? Response.json({ ok: true }, { status: 201 })
          : undefined),
    );
    xhr = mockXhrUploads(holdAt == null ? { stepMs: 5 } : { holdAt });
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
 * An entry composer the way a feature builds one: photos upload at once,
 * Post sends their ids with the entry, and the posted entry shows its
 * files as a strip.
 */
function ComposerDemo({
  documentType,
  photosOnly,
}: {
  documentType: TrackingDocumentType;
  photosOnly: boolean;
}) {
  const [files, setFiles] = useState<TrackingDocumentFile[]>([]);
  const [posted, setPosted] = useState<TrackingDocumentFile[] | null>(null);
  return (
    <form
      noValidate
      className="w-full max-w-4xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          await fetch(DEMO_POST, {
            method: "POST",
            body: JSON.stringify({ fileIds: files.map((item) => item.id) }),
          });
          setPosted(files);
          setFiles([]);
        })();
      }}
    >
      <TrackingEntryFilesField
        documentType={documentType}
        documentId={TRACKING_SAMPLE_DOCUMENT.id}
        value={files}
        onChange={setFiles}
        photosOnly={photosOnly}
      />
      <Button type="submit">Post</Button>
      {posted == null ? null : (
        <TrackingFileStrip files={posted} label="Posted with the update" />
      )}
    </form>
  );
}

const meta = {
  title: "Tracking/Documents/Entry files field",
  component: ComposerDemo,
  args: { documentType: "issue", photosOnly: true },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <ComposerDemo {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof ComposerDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An issue update's photos: a PDF is refused, photos upload and post by id. */
export const IssueUpdatePhotos: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await fireEvent.change(canvas.getByLabelText("Choose photos for Photos"), {
      target: {
        files: [
          file("Patch done.jpg", 800_000, "image/jpeg"),
          file("Note.pdf", 10_000, "application/pdf"),
        ],
      },
    });
    await expect(
      canvas.getByText(
        "Note.pdf: Only photos (PNG, JPEG or WebP) can be added here.",
      ),
    ).toBeVisible();
    const toPost = within(
      await canvas.findByRole("list", { name: "Photos to post" }),
    );
    await expect(
      await toPost.findByRole("link", { name: "Open Patch done.jpg" }),
    ).toBeVisible();
    const base = `${TRACKING_DOCUMENTS_API}/issue/${TRACKING_SAMPLE_DOCUMENT.id}/files`;
    await expect(calls("POST", `${base}/uploads`)).toHaveLength(1);

    await userEvent.click(canvas.getByRole("button", { name: "Post" }));
    const strip = within(
      await canvas.findByRole("list", { name: "Posted with the update" }),
    );
    await expect(
      strip.getByRole("link", { name: "Open Patch done.jpg" }),
    ).toBeVisible();
    await waitFor(async () => {
      await expect(calls("POST", DEMO_POST)).toHaveLength(1);
    });
    await expect(
      canvas.queryByRole("list", { name: "Photos to post" }),
    ).toBeNull();
  },
};

/** An observation takes a PDF; an upload shows progress until it is done. */
export const ObservationWithPdf: Story = {
  args: { documentType: "inspection", photosOnly: false },
  beforeEach: withApi(64),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(
        "PDF or photos (PNG, JPEG or WebP), up to 25 MB each. They upload now and post with it.",
      ),
    ).toBeVisible();
    await fireEvent.change(canvas.getByLabelText("Choose files for Files"), {
      target: {
        files: [file("Checklist.pdf", 2 * 1024 * 1024, "application/pdf")],
      },
    });
    const toPost = within(
      await canvas.findByRole("list", { name: "Files to post" }),
    );
    await expect(
      await toPost.findByRole("progressbar", { name: "Checklist.pdf upload" }),
    ).toBeVisible();
    xhr?.release();
    await expect(
      await toPost.findByRole("link", { name: "Open Checklist.pdf" }),
    ).toBeVisible();
  },
};

/** × on an uploaded photo removes it from the document and the entry. */
export const RemovingAnUpload: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await fireEvent.change(canvas.getByLabelText("Choose photos for Photos"), {
      target: { files: [file("Blurry.jpg", 500_000, "image/jpeg")] },
    });
    const toPost = within(
      await canvas.findByRole("list", { name: "Photos to post" }),
    );
    await userEvent.click(
      await toPost.findByRole("button", { name: "Remove Blurry.jpg" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Remove Blurry.jpg?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(async () => {
      await expect(
        canvas.queryByRole("list", { name: "Photos to post" }),
      ).toBeNull();
    });
  },
};
