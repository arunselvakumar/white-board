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
import type { TrackingDocumentType } from "@/src/tracking/domain/tracking-documents";

import {
  TRACKING_DOCUMENTS_API,
  mockTrackingDocumentApi,
} from "./tracking-document-fixtures";
import { TrackingPendingFilesField } from "./tracking-pending-files-field";
import { useUploadPendingTrackingFiles } from "./use-upload-pending-tracking-files";

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
    const documents = mockTrackingDocumentApi({ files: [] });
    api = mockApi(
      (call) =>
        documents(call) ??
        (call.method === "POST" && call.path === "/api/demo/issues"
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
 * A new form's photos field, saved the way a real form does: create the
 * document, then `uploadAll(saved.id, files)`.
 */
function NewFormDemo({ documentType }: { documentType: TrackingDocumentType }) {
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const { uploadAll, uploading, done, total } =
    useUploadPendingTrackingFiles(documentType);
  return (
    <form
      noValidate
      className="w-full max-w-4xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const created = await fetch("/api/demo/issues", {
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
      <TrackingPendingFilesField
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
  title: "Tracking/Documents/Pending files field",
  component: NewFormDemo,
  args: { documentType: "task" },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <NewFormDemo {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewFormDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Picking photos on a new task: tiles appear, nothing uploads yet. */
export const PickingPhotos: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Photos")).toBeVisible();
    // "All files" in the picker lets a PDF through `accept`; the field refuses it.
    await fireEvent.change(canvas.getByLabelText("Choose photos for Photos"), {
      target: {
        files: [
          file("Before.jpg", 800_000, "image/jpeg"),
          file("After.png", 600_000, "image/png"),
          file("Report.pdf", 10_000, "application/pdf"),
        ],
      },
    });
    const tiles = within(
      canvas.getByRole("list", { name: "Photos to upload" }),
    );
    await expect(tiles.getAllByRole("listitem")).toHaveLength(2);
    await expect(tiles.getByText("Before.jpg")).toBeVisible();
    await expect(
      canvas.getByText(
        "Report.pdf: Only photos (PNG, JPEG or WebP) can be added here.",
      ),
    ).toBeVisible();
    await expect(api.calls).not.toHaveBeenCalled();

    await userEvent.click(
      tiles.getByRole("button", { name: "Remove Before.jpg" }),
    );
    await expect(tiles.getAllByRole("listitem")).toHaveLength(1);
    await expect(tiles.queryByText("Before.jpg")).toBeNull();
  },
};

/** An issue takes a PDF as well as photos. */
export const IssueTakesPdf: Story = {
  args: { documentType: "issue" },
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Files")).toBeVisible();
    await expect(
      canvas.getByText(
        "PDF or photos (PNG, JPEG or WebP), up to 25 MB each. They upload when you save.",
      ),
    ).toBeVisible();
    await userEvent.upload(canvas.getByLabelText("Choose files for Files"), [
      file("Notice.pdf", 90_000, "application/pdf"),
      file("Huge.jpg", 26 * 1024 * 1024, "image/jpeg"),
    ]);
    const tiles = within(canvas.getByRole("list", { name: "Files to upload" }));
    await expect(tiles.getByText("Notice.pdf")).toBeVisible();
    await expect(
      canvas.getByText("Huge.jpg: Files can be at most 25 MB."),
    ).toBeVisible();
  },
};

/** Save: the document is created first, then each photo uploads to it. */
export const UploadsAfterSave: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(canvas.getByLabelText("Choose photos for Photos"), [
      file("Before.jpg", 800_000, "image/jpeg"),
      file("After.jpg", 700_000, "image/jpeg"),
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Saved with 2 uploaded, 0 failed."),
    ).toBeVisible();
    const base = `${TRACKING_DOCUMENTS_API}/task/${NEW_ID}/files`;
    await waitFor(async () => {
      await expect(
        calls("POST", `${base}/uploads`).map((call) => call.body),
      ).toEqual([
        { fileName: "Before.jpg", bytes: 800_000 },
        { fileName: "After.jpg", bytes: 700_000 },
      ]);
    });
    await expect(calls("POST", base)).toHaveLength(2);
  },
};
