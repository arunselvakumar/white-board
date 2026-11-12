import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "@/.storybook/mocks/api";
import { mockXhrUploads } from "@/.storybook/mocks/xhr";

import { VisitDetail } from "./visit-detail";
import {
  COMPLETED_ID,
  MARKETING_VISITS_API,
  mockVisitApi,
  visit,
  visitFile,
  visitFiles,
  type VisitApiOptions,
} from "./visit-fixtures";

let api: ReturnType<typeof mockVisitApi>;

const FILES = `${MARKETING_VISITS_API}/${COMPLETED_ID}/files`;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

/** The Visit API; with `uploads`, bytes go up through a mocked XHR too. */
function serve(options: VisitApiOptions = {}, uploads = false) {
  return () => {
    api = mockVisitApi(options);
    const xhr = uploads ? mockXhrUploads({ stepMs: 5 }) : null;
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

const meta = {
  title: "Marketing/Visits/Photos and files",
  component: VisitDetail,
  args: { id: COMPLETED_ID },
  beforeEach: serve({ visits: [visit({ files: visitFiles() })] }),
  parameters: {
    nextjs: {
      navigation: { pathname: `/app/marketing/visits/${COMPLETED_ID}` },
    },
  },
  render: (args) => (
    <StoryQueries>
      <VisitDetail {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof VisitDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Two photos with captions and a PDF, each with its uploader; a colleague's
 * PDF offers no changes. A photo opens in the viewer.
 */
export const WithFiles: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Photos and files" }),
    );
    const [card, site, pdf] = list.getAllByRole("listitem");
    if (card == null || site == null || pdf == null)
      throw new Error("two photos and a PDF");
    await expect(card).toHaveTextContent("card.jpg");
    await expect(card).toHaveTextContent("Senthil's visiting card");
    await expect(card).toHaveTextContent("Ravi Shankar · 410 KB");
    await expect(site).toHaveTextContent("Plot for the PEB warehouse");
    await expect(pdf).toHaveTextContent("Priya Raman · 2.3 MB");
    await expect(
      within(card).getByRole("button", { name: "Change card.jpg" }),
    ).toBeVisible();
    await expect(
      within(pdf).queryByRole("button", { name: "Change requirement.pdf" }),
    ).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Add photos or files" }),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Photos (PNG, JPEG or WebP) up to 10 MB, PDFs up to 25 MB. Up to 20 on a Visit.",
      ),
    ).toBeVisible();

    await userEvent.click(
      within(card).getByRole("link", { name: "Open card.jpg" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const viewer = within(
      await body.findByRole("dialog", { name: "card.jpg" }),
    );
    await expect(
      viewer.getByText("Senthil's visiting card · Ravi Shankar · 410 KB"),
    ).toBeVisible();
    await expect(
      viewer.getByRole("link", { name: "Open in new tab" }),
    ).toHaveAttribute("href", expect.stringMatching(/\/files\/[^/]+$/));
  },
};

/**
 * Adding a photo and a PDF: each starts, sends its bytes and completes,
 * then shows with the History line. A photo over 10 MB is refused in the
 * browser, without a request.
 */
export const AddFiles: Story = {
  beforeEach: serve({ visits: [visit()] }, true),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("No photos or files yet."),
    ).toBeVisible();
    await userEvent.upload(canvas.getByLabelText("Choose photos or files"), [
      file("site.jpg", 800_000, "image/jpeg"),
      file("brochure.pdf", 3_000_000, "application/pdf"),
      file("huge.jpg", 11 * 1024 * 1024, "image/jpeg"),
    ]);
    const list = within(canvas.getByRole("list", { name: "Photos and files" }));
    await expect(
      await list.findByRole("link", { name: "Open site.jpg" }),
    ).toBeVisible();
    await expect(
      await list.findByRole("link", { name: "Open brochure.pdf" }),
    ).toBeVisible();
    await expect(
      within(
        list.getByRole("listitem", { name: "Uploading huge.jpg" }),
      ).getByRole("alert"),
    ).toHaveTextContent("The file must be at most 10 MB.");
    await expect(posts(`${FILES}/uploads`).map((call) => call.body)).toEqual([
      { fileName: "site.jpg", bytes: 800_000 },
      { fileName: "brochure.pdf", bytes: 3_000_000 },
    ]);
    const history = within(canvas.getByRole("list", { name: "History" }));
    await waitFor(() =>
      expect(history.getByText(/Photo added · site\.jpg/)).toBeVisible(),
    );
    await expect(history.getByText(/File added · brochure\.pdf/)).toBeVisible();
  },
};

/**
 * Nineteen files and two more picked: the 20th is kept, the server refuses
 * the next, and adding is closed until one is removed.
 */
export const LimitReached: Story = {
  beforeEach: serve(
    {
      visits: [
        visit({
          files: Array.from({ length: 19 }, (_, index) =>
            visitFile(`photo-${String(index + 1)}.jpg`),
          ),
        }),
      ],
    },
    true,
  ),
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      await canvas.findByLabelText("Choose photos or files"),
      [
        file("one.jpg", 300_000, "image/jpeg"),
        file("two.jpg", 300_000, "image/jpeg"),
      ],
    );
    await expect(
      await canvas.findByText(
        "A Visit keeps up to 20 photos and files. Remove one to add another.",
      ),
    ).toBeVisible();
    await expect(
      await canvas.findByText(
        "This Visit has 20 photos and files. Remove one to add another.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add photos or files" }),
    ).toBeDisabled();
  },
};

/** Edit caption: the new words show on the photo. */
export const EditCaption: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Change card.jpg" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Edit caption" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Edit caption" }),
    );
    const caption = dialog.getByLabelText("Caption");
    await expect(caption).toHaveValue("Senthil's visiting card");
    await userEvent.clear(caption);
    await userEvent.type(caption, "Card of the purchase manager");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Card of the purchase manager"),
    ).toBeVisible();
    const sent = api.calls.mock.calls
      .map(([call]) => call)
      .filter((call) => call.path.endsWith("/update"));
    await expect(sent.map((call) => call.body)).toEqual([
      { caption: "Card of the purchase manager" },
    ]);
  },
};

/** Remove: asked first, then gone, with a History line. */
export const Remove: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Change site.jpg" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Remove" }),
    );
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Remove site.jpg?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(canvas.queryByRole("link", { name: "Open site.jpg" })).toBeNull(),
    );
    const history = within(canvas.getByRole("list", { name: "History" }));
    await expect(
      await history.findByText(/Photo removed · site\.jpg/),
    ).toBeVisible();
  },
};

/** Without Visits update: the files show, with nothing to add or change. */
export const ReadOnly: Story = {
  beforeEach: serve({
    visits: [
      visit({
        files: visitFiles().map((item) => ({ ...item, canChange: false })),
        actions: {
          canUpdate: false,
          canComplete: false,
          canCancel: false,
          canReschedule: false,
          canAddNote: false,
          canAddFiles: false,
          canDelete: false,
          locked: false,
        },
      }),
    ],
  }),
  play: async ({ canvas }) => {
    const list = within(
      await canvas.findByRole("list", { name: "Photos and files" }),
    );
    await expect(list.getAllByRole("listitem")).toHaveLength(3);
    await expect(list.queryByRole("button", { name: /^Change / })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Add photos or files" }),
    ).toBeNull();
    await expect(canvas.queryByLabelText("Choose photos or files")).toBeNull();
  },
};
