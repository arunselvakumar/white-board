import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, waitFor, within } from "storybook/test";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import {
  DocumentAttachments,
  useUploadHeldFiles,
  type DocumentAttachmentsProps,
  type HeldFile,
} from "./document-attachments";
import { ANUGRAHA, DOCUMENTS_API, mockDocumentsApi } from "./document-fixtures";

let api: ReturnType<typeof mockDocumentsApi>;
const onHeldChange = fn<(next: HeldFile[]) => void>();
let xhr: ReturnType<typeof mockXhrUploads>;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function file(name: string, size: number, type = "") {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

/**
 * One Contract card row as the Project form lays it out: number, date,
 * then the paperclip in a narrow last column; chips wrap underneath.
 */
function ContractRow(props: DocumentAttachmentsProps) {
  const [held, setHeld] = useState<HeldFile[]>([...props.held]);
  return (
    <div className="bg-card w-full max-w-3xl rounded-xl border p-4 sm:p-6">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="client-order-no">PO / WO No.</Label>
          <Input id="client-order-no" defaultValue="WO/2026/031" />
        </div>
        <div className="space-y-1.5 max-sm:col-span-full max-sm:row-start-2">
          <Label htmlFor="client-order-date">Date</Label>
          <Input id="client-order-date" defaultValue="03/03/2026" />
        </div>
        <DocumentAttachments
          {...props}
          held={held}
          onHeldChange={(next) => {
            setHeld(next);
            props.onHeldChange(next);
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Projects/Documents/Attachments",
  component: DocumentAttachments,
  args: {
    projectId: ANUGRAHA.id,
    kind: "client_order",
    label: "PO / WO",
    held: [],
    onHeldChange,
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <ContractRow {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof DocumentAttachments>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Edit Project: the paper's saved files as chips; a picked file uploads at
 * once with progress, and × deletes after asking.
 */
export const OnEdit: Story = {
  beforeEach: () => {
    api = mockDocumentsApi();
    xhr = mockXhrUploads({ holdAt: 64 });
    return () => {
      xhr.restore();
      api.restore();
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const chips = within(
      await canvas.findByRole("list", { name: "PO / WO files" }),
    );
    await expect(
      chips.getByRole("link", { name: "Open Work order signed.pdf" }),
    ).toHaveAttribute(
      "href",
      `${DOCUMENTS_API}/0199c4a0-0000-7000-8000-0000000d0003`,
    );
    // Not viewable in the browser: the chip downloads it.
    await expect(
      chips.getByRole("link", { name: "Open BOQ revised.xlsx" }),
    ).toHaveAttribute(
      "href",
      `${DOCUMENTS_API}/0199c4a0-0000-7000-8000-0000000d0004?download=1`,
    );
    // Only this paper's files.
    await expect(chips.queryByText("Quotation_SBD_114.pdf")).toBeNull();

    await userEvent.upload(
      canvas.getByLabelText("Choose files for PO / WO"),
      file("Work order amendment.pdf", 2 * 1024 * 1024, "application/pdf"),
    );
    await expect(await chips.findByText("Uploading 64%")).toBeVisible();
    await expect(calls("POST", `${DOCUMENTS_API}/uploads`)[0]?.body).toEqual({
      kind: "client_order",
      fileName: "Work order amendment.pdf",
      bytes: 2 * 1024 * 1024,
    });
    xhr.release();
    await expect(
      await chips.findByRole("link", { name: "Open Work order amendment.pdf" }),
    ).toBeVisible();
    await expect(chips.queryByText(/^Uploading/)).toBeNull();

    await userEvent.click(
      chips.getByRole("button", { name: "Delete BOQ revised.xlsx" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Delete BOQ revised.xlsx?",
      }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(chips.queryByText("BOQ revised.xlsx")).toBeNull();
    });
  },
};

/** For review: an upload stopped at 64% beside the saved chips. */
export const OnEditUploading: Story = {
  beforeEach: () => {
    api = mockDocumentsApi();
    xhr = mockXhrUploads({ holdAt: 64 });
    return () => {
      xhr.restore();
      api.restore();
    };
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("list", { name: "PO / WO files" });
    await userEvent.upload(canvas.getByLabelText("Choose files for PO / WO"), [
      file("Work order amendment.pdf", 2 * 1024 * 1024, "application/pdf"),
      file("setup.exe", 1024),
    ]);
    await expect(await canvas.findByText("Uploading 64%")).toBeVisible();
    await expect(
      canvas.getByText("Programs can't be kept on a Project."),
    ).toBeVisible();
  },
};

/** A paper with no files shows just the paperclip. */
export const OnEditNoFiles: Story = {
  args: { kind: "loa", label: "LOA" },
  beforeEach: () => {
    api = mockDocumentsApi();
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("button", { name: "Attach file to LOA" }),
    ).toBeVisible();
    await waitFor(async () => {
      await expect(calls("GET", DOCUMENTS_API)).toHaveLength(1);
    });
    await expect(canvas.queryByRole("list")).toBeNull();
  },
};

/**
 * Add Project: picked files wait in `held` until the Project is saved;
 * programs and files over 25 MB are refused on the spot.
 */
export const OnAdd: Story = {
  args: { projectId: null },
  beforeEach: () => {
    api = mockDocumentsApi();
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(canvas.getByLabelText("Choose files for PO / WO"), [
      file("Work order signed.pdf", 1.2 * 1024 * 1024, "application/pdf"),
      file("BOQ revised.xlsx", 420 * 1024),
      file("tally-setup.exe", 1024),
      file("Drone survey.mp4", 90 * 1024 * 1024, "video/mp4"),
    ]);
    const chips = within(canvas.getByRole("list", { name: "PO / WO files" }));
    await expect(
      chips.getByText("1.2 MB · Uploads when you save"),
    ).toBeVisible();
    await expect(
      chips.getByText("420 KB · Uploads when you save"),
    ).toBeVisible();
    await expect(
      chips.getByText("Programs can't be kept on a Project."),
    ).toBeVisible();
    await expect(chips.getByText("Files can be at most 25 MB.")).toBeVisible();

    const held = onHeldChange;
    const last = held.mock.lastCall?.[0] ?? [];
    await expect(last.map((item) => [item.kind, item.file.name])).toEqual([
      ["client_order", "Work order signed.pdf"],
      ["client_order", "BOQ revised.xlsx"],
    ]);

    await userEvent.click(
      chips.getByRole("button", { name: "Remove BOQ revised.xlsx" }),
    );
    await expect(chips.queryByText("BOQ revised.xlsx")).toBeNull();
    await expect(
      (held.mock.lastCall?.[0] ?? []).map((item) => item.file.name),
    ).toEqual(["Work order signed.pdf"]);
    await userEvent.click(
      chips.getByRole("button", { name: "Dismiss tally-setup.exe" }),
    );
    await expect(chips.queryByText("tally-setup.exe")).toBeNull();
    await expect(api.calls).not.toHaveBeenCalled();
  },
};

/** Disabled while the form saves: no picking, no removing. */
export const Disabled: Story = {
  args: { projectId: null, disabled: true },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Attach file to PO / WO" }),
    ).toBeDisabled();
  },
};

const HELD: HeldFile[] = [
  {
    id: "held-1",
    kind: "quotation",
    file: file("Quotation_SBD_114.pdf", 1.2 * 1024 * 1024, "application/pdf"),
  },
  {
    id: "held-2",
    kind: "client_order",
    file: file("Work order signed.pdf", 1.1 * 1024 * 1024, "application/pdf"),
  },
  { id: "held-3", kind: "other", file: file("BOQ revised.xlsx", 420 * 1024) },
];

function HeldUploader() {
  const { upload, status } = useUploadHeldFiles();
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={() => {
          void upload(ANUGRAHA.id, HELD).then(({ failed }) => {
            setResult(
              `Failed: ${failed.map((item) => item.file.name).join(", ") || "none"}`,
            );
          });
        }}
      >
        Add Project
      </Button>
      <p role="status">
        {status == null
          ? "Idle"
          : `Uploading files ${String(status.done)} of ${String(status.total)}`}
      </p>
      {result == null ? null : <p>{result}</p>}
    </div>
  );
}

/**
 * After Add Project the held files go up one at a time; `status` counts
 * them and a failed file is reported, not thrown.
 */
export const UploadHeldFiles: Story = {
  beforeEach: () => {
    // The second file is refused at completion.
    api = mockDocumentsApi({
      completeError: {
        fileName: "Work order signed.pdf",
        status: 400,
        code: "UPLOAD_NOT_FOUND",
        message: "The file did not finish uploading. Try again.",
      },
    });
    xhr = mockXhrUploads({ holdAt: 38 });
    return () => {
      xhr.restore();
      api.restore();
    };
  },
  render: () => (
    <StoryQueries>
      <HeldUploader />
    </StoryQueries>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Idle");
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(async () => {
      await expect(canvas.getByRole("status")).toHaveTextContent(
        "Uploading files 0 of 3",
      );
    });
    xhr.release();
    await expect(
      await canvas.findByText("Failed: Work order signed.pdf"),
    ).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("Idle");
    // One at a time, in order.
    await expect(
      calls("POST", DOCUMENTS_API).map(
        (call) => (call.body as { fileName: string }).fileName,
      ),
    ).toEqual([
      "Quotation_SBD_114.pdf",
      "Work order signed.pdf",
      "BOQ revised.xlsx",
    ]);
    await expect(
      calls("POST", `${DOCUMENTS_API}/uploads`).map(
        (call) => (call.body as { kind: string }).kind,
      ),
    ).toEqual(["quotation", "client_order", "other"]);
  },
};
