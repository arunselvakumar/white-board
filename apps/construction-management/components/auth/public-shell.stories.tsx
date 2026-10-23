import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { AuthHeading } from "./auth-heading";
import { PublicShell } from "./public-shell";

const meta = {
  title: "Auth/PublicShell",
  component: PublicShell,
  args: {
    children: (
      <AuthHeading
        title="Sign in"
        description="Sign in with your email and password."
      />
    ),
  },
} satisfies Meta<typeof PublicShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
    const view = canvasElement.ownerDocument.defaultView;
    if (view != null && view.innerWidth >= 1024) {
      await expect(
        canvas.getByRole("region", { name: "Construction Management" }),
      ).toBeVisible();
      // The tagline is read once, as a sentence, not word by word.
      const tagline =
        "Every site, every bag of cement, every day's labour — in one place.";
      await expect(canvas.getByText(tagline)).toHaveClass("sr-only");
      await expect(
        canvas.getByText("Projects, materials, labour", { exact: false }),
      ).toBeVisible();
      // The default photo, credited as Unsplash asks.
      await expect(
        canvas.getByRole("link", { name: "Hammilton Ojijo" }),
      ).toHaveAttribute(
        "href",
        "https://unsplash.com/@ojijohammilton?utm_source=construction_management&utm_medium=referral",
      );
    }
  },
};
