import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  expect,
  userEvent as baseUserEvent,
  waitFor,
  within,
} from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import {
  ALBUM_IDS,
  ANUGRAHA,
  DRAWING_IDS,
  DRAWINGS_API,
  mockDrawingsApi,
} from "./drawing-fixtures";
import { DrawingAlbumPage } from "./drawing-album-page";

let api: ReturnType<typeof mockDrawingsApi>;
let xhr: ReturnType<typeof mockXhrUploads>;

function calls(method: string, path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === method && call.path === path);
}

function drawingsApi(options: Parameters<typeof mockDrawingsApi>[0] = {}) {
  return () => {
    api = mockDrawingsApi(options);
    return api.restore;
  };
}

function uploadsHeldAt(holdAt?: number) {
  return () => {
    api = mockDrawingsApi();
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

const MB = 1024 * 1024;
const DRAWINGS_PATH = `/app/projects/${ANUGRAHA.id}/drawings`;
const PATH = `${DRAWINGS_PATH}/${ALBUM_IDS.architect}`;

/** The viewer's PDF frame (the dialog title carries the same title). */
function frame(
  viewer: { getAllByTitle: (title: string) => HTMLElement[] },
  title: string,
) {
  return viewer
    .getAllByTitle(title)
    .find((element) => element.tagName === "IFRAME");
}

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

/**
 * Story tests run 414px wide, where View and History fold into the row's
 * menu with the rest. Opens the menu for a drawing.
 */
async function rowActions(
  { canvas, canvasElement, userEvent }: PlayContext,
  name: string,
) {
  await userEvent.click(
    await canvas.findByRole("button", { name: `Actions for ${name}` }),
  );
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("menu"),
  );
}

async function choose(context: PlayContext, name: string, item: string) {
  const menu = await rowActions(context, name);
  await context.userEvent.click(menu.getByRole("menuitem", { name: item }));
}

/** Each row as "name | revision | size · uploader · date". */
function rows(canvasElement: HTMLElement): string[] {
  return within(within(canvasElement).getByRole("list", { name: "Drawings" }))
    .getAllByRole("listitem")
    .map((row) =>
      Array.from(
        row.querySelectorAll("p, [data-slot='badge']"),
        (part) => part.textContent,
      ).join(" | "),
    );
}

const meta = {
  title: "Projects/Drawings/Album",
  component: DrawingAlbumPage,
  args: {
    projectId: ANUGRAHA.id,
    albumId: ALBUM_IDS.architect,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  beforeEach: drawingsApi(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: (args) => (
    <StoryQueries>
      <DrawingAlbumPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof DrawingAlbumPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Drawings most recently changed first, each with its latest revision,
 * size, uploader and date; every action in the row's menu.
 */
export const List: Story = {
  play: async (context) => {
    const { canvas, canvasElement } = context;
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Architect" }),
    ).toBeVisible();
    await expect(canvas.getByText("3 drawings")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Drawings" }),
    ).toHaveAttribute("href", DRAWINGS_PATH);

    await expect(rows(canvasElement)).toEqual([
      "GF Plan | R3 | 2.4 MB · Karthik R · 18 Apr 2026",
      "Site plan | R2 | 6.2 MB · Karthik R · 2 Apr 2026",
      // No uploader name: just size and date.
      "Front elevation | R1 | 819 KB · 10 Mar 2026",
    ]);
    // Long names truncate; nothing scrolls sideways on a phone.
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);

    const menu = await rowActions(context, "GF Plan");
    await expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "View",
      "History",
      "Download",
      "Upload new revision",
      "Rename",
      "Move to album",
      "Delete",
    ]);
    await expect(
      menu.getByRole("menuitem", { name: "Download" }),
    ).toHaveAttribute("href", expect.stringMatching(/\/file\?download=1$/));
  },
};

/** An album with nothing in it yet: an invitation to upload. */
export const EmptyAlbum: Story = {
  args: { albumId: ALBUM_IDS.plumbing },
  parameters: {
    nextjs: {
      navigation: { pathname: `${DRAWINGS_PATH}/${ALBUM_IDS.plumbing}` },
    },
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("Upload the Plumbing drawings"),
    ).toBeVisible();
    await expect(
      canvas.getByText("PDFs, images, DWG and DXF files, up to 100 MB each."),
    ).toBeVisible();
    // One button: the empty state's, not a second one in the header.
    await userEvent.click(
      canvas.getByRole("button", { name: "Upload drawings" }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Upload drawings",
      }),
    ).toBeVisible();
  },
};

/** A Team Member with only the Read flag views, downloads and looks back. */
export const ReadOnly: Story = {
  args: { canCreate: false, canUpdate: false, canDelete: false },
  play: async (context) => {
    const { canvas } = context;
    await canvas.findByText("3 drawings");
    await expect(
      canvas.queryByRole("button", { name: "Upload drawings" }),
    ).toBeNull();
    const menu = await rowActions(context, "GF Plan");
    await expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["View", "History", "Download"]);
  },
};

export const ReadOnlyEmptyAlbum: Story = {
  args: {
    albumId: ALBUM_IDS.plumbing,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No drawings in this album yet"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Upload drawings" }),
    ).toBeNull();
  },
};

/**
 * Upload one file with a name typed: it goes up through the app (the
 * development path) and shows as R1 under that name.
 */
export const UploadOne: Story = {
  beforeEach: uploadsHeldAt(64),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload drawings" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload drawings" }),
    );
    await userEvent.upload(
      dialog.getByLabelText("Drawing files"),
      file("Terrace plan v2.pdf", 2 * MB, "application/pdf"),
    );
    const name = dialog.getByLabelText("Drawing name");
    await expect(name).toHaveAttribute("placeholder", "Terrace plan v2");
    await userEvent.type(name, "Terrace plan");
    await userEvent.click(
      dialog.getByRole("button", { name: "Upload 1 file" }),
    );

    const uploads = within(dialog.getByRole("list", { name: "Uploads" }));
    await expect(await uploads.findByText("64%")).toBeVisible();
    await expect(dialog.queryByLabelText("Drawing name")).toBeNull();
    await expect(calls("POST", `${DRAWINGS_API}/uploads`)[0]?.body).toEqual({
      fileName: "Terrace plan v2.pdf",
      bytes: 2 * MB,
    });

    xhr.release();
    await expect(await uploads.findByText("Done")).toBeVisible();
    await expect(calls("POST", DRAWINGS_API)[0]?.body).toMatchObject({
      fileName: "Terrace plan v2.pdf",
      albumId: ALBUM_IDS.architect,
      name: "Terrace plan",
    });
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    await waitFor(async () => {
      await expect(rows(canvasElement)[0]).toBe(
        "Terrace plan | R1 | 2 MB · Karthik R · 9 Oct 2026",
      );
    });
    await expect(canvas.getByText("4 drawings")).toBeVisible();
  },
};

/**
 * Several files at once, held at 64% for review: no name field (each is
 * named after its file), a progress bar and Cancel on each.
 */
export const UploadInProgress: Story = {
  beforeEach: uploadsHeldAt(64),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload drawings" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload drawings" }),
    );
    await userEvent.upload(dialog.getByLabelText("Drawing files"), [
      file("FF Plan.pdf", 3 * MB, "application/pdf"),
      file("Roof plan.dwg", 9 * MB),
    ]);
    await expect(dialog.queryByLabelText("Drawing name")).toBeNull();
    await userEvent.click(
      dialog.getByRole("button", { name: "Upload 2 files" }),
    );
    await waitFor(async () => {
      await expect(dialog.getAllByText("64%")).toHaveLength(2);
    });
    await expect(
      dialog.getByRole("progressbar", { name: "Uploading FF Plan.pdf" }),
    ).toBeVisible();

    await userEvent.click(
      dialog.getByRole("button", { name: "Cancel upload of Roof plan.dwg" }),
    );
    await expect(dialog.queryByText("Roof plan.dwg")).toBeNull();
    await expect(
      dialog.getByRole("button", { name: "Cancel upload of FF Plan.pdf" }),
    ).toBeVisible();
  },
};

/** A ZIP is refused in the browser, before any request, and can't be retried. */
export const UploadRefused: Story = {
  play: async ({ canvas, canvasElement }) => {
    // The picker offers drawing types only; a drop or "All files" gets past it.
    const userEvent = baseUserEvent.setup({ applyAccept: false });
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Upload drawings" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload drawings" }),
    );
    await userEvent.upload(
      dialog.getByLabelText("Drawing files"),
      file("BOQ.zip", 4 * MB, "application/zip"),
    );
    await userEvent.click(
      dialog.getByRole("button", { name: "Upload 1 file" }),
    );
    await expect(
      await dialog.findByText("Choose a PDF, an image, a DWG or a DXF file."),
    ).toBeVisible();
    await expect(
      dialog.queryByRole("button", { name: "Retry BOQ.zip" }),
    ).toBeNull();
    await expect(calls("POST", `${DRAWINGS_API}/uploads`)).toHaveLength(0);
    await userEvent.click(
      dialog.getByRole("button", { name: "Dismiss BOQ.zip" }),
    );
    await expect(dialog.queryByRole("list", { name: "Uploads" })).toBeNull();
  },
};

/** Upload new revision: R3 becomes R4 and the one shown. */
export const NewRevision: Story = {
  beforeEach: uploadsHeldAt(38),
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await choose(context, "GF Plan", "Upload new revision");
    const dialog = within(
      await body.findByRole("dialog", { name: "Upload new revision" }),
    );
    await expect(
      dialog.getByText(
        "GF Plan is at R3. The new file becomes R4; R3 stays in the history.",
      ),
    ).toBeVisible();
    await userEvent.upload(
      dialog.getByLabelText("Revision file"),
      file("GF Plan R4.pdf", 2.6 * MB, "application/pdf"),
    );
    await expect(
      await dialog.findByRole("progressbar", {
        name: "Uploading GF Plan R4.pdf",
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Choose file" }),
    ).toBeDisabled();

    xhr.release();
    const uploads = within(dialog.getByRole("list", { name: "Uploads" }));
    await expect(await uploads.findByText("Done")).toBeVisible();
    await expect(
      calls("POST", `${DRAWINGS_API}/${DRAWING_IDS.gfPlan}/revisions`)[0]?.body,
    ).toMatchObject({ fileName: "GF Plan R4.pdf" });
    await expect(
      await dialog.findByText(
        "GF Plan is at R4. The new file becomes R5; R4 stays in the history.",
      ),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Done" }));
    await waitFor(async () => {
      await expect(rows(canvasElement)[0]).toBe(
        "GF Plan | R4 | 2.6 MB · Karthik R · 9 Oct 2026",
      );
    });
  },
};

/** History lists R3, R2, R1, each to view or download. */
export const History: Story = {
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await choose(context, "GF Plan", "History");
    const sheet = within(await body.findByRole("dialog", { name: "History" }));
    const revisions = within(
      await sheet.findByRole("list", { name: "Revisions" }),
    );
    await expect(
      revisions.getAllByRole("listitem").map((item) => item.ariaLabel),
    ).toEqual(["R3", "R2", "R1"]);
    const r2 = within(revisions.getByRole("listitem", { name: "R2" }));
    await expect(r2.getByText("GF Plan R2.pdf")).toBeVisible();
    await expect(r2.getByText("2.1 MB · Prabhu S · 20 Mar 2026")).toBeVisible();
    await expect(r2.getByRole("link", { name: "Download R2" })).toHaveAttribute(
      "href",
      expect.stringMatching(/\/file\?download=1$/),
    );
    await expect(
      calls("GET", `${DRAWINGS_API}/${DRAWING_IDS.gfPlan}`),
    ).toHaveLength(1);

    await userEvent.click(r2.getByRole("button", { name: "View R2" }));
    const viewer = within(
      await body.findByRole("dialog", { name: "GF Plan R2.pdf" }),
    );
    await expect(frame(viewer, "GF Plan R2.pdf")).toHaveAttribute(
      "src",
      expect.stringMatching(/\/file$/),
    );
    await expect(
      viewer.getByText("GF Plan · R2 · 2.1 MB · Prabhu S · 20 Mar 2026"),
    ).toBeVisible();
  },
};

/** Rename saves with the `updatedAt` it loaded. */
export const Rename: Story = {
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await choose(context, "Front elevation", "Rename");
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename drawing" }),
    );
    const name = dialog.getByLabelText("Drawing name");
    await expect(name).toHaveValue("Front elevation");
    await userEvent.clear(name);
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText("Enter the drawing name."),
    ).toBeVisible();
    await userEvent.type(name, "North elevation");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(body.queryByRole("dialog")).toBeNull();
    });
    await expect(
      calls("POST", `${DRAWINGS_API}/${DRAWING_IDS.elevation}/update`)[0]?.body,
    ).toEqual({
      name: "North elevation",
      updatedAt: "2026-03-10T08:20:00.000Z",
    });
    await waitFor(async () => {
      await expect(rows(canvasElement)).toContain(
        "North elevation | R1 | 819 KB · 10 Mar 2026",
      );
    });
  },
};

/** Someone saved the drawing in between: the message stays in the dialog. */
export const RenameChanged: Story = {
  beforeEach: drawingsApi({
    renameError: {
      code: "DRAWING_CHANGED",
      message:
        "Someone changed this drawing since you opened it. Reload and try again.",
    },
  }),
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await choose(context, "Site plan", "Rename");
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename drawing" }),
    );
    await userEvent.type(dialog.getByLabelText("Drawing name"), " (survey)");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Someone changed this drawing since you opened it. Reload and try again.",
    );
    await expect(
      body.getByRole("dialog", { name: "Rename drawing" }),
    ).toBeVisible();
  },
};

/** Move to album offers the Project's other albums; the drawing leaves this one. */
export const Move: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await choose(context, "Site plan", "Move to album");
    const dialog = within(
      await body.findByRole("dialog", { name: "Move to album" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await expect(await dialog.findByText("Choose an album.")).toBeVisible();

    await userEvent.click(dialog.getByLabelText("Album"));
    const options = within(await body.findByRole("listbox"));
    await expect(
      options.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Electrical", "Plumbing", "Structural Drawing"]);
    await userEvent.click(
      options.getByRole("option", { name: "Structural Drawing" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Move" }));
    await waitFor(async () => {
      await expect(canvas.queryByText("Site plan")).toBeNull();
    });
    await expect(
      calls("POST", `${DRAWINGS_API}/${DRAWING_IDS.sitePlan}/move`)[0]?.body,
    ).toEqual({
      albumId: ALBUM_IDS.structural,
      updatedAt: "2026-04-02T11:00:00.000Z",
    });
    await expect(canvas.getByText("2 drawings")).toBeVisible();
    // The closing dialog loses its name while it animates out; let it go
    // before the story's accessibility check runs.
    await waitFor(async () => {
      await expect(body.queryByRole("dialog")).toBeNull();
    });
  },
};

/** Delete asks first and says the revisions go too. */
export const Delete: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    await choose(context, "GF Plan", "Delete");
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete GF Plan?" }),
    );
    await waitFor(async () => {
      await expect(
        confirm.getByText(
          "Deletes the drawing and all its revisions, for everyone.",
        ),
      ).toBeVisible();
    });
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(canvas.queryByText("GF Plan")).toBeNull();
    });
    await expect(
      calls("POST", `${DRAWINGS_API}/${DRAWING_IDS.gfPlan}/delete`),
    ).toHaveLength(1);
    await expect(canvas.getByText("2 drawings")).toBeVisible();
  },
};

/** View an image: the lightbox shows it with its revision and details. */
export const ViewImage: Story = {
  play: async (context) => {
    const body = within(context.canvasElement.ownerDocument.body);
    await choose(context, "Front elevation", "View");
    const viewer = within(
      await body.findByRole("dialog", { name: "Front elevation.jpg" }),
    );
    await expect(
      viewer.getByRole("img", { name: "Front elevation.jpg" }),
    ).toHaveAttribute("src", expect.stringMatching(/\/file$/));
    await expect(
      viewer.getByText("Front elevation · R1 · 819 KB · 10 Mar 2026"),
    ).toBeVisible();
    await expect(
      viewer.getByRole("link", { name: "Download" }),
    ).toHaveAttribute("download", "Front elevation.jpg");
  },
};

/** View a PDF: the browser's own viewer in a frame. */
export const ViewPdf: Story = {
  play: async (context) => {
    const body = within(context.canvasElement.ownerDocument.body);
    await choose(context, "GF Plan", "View");
    const viewer = within(
      await body.findByRole("dialog", { name: "GF Plan R3.pdf" }),
    );
    await expect(frame(viewer, "GF Plan R3.pdf")).toBeVisible();
    await expect(
      viewer.getByRole("link", { name: "Open in new tab" }),
    ).toHaveAttribute("target", "_blank");
  },
};

/** A DWG can't be drawn in the browser: a card to download it instead. */
export const ViewDwg: Story = {
  play: async (context) => {
    const body = within(context.canvasElement.ownerDocument.body);
    await choose(context, "Site plan", "View");
    const viewer = within(
      await body.findByRole("dialog", { name: "Site plan R2.dwg" }),
    );
    await expect(
      viewer.getByText("This file can't be shown here"),
    ).toBeVisible();
    await expect(viewer.queryByRole("img")).toBeNull();
    await expect(
      viewer.getByRole("link", { name: "Download" }),
    ).toHaveAttribute("href", expect.stringMatching(/\/file\?download=1$/));
  },
};
