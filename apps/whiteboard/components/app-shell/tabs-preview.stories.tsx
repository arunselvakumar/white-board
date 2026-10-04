import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent } from "storybook/test";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

const meta = {
  title: "Workspace/Tabs",
  parameters: { layout: "centered" },
  render: () => (
    <Tabs defaultValue="overview" className="min-w-80">
      <TabsList aria-label="Workspace views">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="students">Students</TabsTrigger>
        <TabsTrigger value="batches">Batches</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="p-4">
        Workspace overview
      </TabsContent>
      <TabsContent value="students" className="p-4">
        Students view
      </TabsContent>
      <TabsContent value="batches" className="p-4">
        Batches view
      </TabsContent>
    </Tabs>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvas }) => {
    const overview = canvas.getByRole("tab", { name: "Overview" });
    const students = canvas.getByRole("tab", { name: "Students" });
    await expect(overview).toHaveAttribute("aria-selected", "true");
    await userEvent.click(students);
    await expect(students).toHaveAttribute("aria-selected", "true");
    const panel = canvas.getByRole("tabpanel", { name: "Students" });
    await expect(panel).toBeVisible();
    await expect(panel.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      canvas
        .getByRole("tablist", { name: "Workspace views" })
        .getBoundingClientRect().bottom,
    );
  },
};
