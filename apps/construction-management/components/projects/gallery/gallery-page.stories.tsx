import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries } from "../../../.storybook/mocks/api";
import {
  COLUMN_LAYOUT,
  CUBE_TEST,
  GALLERY_API,
  GALLERY_ITEMS,
  GALLERY_PROJECT_ID,
  SITE_VISIT,
  SLAB_PHOTO,
  mockGalleryApi,
} from "./gallery-fixtures";
import { GalleryPage } from "./gallery-page";

let api: ReturnType<typeof mockGalleryApi>;

function galleryApi(options: Parameters<typeof mockGalleryApi>[0] = {}) {
  return () => {
    api = mockGalleryApi(options);
    return api.restore;
  };
}

/** The query strings of every Gallery list request, oldest first. */
function listRequests(): URLSearchParams[] {
  return api.calls.mock.calls
    .map(([call]) => new URL(call.path, "http://storybook.local"))
    .filter((url) => url.pathname === GALLERY_API)
    .map((url) => url.searchParams);
}

function lastRequest(): URLSearchParams {
  const requests = listRequests();
  const last = requests.at(-1);
  if (last == null) throw new Error("No Gallery request yet");
  return last;
}

/** The last request's filters, without the page size. */
function lastFilters(): Record<string, string> {
  const params = Object.fromEntries(lastRequest());
  delete params["limit"];
  return params;
}

const PATH = `/app/projects/${GALLERY_PROJECT_ID}/gallery`;

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

function tiles({ canvas }: PlayContext) {
  return within(canvas.getByRole("list", { name: "Files" })).getAllByRole(
    "listitem",
  );
}

function tileNames(context: PlayContext): string[] {
  return tiles(context).map(
    (tile) => tile.querySelector("span[title]")?.getAttribute("title") ?? "",
  );
}

async function waitForTotal({ canvas }: PlayContext, text: string) {
  await waitFor(async () => {
    await expect(canvas.getByText(text)).toBeVisible();
  });
}

/**
 * Story tests run 414px wide, where Source, Uploaded by and the dates sit
 * behind the Filters button. Opens that sheet.
 */
async function openFilters({ canvas, canvasElement, userEvent }: PlayContext) {
  await userEvent.click(
    await canvas.findByRole("button", { name: /^Filters/ }),
  );
  return within(
    await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "Filters",
    }),
  );
}

type Sheet = Awaited<ReturnType<typeof openFilters>>;

async function pick(
  { canvasElement, userEvent }: PlayContext,
  sheet: Sheet,
  label: string,
  option: string,
) {
  await userEvent.click(sheet.getByRole("combobox", { name: label }));
  await userEvent.click(
    await within(canvasElement.ownerDocument.body).findByRole("option", {
      name: option,
    }),
  );
}

async function closeFilters(
  { canvasElement, userEvent }: PlayContext,
  sheet: Sheet,
  show: string,
) {
  await userEvent.click(await sheet.findByRole("button", { name: show }));
  await waitFor(async () => {
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("dialog"),
    ).toBeNull();
  });
}

/** Nothing on the page scrolls sideways at the story tests' phone width. */
async function fitsWidth({ canvasElement }: PlayContext) {
  const root = canvasElement.ownerDocument.documentElement;
  await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth);
}

function imageOf(tile: HTMLElement): string | null {
  return tile.querySelector("img")?.getAttribute("src") ?? null;
}

const meta = {
  title: "Projects/Gallery",
  component: GalleryPage,
  args: { projectId: GALLERY_PROJECT_ID },
  beforeEach: galleryApi(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: (args) => (
    <StoryQueries>
      <GalleryPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof GalleryPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Newest first: a thumbnail when the file has one, else the image itself,
 * else the PDF icon; each tile names its source, uploader and date.
 */
export const WithFiles: Story = {
  play: async (context) => {
    const { canvas } = context;
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Gallery" }),
    ).toBeVisible();
    await expect(canvas.getByText("60 files")).toBeVisible();
    await expect(listRequests().map(String)).toEqual(["limit=48"]);
    await expect(tiles(context)).toHaveLength(48);
    await fitsWidth(context);

    const slab = canvas.getByRole("button", { name: SLAB_PHOTO.fileName });
    await expect(imageOf(slab)).toBe(SLAB_PHOTO.thumbUrl);
    await expect(within(slab).getByText("Document")).toBeVisible();
    await expect(
      within(slab).getByText("Karthik R · 8 Oct 2026"),
    ).toBeVisible();

    // No thumbnail: the image itself.
    const visit = canvas.getByRole("button", { name: SITE_VISIT.fileName });
    await expect(SITE_VISIT.thumbUrl).toBeNull();
    await expect(imageOf(visit)).toBe(SITE_VISIT.fileUrl);

    // A PDF: the file icon, no image.
    const layout = canvas.getByRole("button", {
      name: COLUMN_LAYOUT.fileName,
    });
    await expect(imageOf(layout)).toBeNull();
    await expect(layout.querySelector("svg")).not.toBeNull();
    await expect(within(layout).getByText("Drawing")).toBeVisible();
    await expect(
      within(layout).getByText("Meena S · 6 Oct 2026"),
    ).toBeVisible();

    // An uploader whose name is no longer known: just the date.
    const steel = canvas.getByRole("button", { name: "Steel test report.jpg" });
    await expect(within(steel).getByText("Testing Report")).toBeVisible();
    await expect(within(steel).getByText("1 Oct 2026")).toBeVisible();

    await expect(
      canvas.queryByRole("button", { name: "Clear filters" }),
    ).toBeNull();
  },
};

/** Type: Images or PDFs only; the request carries `type`. */
export const FilterByType: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    const type = within(await canvas.findByRole("group", { name: "Type" }));
    await userEvent.click(type.getByRole("button", { name: "PDFs" }));
    await waitForTotal(context, "3 files");
    await expect(lastFilters()).toEqual({ type: "pdf" });
    await expect(tiles(context)).toHaveLength(3);
    await expect(
      canvas.getByRole("button", { name: CUBE_TEST.fileName }),
    ).toBeVisible();

    await userEvent.click(type.getByRole("button", { name: "Images" }));
    await waitForTotal(context, "57 files");
    await expect(lastFilters()).toEqual({ type: "image" });
    await expect(
      canvas.queryByRole("button", { name: CUBE_TEST.fileName }),
    ).toBeNull();

    await userEvent.click(type.getByRole("button", { name: "All" }));
    await waitForTotal(context, "60 files");
  },
};

/** Source: only the Drawings' files; the request carries `source`. */
export const FilterBySource: Story = {
  play: async (context) => {
    const { canvas, canvasElement } = context;
    const sheet = await openFilters(context);
    await pick(context, sheet, "Source", "Drawings");
    await expect(
      await sheet.findByRole("button", { name: "Show 2 files" }),
    ).toBeVisible();
    await expect(lastFilters()).toEqual({ source: "drawing" });
    await closeFilters(context, sheet, "Show 2 files");

    await expect(tileNames(context)).toEqual([
      "Column layout.pdf",
      "GF plan.png",
    ]);
    for (const tile of tiles(context))
      await expect(within(tile).getByText("Drawing")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Filters, 1 on" }),
    ).toBeVisible();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("option"),
    ).toBeNull();
  },
};

/** Uploaded by: everyone who uploaded a file, then one person's files. */
export const FilterByUploader: Story = {
  play: async (context) => {
    const { canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    const sheet = await openFilters(context);
    await userEvent.click(sheet.getByRole("combobox", { name: "Uploaded by" }));
    await expect(
      (await body.findAllByRole("option")).map((option) => option.textContent),
    ).toEqual(["Anyone", "Karthik R", "Meena S", "Prakash", "Name not known"]);
    await userEvent.click(body.getByRole("option", { name: "Meena S" }));
    await closeFilters(context, sheet, "Show 2 files");
    await expect(lastFilters()).toEqual({ uploadedBy: "user-meena" });
    await expect(tileNames(context)).toEqual([
      "Column layout.pdf",
      "GF plan.png",
    ]);
  },
};

/** From and To: uploads on those days, in the Company's time zone. */
export const FilterByDateRange: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    const sheet = await openFilters(context);
    await userEvent.type(sheet.getByLabelText("From"), "2026-10-01");
    await userEvent.type(sheet.getByLabelText("To"), "2026-10-06");
    await closeFilters(context, sheet, "Show 3 files");
    await expect(lastFilters()).toEqual({
      from: "2026-10-01",
      to: "2026-10-06",
    });
    await expect(tileNames(context)).toEqual([
      "Column layout.pdf",
      "Cube test 28 day.pdf",
      "Steel test report.jpg",
    ]);
    await expect(
      canvas.getByRole("button", { name: "Filters, 2 on" }),
    ).toBeVisible();
  },
};

/** Search waits for a pause in typing, then asks once for the whole word. */
export const Search: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    const search = await canvas.findByRole("searchbox", {
      name: "Search files",
    });
    await userEvent.type(search, "Test");
    await waitForTotal(context, "2 files");
    await expect(tileNames(context)).toEqual([
      "Cube test 28 day.pdf",
      "Steel test report.jpg",
    ]);
    const searched = listRequests()
      .map((params) => params.get("q"))
      .filter((q) => q != null);
    await expect(searched).toEqual(["Test"]);
    await expect(search).toHaveValue("Test");
  },
};

/**
 * On a phone the less-used filters sit in a sheet; the Filters button counts
 * the ones on, and Clear filters in the sheet takes them all off.
 */
export const PhoneFilters: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async (context) => {
    const { canvas, userEvent } = context;
    let sheet = await openFilters(context);
    await pick(context, sheet, "Source", "Documents");
    await userEvent.type(sheet.getByLabelText("From"), "2026-09-01");
    await closeFilters(context, sheet, "Show 3 files");
    await expect(lastFilters()).toEqual({
      source: "document",
      from: "2026-09-01",
    });
    await expect(
      canvas.getByRole("button", { name: "Filters, 2 on" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Clear filters" }),
    ).toBeVisible();
    await fitsWidth(context);

    sheet = await openFilters(context);
    await userEvent.click(sheet.getByRole("button", { name: "Clear filters" }));
    await expect(
      await sheet.findByRole("button", { name: "Show 60 files" }),
    ).toBeVisible();
    await expect(
      sheet.queryByRole("button", { name: "Clear filters" }),
    ).toBeNull();
    await expect(sheet.getByLabelText("From")).toHaveValue("");
    await closeFilters(context, sheet, "Show 60 files");
    // The unfiltered first page is still cached from the first load.
    await expect(canvas.getByText("60 files")).toBeVisible();
    await expect(tiles(context)).toHaveLength(48);
    await expect(canvas.getByRole("button", { name: "Filters" })).toBeVisible();
  },
};

/**
 * 48 files a page: Next and Previous carry the cursors, and a filter change
 * starts again from the first page.
 */
export const Paging: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    const previous = await canvas.findByRole("button", { name: "Previous" });
    const next = canvas.getByRole("button", { name: "Next" });
    await expect(previous).toBeDisabled();

    await userEvent.click(next);
    await waitFor(async () => {
      await expect(tiles(context)).toHaveLength(12);
    });
    const lastOfFirst = GALLERY_ITEMS[47]?.id;
    const firstOfSecond = GALLERY_ITEMS[48];
    await expect(lastFilters()).toEqual({ after: lastOfFirst });
    await expect(tileNames(context)[0]).toBe(firstOfSecond?.fileName);
    await expect(canvas.getByText("60 files")).toBeVisible();
    await expect(next).toBeDisabled();
    await expect(previous).toBeEnabled();

    await userEvent.click(previous);
    await waitFor(async () => {
      await expect(tiles(context)).toHaveLength(48);
    });
    await expect(lastFilters()).toEqual({ before: firstOfSecond?.id });
    await expect(tileNames(context)[0]).toBe(SLAB_PHOTO.fileName);

    await userEvent.click(next);
    await waitFor(async () => {
      await expect(tiles(context)).toHaveLength(12);
    });
    const type = within(canvas.getByRole("group", { name: "Type" }));
    await userEvent.click(type.getByRole("button", { name: "Images" }));
    await waitForTotal(context, "57 files");
    await expect(lastFilters()).toEqual({ type: "image" });
    await expect(tileNames(context)[0]).toBe(SLAB_PHOTO.fileName);
  },
};

/** A photo opens in the viewer; Previous and Next step through the page. */
export const ViewImage: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: SLAB_PHOTO.fileName }),
    );
    let viewer = within(
      await body.findByRole("dialog", { name: SLAB_PHOTO.fileName }),
    );
    await expect(
      viewer.getByText("Document · Karthik R · 8 Oct 2026 · 1.2 MB"),
    ).toBeVisible();
    await expect(
      viewer.getByRole("img", { name: SLAB_PHOTO.fileName }),
    ).toHaveAttribute("src", SLAB_PHOTO.fileUrl);
    await expect(viewer.getByText("1 of 48")).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Previous file" }),
    ).toBeDisabled();

    await userEvent.click(viewer.getByRole("button", { name: "Next file" }));
    const pdf = await body.findByRole("dialog", {
      name: COLUMN_LAYOUT.fileName,
    });
    viewer = within(pdf);
    await expect(viewer.getByText("2 of 48")).toBeVisible();
    await expect(pdf.querySelector("iframe")).toHaveAttribute(
      "src",
      COLUMN_LAYOUT.fileUrl,
    );

    await userEvent.click(
      viewer.getByRole("button", { name: "Previous file" }),
    );
    await expect(
      await body.findByRole("dialog", { name: SLAB_PHOTO.fileName }),
    ).toBeVisible();
  },
};

/** A PDF opens in the browser's own viewer, with Download beside it. */
export const ViewPdf: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: CUBE_TEST.fileName }),
    );
    const dialog = await body.findByRole("dialog", {
      name: CUBE_TEST.fileName,
    });
    const viewer = within(dialog);
    await expect(
      viewer.getByText("Testing Report · Prakash · 2 Oct 2026 · 340 KB"),
    ).toBeVisible();
    const frame = dialog.querySelector("iframe");
    await expect(frame).toHaveAttribute("src", CUBE_TEST.fileUrl);
    await expect(frame).toHaveAttribute("title", CUBE_TEST.fileName);
    await expect(
      viewer.getByRole("link", { name: "Download" }),
    ).toHaveAttribute("href", `${CUBE_TEST.fileUrl}?download=1`);
    await expect(viewer.getByText("3 of 48")).toBeVisible();
  },
};

/** Nothing on the Project yet: where the files come from. */
export const Empty: Story = {
  beforeEach: galleryApi({ items: [], uploaders: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No files on this Project yet"),
    ).toBeVisible();
    await expect(
      canvas.getByText(
        "Photos and PDFs from Documents, Drawings and Testing Reports show here. Add them where they belong.",
      ),
    ).toBeVisible();
    await expect(canvas.queryByRole("searchbox")).toBeNull();
    await expect(canvas.queryByRole("list", { name: "Files" })).toBeNull();
  },
};

/** No file matches: say so, and Clear filters brings every file back. */
export const NoMatch: Story = {
  play: async (context) => {
    const { canvas, userEvent } = context;
    const search = await canvas.findByRole("searchbox", {
      name: "Search files",
    });
    await userEvent.type(search, "invoice");
    await expect(
      await canvas.findByText("No files match these filters"),
    ).toBeVisible();
    await expect(lastFilters()).toEqual({ q: "invoice" });
    await expect(canvas.queryByText("60 files")).toBeNull();

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear filters" }),
    );
    await waitForTotal(context, "60 files");
    await expect(search).toHaveValue("");
    await expect(tiles(context)).toHaveLength(48);
  },
};
