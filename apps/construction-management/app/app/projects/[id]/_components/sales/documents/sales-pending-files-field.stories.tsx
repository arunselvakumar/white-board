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

import {
  SALES_DOCUMENTS_API,
  mockSalesDocumentApi,
} from "./sales-document-fixtures";
import { SalesPendingFilesField } from "./sales-pending-files-field";
import { useUploadPendingSalesFiles } from "./use-upload-pending-sales-files";

let api: ReturnType<typeof mockApi>;
let xhr: ReturnType<typeof mockXhrUploads> | null = null;

const NEW_ID = "0199c4a0-0000-7000-8000-0000005b0001";

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function withApi() {
  return () => {
    const documents = mockSalesDocumentApi();
    api = mockApi(
      (call) =>
        documents(call) ??
        (call.method === "POST" && call.path === "/api/demo/inquiries"
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

/** A new inquiry's Visiting Card and photos, saved the way the form does. */
function NewInquiryDemo() {
  const [card, setCard] = useState<File[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const { uploadAll, uploading } = useUploadPendingSalesFiles("inquiry");
  return (
    <form
      noValidate
      className="w-full max-w-4xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const created = await fetch("/api/demo/inquiries", {
            method: "POST",
            body: JSON.stringify({}),
          });
          const saved = (await created.json()) as { id: string };
          const { uploaded, failed } = await uploadAll(saved.id, [
            { role: "visiting_card", files: card },
            { role: "photo", files: photos },
          ]);
          setResult(
            `Saved with ${String(uploaded.length)} uploaded, ${String(failed.length)} failed.`,
          );
        })();
      }}
    >
      <SalesPendingFilesField
        documentType="inquiry"
        role="visiting_card"
        label="Visiting Card"
        value={card}
        onChange={setCard}
      />
      <SalesPendingFilesField
        documentType="inquiry"
        role="photo"
        label="Photos"
        value={photos}
        onChange={setPhotos}
      />
      <Button type="submit" disabled={uploading}>
        Save
      </Button>
      {result == null ? null : <p>{result}</p>}
    </form>
  );
}

const meta = {
  title: "Sales/Documents/Pending files field",
  component: NewInquiryDemo,
  parameters: { layout: "padded" },
  beforeEach: withApi(),
  render: () => (
    <StoryQueries>
      <NewInquiryDemo />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewInquiryDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One Visiting Card (a new pick replaces it); a PDF is refused. */
export const VisitingCard: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText("Choose files for Visiting Card");
    await fireEvent.change(input, {
      target: { files: [file("Card front.jpg", 300_000, "image/jpeg")] },
    });
    const tiles = within(
      canvas.getByRole("list", { name: "Visiting Card to upload" }),
    );
    await expect(tiles.getByText("Card front.jpg")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Replace Visiting Card" }),
    ).toBeVisible();
    await fireEvent.change(input, {
      target: { files: [file("Card back.jpg", 300_000, "image/jpeg")] },
    });
    await expect(tiles.getAllByRole("listitem")).toHaveLength(1);
    await expect(tiles.getByText("Card back.jpg")).toBeVisible();
    await fireEvent.change(input, {
      target: { files: [file("Card.pdf", 30_000, "application/pdf")] },
    });
    await expect(
      canvas.getByText(
        "Card.pdf: Only a photo (PNG, JPEG or WebP) can be added here.",
      ),
    ).toBeVisible();
    await expect(api.calls).not.toHaveBeenCalled();
  },
};

/** Save: the inquiry first, then each file uploads with its role. */
export const UploadsAfterSave: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      canvas.getByLabelText("Choose files for Visiting Card"),
      [file("Card.jpg", 300_000, "image/jpeg")],
    );
    await userEvent.upload(canvas.getByLabelText("Choose files for Photos"), [
      file("Plot.jpg", 800_000, "image/jpeg"),
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Saved with 2 uploaded, 0 failed."),
    ).toBeVisible();
    const base = `${SALES_DOCUMENTS_API}/inquiry/${NEW_ID}/files`;
    await waitFor(async () => {
      await expect(
        calls("POST", `${base}/uploads`).map((call) => call.body),
      ).toEqual([
        { role: "visiting_card", fileName: "Card.jpg", bytes: 300_000 },
        { role: "photo", fileName: "Plot.jpg", bytes: 800_000 },
      ]);
    });
  },
};
