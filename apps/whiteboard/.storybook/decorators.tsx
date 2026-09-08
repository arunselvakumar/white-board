import type { Decorator } from "@storybook/nextjs-vite";

export const withAuthFormFrame: Decorator = (Story) => (
  <div className="flex min-h-svh items-center justify-center p-8">
    <div className="w-full max-w-[352px] space-y-8">
      <Story />
    </div>
  </div>
);
