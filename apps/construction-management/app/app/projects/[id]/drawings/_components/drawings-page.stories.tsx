import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import {
  ALBUM_IDS,
  ANUGRAHA,
  DRAWINGS_API,
  mockDrawingsApi,
} from "./drawing-fixtures";
import { DrawingsPage } from "./drawings-page";

let api: ReturnType<typeof mockDrawingsApi>;

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

const PATH = `/app/projects/${ANUGRAHA.id}/drawings`;

type Play = NonNullable<Story["play"]>;
type PlayContext = Parameters<Play>[0];

/** Opens an album card's menu (Rename, Delete). */
async function albumActions(
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

function cardTexts(canvasElement: HTMLElement): string[] {
  return within(canvasElement)
    .getAllByRole("link")
    .map((link) => link.textContent);
}

const meta = {
  title: "Projects/Drawings/Albums",
  component: DrawingsPage,
  args: {
    projectId: ANUGRAHA.id,
    canCreate: true,
    canUpdate: true,
    canDelete: true,
  },
  beforeEach: drawingsApi(),
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  render: (args) => (
    <StoryQueries>
      <DrawingsPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof DrawingsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The four albums every Project starts with, by name, with their counts. */
export const Albums: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      await canvas.findByRole("heading", { level: 2, name: "Drawings" }),
    ).toBeVisible();
    await expect(canvas.getByText("4 albums · 6 drawings")).toBeVisible();
    await expect(cardTexts(canvasElement)).toEqual([
      "Architect3 drawings",
      "Electrical1 drawing",
      "PlumbingNo drawings",
      "Structural Drawing2 drawings",
    ]);
    await expect(
      canvas.getByRole("link", { name: /^Architect/ }),
    ).toHaveAttribute("href", `${PATH}/${ALBUM_IDS.architect}`);
    await expect(
      canvas.getByRole("button", { name: "Add album" }),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("button", { name: /^Actions for / }),
    ).toHaveLength(4);
    // Nothing scrolls sideways on a phone.
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

/** Add album: a blank name is caught in the browser, then the card appears. */
export const AddAlbum: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add album" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "Add album" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add album" }));
    await expect(
      await dialog.findByText("Enter the album name."),
    ).toBeVisible();
    await expect(calls("POST", `${DRAWINGS_API}/albums`)).toHaveLength(0);

    await userEvent.type(dialog.getByLabelText("Album name"), "  Interior ");
    await userEvent.click(dialog.getByRole("button", { name: "Add album" }));
    await waitFor(async () => {
      await expect(body.queryByRole("dialog")).toBeNull();
    });
    await expect(calls("POST", `${DRAWINGS_API}/albums`)[0]?.body).toEqual({
      name: "Interior",
    });
    await expect(
      await canvas.findByRole("link", { name: /^Interior/ }),
    ).toBeVisible();
    await expect(canvas.getByText("5 albums · 6 drawings")).toBeVisible();
  },
};

/**
 * Rename sends the `updatedAt` it loaded; a name already on the Project
 * shows under the field, and a free one saves.
 */
export const RenameNameInUse: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    const menu = await albumActions(context, "Electrical");
    await userEvent.click(menu.getByRole("menuitem", { name: "Rename" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Rename album" }),
    );
    const name = dialog.getByLabelText("Album name");
    await expect(name).toHaveValue("Electrical");

    await userEvent.clear(name);
    await userEvent.type(name, "plumbing");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await expect(
      await dialog.findByText(
        "An album with this name is already on the Project.",
      ),
    ).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    const update = `${DRAWINGS_API}/albums/${ALBUM_IDS.electrical}/update`;
    await expect(calls("POST", update)[0]?.body).toEqual({
      name: "plumbing",
      updatedAt: "2026-03-01T04:30:00.000Z",
    });

    await userEvent.clear(name);
    await userEvent.type(name, "Electrical & ELV");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(body.queryByRole("dialog")).toBeNull();
    });
    await expect(
      await canvas.findByRole("link", { name: /^Electrical & ELV/ }),
    ).toBeVisible();
  },
};

/** An album with drawings is refused; the server says what to do first. */
export const DeleteRefused: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    const menu = await albumActions(context, "Architect");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Architect?" }),
    );
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await expect(await confirm.findByRole("alert")).toHaveTextContent(
      "This album has drawings. Move or delete them first.",
    );
    await expect(
      calls("POST", `${DRAWINGS_API}/albums/${ALBUM_IDS.architect}/delete`),
    ).toHaveLength(1);
    await userEvent.click(confirm.getByRole("button", { name: "Keep it" }));
    await waitFor(async () => {
      await expect(body.queryByRole("alertdialog")).toBeNull();
    });
    await expect(
      canvas.getByRole("link", { name: /^Architect/ }),
    ).toBeVisible();
  },
};

/** An empty album goes after asking. */
export const DeleteEmptyAlbum: Story = {
  play: async (context) => {
    const { canvas, canvasElement, userEvent } = context;
    const body = within(canvasElement.ownerDocument.body);
    const menu = await albumActions(context, "Plumbing");
    await userEvent.click(menu.getByRole("menuitem", { name: "Delete" }));
    const confirm = within(
      await body.findByRole("alertdialog", { name: "Delete Plumbing?" }),
    );
    await waitFor(async () => {
      await expect(
        confirm.getByText(
          "The album is removed from the Project for everyone.",
        ),
      ).toBeVisible();
    });
    await userEvent.click(confirm.getByRole("button", { name: "Delete" }));
    await waitFor(async () => {
      await expect(
        canvas.queryByRole("link", { name: /^Plumbing/ }),
      ).toBeNull();
    });
    await expect(canvas.getByText("3 albums · 6 drawings")).toBeVisible();
  },
};

/** A Team Member with only the Read flag opens albums and nothing else. */
export const ReadOnly: Story = {
  args: { canCreate: false, canUpdate: false, canDelete: false },
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText("4 albums · 6 drawings");
    await expect(cardTexts(canvasElement)).toHaveLength(4);
    await expect(
      canvas.queryByRole("button", { name: "Add album" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for / }),
    ).toBeNull();
  },
};

/** Every album deleted: an invitation to add one. */
export const Empty: Story = {
  beforeEach: drawingsApi({ albums: [] }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("No albums on this Project"),
    ).toBeVisible();
    await expect(canvas.queryByRole("list", { name: "Albums" })).toBeNull();
    // One button: the empty state's, not a second one in the header.
    await userEvent.click(canvas.getByRole("button", { name: "Add album" }));
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog", {
        name: "Add album",
      }),
    ).toBeVisible();
  },
};

export const ReadOnlyEmpty: Story = {
  args: { canCreate: false, canUpdate: false, canDelete: false },
  beforeEach: drawingsApi({ albums: [] }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(
        "Albums of drawings kept on this Project show here.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add album" }),
    ).toBeNull();
  },
};
