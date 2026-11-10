import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import {
  CalendarGridSkeleton,
  CardGridSkeleton,
  FormSkeleton,
  ItemListSkeleton,
  MetricGridSkeleton,
  TableSkeleton,
  TabsSkeleton,
} from "@repo/ui/components/skeleton-kit";

import { PageFallback } from "../query-suspense";
import { PageHeaderSkeleton } from "./page-header-skeleton";

/** The skeleton kit (ADR-0047), each piece as a page would use it. */
const meta = {
  title: "App/Skeleton kit",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RootFallback: Story = {
  render: () => <PageFallback />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading");
  },
};

export const ListPage: Story = {
  render: () => (
    <div className="w-full max-w-4xl space-y-6 p-6">
      <PageHeaderSkeleton back={{ label: "Masters", href: "/app/masters" }} />
      <TableSkeleton
        count
        label="Loading Vendors"
        columns={[
          { header: "Name" },
          { header: "Contact", kind: "muted" },
          { header: "Projects", kind: "muted" },
          { header: "Shifts", kind: "number", className: "text-right" },
          { header: "Status", kind: "badge" },
          {
            header: <span className="sr-only">Actions</span>,
            kind: "actions",
            className: "w-12",
          },
        ]}
      />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading Vendors")).toBeInTheDocument();
    await expect(canvas.getByText("Contact")).toBeInTheDocument();
  },
};

export const Dashboard: Story = {
  render: () => (
    <div className="space-y-6 p-6">
      <MetricGridSkeleton
        labels={["Projects", "Received", "Paid", "Balance"]}
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      />
      <CardGridSkeleton count={3} lines={2} media />
    </div>
  ),
};

export const ListsAndForms: Story = {
  render: () => (
    <div className="grid gap-8 p-6 lg:grid-cols-2">
      <ItemListSkeleton media="avatar" trailing="badge" />
      <FormSkeleton
        columns={2}
        actions={2}
        fields={[
          { label: "Name", wide: true },
          { label: "Contact number" },
          { label: "Labour Category", control: "select" },
          { label: "Notes", control: "textarea", wide: true },
          { label: "Active", control: "switch" },
        ]}
      />
    </div>
  ),
};

export const TabsAndMonthGrid: Story = {
  render: () => (
    <div className="p-6">
      <TabsSkeleton tabs={3}>
        <CalendarGridSkeleton
          nameHeader="Labour"
          headers={Array.from({ length: 14 }, (_, day) => String(day + 1))}
        />
      </TabsSkeleton>
    </div>
  ),
};
