import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import { ProjectShell } from "../project-shell";
import { ANUGRAHA, DOCUMENTS_API, mockDocumentsApi } from "./document-fixtures";
import { ProjectDocumentsPage } from "./project-documents-page";

let api: ReturnType<typeof mockDocumentsApi>;
let xhr: ReturnType<typeof mockXhrUploads>;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function documentsApi(options: Parameters<typeof mockDocumentsApi>[0] = {}) {
  return () => {
    api = mockDocumentsApi(options);
    return api.restore;
  };
}

function uploadsHeldAt(holdAt?: number) {
  return () => {
    api = mockDocumentsApi();
    xhr = mockXhrUploads({ holdAt });
    return () => {
      xhr.restore();
      api.restore();
    };
  };
}

function file(name: string, size: number, type = "") {
  const made = new File(["x"], name, { type });
  Object.defineProperty(made, "size", { value: size });
  return made;
}

const PATH = `/app/projects/${ANUGRAHA.id}/documents`;

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

/**
 * Story tests run 414px wide, where each row's actions fold into its
 * menu (from `sm` up they are inline buttons). Opens the menu for a file.
 */
async function rowActions(
  { canvas, canvasElement, userEvent }: PlayContext,
  fileName: string,
) {
  await userEvent.click(
    await canvas.findByRole("button", { name: `Actions for ${fileName}` }),
  );
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("menu"),
  );
}

async function closeMenu({ canvasElement, userEvent }: PlayContext) {
  await userEvent.keyboard("{Escape}");
  await waitFor(async () => {
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("menu"),
    ).toBeNull();
  });
}

const meta = {
  title: "Projects/Documents",
  component: ProjectDocumentsPage,
  args: { projectId: ANUGRAHA.id, canEdit: true },
  beforeEach: documentsApi(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: (args) => (
    <StoryQueries>
      <ProjectShell id={ANUGRAHA.id}>
        <ProjectDocumentsPage {...args} />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectDocumentsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Files grouped by paper in paper order, with each paper's number and date. */
export const WithFiles: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Documents" }),
    ).toBeVisible();
    await expect(canvas.getByText("5 files · 6.8 MB")).toBeVisible();
    const tabs = within(
      canvas.getByRole("navigation", { name: "Project sections" }),
    );
    await expect(tabs.getByRole("link", { name: "Documents" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const headings = canvas
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    await expect(headings).toEqual([
      "Quotation · SBD/Q/2026/114 · 10 Feb 2026",
      "PO / WO · WO/2026/031 · 3 Mar 2026",
      "Agreement · SBD/AGR/2026/009 · 20 Mar 2026",
      "Other",
    ]);

    const order = within(canvas.getByRole("region", { name: /^PO \/ WO/ }));
    await expect(order.getAllByRole("listitem")).toHaveLength(2);
    await expect(
      order.getByText("1.2 MB · Karthik R · 4 Mar 2026"),
    ).toBeVisible();
    // No uploader name: just size and date.
    await expect(order.getByText("410 KB · 6 Mar 2026")).toBeVisible();
    // A PDF can be viewed; a spreadsheet only downloads.
    let menu = await rowActions(context, "Work order signed.pdf");
    await expect(menu.getByRole("menuitem", { name: "View" })).toHaveAttribute(
      "target",
      "_blank",
    );
    await closeMenu(context);
    menu = await rowActions(context, "BOQ revised.xlsx");
    await expect(menu.queryByRole("menuitem", { name: "View" })).toBeNull();
    await expect(
      menu.getByRole("menuitem", { name: "Download" }),
    ).toHaveAttribute(
      "href",
      `${DOCUMENTS_API}/0199c4a0-0000-7000-8000-0000000d0004?download=1`,
    );
    await closeMenu(context);

    const filter = within(canvas.getByRole("group", { name: "Paper" }));
    await expect(
      filter.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["All 5", "Quotation 1", "PO / WO 2", "Agreement 1", "Other 1"]);
    await userEvent.click(filter.getByRole("button", { name: "PO / WO 2" }));
    await expect(canvas.getAllByRole("heading", { level: 3 })).toHaveLength(1);
    await expect(
      canvas.queryByText("Quotation_SBD_114.pdf"),
    ).not.toBeInTheDocument();
    await userEvent.click(filter.getByRole("button", { name: "All 5" }));
    await expect(canvas.getAllByRole("heading", { level: 3 })).toHaveLength(4);

    await expect(
      canvas.getByText(
        "Files aren't scanned. Only open files from people you trust.",
      ),
    ).toBeVisible();
  },
};

/** No files yet: an invitation to upload, not an apology. */
export const Empty: Story = {
  beforeEach: documentsApi({ documents: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Keep this Project's papers here"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Upload the quotation, PO / WO, agreement or any other file. Up to 25 MB each.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: "Upload" }),
    ).toHaveLength(1);
    await expect(canvas.queryByRole("group", { name: "Paper" })).toBeNull();
  },
};

/** A Team Member without the Project menu's Update flag views and downloads only. */
export const ReadOnly: Story = {
  args: { canEdit: false },
  play: async (context) => {
    const { canvas } = context;
    await canvas.findByText("5 files · 6.8 MB");
    await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull();
    const menu = await rowActions(context, "Work order signed.pdf");
    await expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["View", "Download"]);
  },
};

export const ReadOnlyEmpty: Story = {
  args: { canEdit: false },
  beforeEach: documentsApi({ documents: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No files on this Project yet"),
    ).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Upload" })).toBeNull();
  },
};

/**
 * Upload: choose the paper, pick a file, watch it go up through the app
 * (the development path), then find it under its paper.
 */
export const Upload: Story = {
  beforeEach: uploadsHeldAt(64),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload files" }),
    );

    await userEvent.click(dialog.getByLabelText("Paper"));
    await userEvent.click(await body.findByRole("option", { name: "PO / WO" }));
    await userEvent.upload(
      dialog.getByLabelText("Files to upload"),
      file("Work order amendment.pdf", 2 * 1024 * 1024, "application/pdf"),
    );

    const uploads = within(dialog.getByRole("list", { name: "Uploads" }));
    await expect(await uploads.findByText("64%")).toBeVisible();
    await expect(
      uploads.getByRole("progressbar", {
        name: "Uploading Work order amendment.pdf",
      }),
    ).toBeVisible();
    await expect(calls("POST", `${DOCUMENTS_API}/uploads`)[0]?.body).toEqual({
      kind: "client_order",
      fileName: "Work order amendment.pdf",
      bytes: 2 * 1024 * 1024,
    });

    xhr.release();
    await expect(await uploads.findByText("Done")).toBeVisible();
    await expect(xhr.sent[0]?.contentType).toBe("application/pdf");
    await expect(calls("POST", DOCUMENTS_API)[0]?.body).toMatchObject({
      kind: "client_order",
      fileName: "Work order amendment.pdf",
    });
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));

    const order = within(canvas.getByRole("region", { name: /^PO \/ WO/ }));
    await expect(
      await order.findByText("Work order amendment.pdf"),
    ).toBeVisible();
    await expect(canvas.getByText("6 files · 8.8 MB")).toBeVisible();
  },
};

/** The dialog mid-upload, for review: the file stops at 64%. */
export const UploadInProgress: Story = {
  beforeEach: uploadsHeldAt(64),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload files" }),
    );
    await userEvent.upload(dialog.getByLabelText("Files to upload"), [
      file("BOQ revised v2.xlsx", 420 * 1024),
      file("Site photos April.zip", 14 * 1024 * 1024, "application/zip"),
    ]);
    await waitFor(async () => {
      await expect(dialog.getAllByText("64%")).toHaveLength(2);
    });
    await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  },
};

/** A program is refused in the browser, before any request. */
export const ProgramRefused: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload files" }),
    );
    await userEvent.upload(
      dialog.getByLabelText("Files to upload"),
      file("tally-setup.exe", 80 * 1024 * 1024),
    );
    await expect(
      await dialog.findByText("Programs can't be kept on a Project."),
    ).toBeVisible();
    await expect(
      dialog.queryByRole("button", { name: "Retry tally-setup.exe" }),
    ).toBeNull();
    await expect(calls("POST", `${DOCUMENTS_API}/uploads`)).toHaveLength(0);
    await userEvent.click(
      dialog.getByRole("button", { name: "Dismiss tally-setup.exe" }),
    );
    await expect(dialog.queryByRole("list", { name: "Uploads" })).toBeNull();
  },
};

/** The server's refusal shows on the file's row with its message. */
export const StorageFull: Story = {
  beforeEach: documentsApi({
    startError: {
      status: 402,
      code: "PLAN_LIMIT_EXCEEDED",
      message: "Your plan's storage is full. Buy more storage to add files.",
    },
  }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload files" }),
    );
    await userEvent.upload(
      dialog.getByLabelText("Files to upload"),
      file("Drawings.pdf", 1024 * 1024, "application/pdf"),
    );
    await expect(
      await dialog.findByText(
        "Your plan's storage is full. Buy more storage to add files.",
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Retry Drawings.pdf" }),
    ).toBeVisible();
  },
};

/** Delete asks first, then the file is gone for everyone. */
export const DeleteWithConfirm: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    const deletePath = `${DOCUMENTS_API}/0199c4a0-0000-7000-8000-0000000d0004/delete`;
    let menu = await rowActions(context, "BOQ revised.xlsx");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    const confirm = within(
      await body.findByRole("alertdialog", {
        name: "Delete BOQ revised.xlsx?",
      }),
    );
    // Visible once the dialog has faded in.
    await waitFor(async () => {
      await expect(
        confirm.getByText("It's removed from the Project for everyone."),
      ).toBeVisible();
    });
    await userEvent.click(confirm.getByRole("button", { name: "Keep it" }));
    await waitFor(async () => {
      await expect(body.queryByRole("alertdialog")).toBeNull();
    });
    await expect(calls("POST", deletePath)).toHaveLength(0);

    menu = await rowActions(context, "BOQ revised.xlsx");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(
      within(await body.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(async () => {
      await expect(canvas.queryByText("BOQ revised.xlsx")).toBeNull();
    });
    await expect(calls("POST", deletePath)).toHaveLength(1);
    await expect(canvas.getByText("4 files · 6.4 MB")).toBeVisible();
  },
};

/** Phones: rows stack and the actions fold into a menu. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async (context) => {
    const menu = await rowActions(context, "Work order signed.pdf");
    await expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["View", "Download", "Delete"]);
  },
};
