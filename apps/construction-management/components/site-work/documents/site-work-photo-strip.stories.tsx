import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import { SiteWorkPhotoStrip } from "./site-work-photo-strip";
import { siteWorkFile, swatch } from "./site-work-document-fixtures";

const COLOURS = [
  "#a8a29e",
  "#78716c",
  "#94a3b8",
  "#64748b",
  "#d6d3d1",
  "#cbd5e1",
  "#57534e",
  "#475569",
];

const PHOTOS = COLOURS.map((colour, index) =>
  siteWorkFile(`Slab ${String(index + 1)}.jpg`, {
    thumbUrl: swatch(colour),
    url: swatch(colour),
  }),
);

const meta = {
  title: "Site work/Documents/Photo strip",
  component: SiteWorkPhotoStrip,
  args: {
    files: PHOTOS,
    label: "Photos of WS/26-27/00012",
  },
  parameters: { layout: "padded" },
} satisfies Meta<typeof SiteWorkPhotoStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Eight photos: six tiles and "+2"; a tile opens the full image. */
export const Strip: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const strip = within(
      canvas.getByRole("list", { name: "Photos of WS/26-27/00012" }),
    );
    await expect(strip.getAllByRole("button")).toHaveLength(6);
    await expect(strip.getByText("+2")).toBeVisible();
    await userEvent.click(
      strip.getByRole("button", { name: "Open Slab 1.jpg" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("dialog", { name: "Slab 1.jpg" }),
    ).toBeVisible();
  },
};

/** PDFs are left out; with no photos the strip renders nothing. */
export const NoPhotos: Story = {
  args: {
    files: [siteWorkFile("Breakdown log.pdf")],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole("list", { name: "Photos of WS/26-27/00012" }),
    ).toBeNull();
  },
};
