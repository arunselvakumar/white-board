import type { Decorator } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

/** The narrowest phone the Preschool screens are built for. */
export const PHONE_WIDTH = 375;

/**
 * Story tests run in a 414 px browser frame and the story's viewport global
 * does not resize it, so a phone story renders inside a 375 px box instead.
 */
export const withPhoneFrame: Decorator = (Story) => (
  <div data-phone-frame style={{ width: PHONE_WIDTH }}>
    <Story />
  </div>
);

/** Fails when anything in the 375 px box, or the page, scrolls sideways. */
export async function expectFitsPhone(
  canvasElement: HTMLElement,
): Promise<void> {
  const frame = canvasElement.querySelector<HTMLElement>("[data-phone-frame]");
  if (frame == null) throw new Error("Render the story with withPhoneFrame.");
  await expect(frame.clientWidth).toBe(PHONE_WIDTH);
  await expect(frame.scrollWidth).toBeLessThanOrEqual(frame.clientWidth);
  await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
}
