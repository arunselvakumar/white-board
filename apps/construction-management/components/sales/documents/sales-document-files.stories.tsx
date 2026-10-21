import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, mockApi } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";

import { mockSalesDocumentApi, salesFile } from "./sales-document-fixtures";
import { SalesDocumentFiles } from "./sales-document-files";

const INQUIRY_ID = "0199c4a0-0000-7000-8000-000000510001";

function withApi(options: Parameters<typeof mockSalesDocumentApi>[0] = {}) {
  return () => {
    const api = mockApi(mockSalesDocumentApi(options));
    const xhr = mockXhrUploads({ stepMs: 5 });
    return () => {
      xhr.restore();
      api.restore();
    };
  };
}

function file(name: string, size: number, type: string) {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

const meta = {
  title: "Sales/Documents/Files",
  component: SalesDocumentFiles,
  args: {
    documentType: "inquiry",
    documentId: INQUIRY_ID,
    roles: [
      { role: "visiting_card", label: "Visiting Card" },
      { role: "photo", label: "Photos" },
    ],
    canEdit: true,
    heading: "Visiting Card and photos",
  },
  parameters: { layout: "padded" },
  render: (args) => (
    <StoryQueries>
      <div className="w-full max-w-4xl">
        <SalesDocumentFiles {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof SalesDocumentFiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing yet: each role says so; a Visiting Card is added. */
export const Empty: Story = {
  beforeEach: withApi(),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("No visiting card yet."),
    ).toBeVisible();
    await expect(canvas.getByText("No photos yet.")).toBeVisible();
    await userEvent.upload(
      canvas.getByLabelText("Choose files for Visiting Card"),
      [file("Card.jpg", 300_000, "image/jpeg")],
    );
    const cards = await canvas.findByRole("list", { name: "Visiting Card" });
    await expect(await within(cards).findByText("Card.jpg")).toBeVisible();
    // One card only: no more Add.
    await waitFor(() =>
      expect(
        canvas.queryByRole("button", { name: "Add Visiting Card" }),
      ).toBeNull(),
    );
  },
};

/** Saved files by role; someone else's photo offers no ×. */
export const WithFiles: Story = {
  beforeEach: withApi({
    files: [
      salesFile("Card.jpg", "visiting_card"),
      salesFile("Plot.jpg", "photo", { canRemove: false }),
    ],
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const cards = await canvas.findByRole("list", { name: "Visiting Card" });
    await expect(within(cards).getByText("Card.jpg")).toBeVisible();
    const photos = canvas.getByRole("list", { name: "Photos" });
    await expect(
      within(photos).queryByRole("button", { name: "Remove Plot.jpg" }),
    ).toBeNull();
    await userEvent.click(
      within(cards).getByRole("button", { name: "Remove Card.jpg" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Remove Card.jpg?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await expect(
      await canvas.findByText("No visiting card yet."),
    ).toBeVisible();
  },
};

/** Read only: files show, nothing to add or remove. */
export const ReadOnly: Story = {
  args: { canEdit: false },
  beforeEach: withApi({
    files: [salesFile("Card.jpg", "visiting_card")],
    canUpload: false,
  }),
  play: async ({ canvas }) => {
    await canvas.findByRole("list", { name: "Visiting Card" });
    await expect(canvas.queryByRole("button", { name: /^Add / })).toBeNull();
    await expect(canvas.queryByRole("button", { name: /^Remove / })).toBeNull();
  },
};
