import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import type { DesignationResponse } from "@/src/queries/designations";

import {
  calledPath,
  fakeApi,
  SITE_ENGINEER,
  STORY_DESIGNATIONS,
  StoryQueryClient,
} from "./designation-story-support";
import { DesignationsList } from "./designations-list";

const BASE = "/api/construction/organization/designations";

let api: ReturnType<typeof fakeApi>;

/** An in-memory Designations API over `items`. */
function serve(initial: DesignationResponse[]) {
  return () => {
    let items = [...initial];
    api = fakeApi(({ url, method }) => {
      if (method === "GET" && url === BASE)
        return Response.json({ items, total: items.length });
      const [, id, action] =
        /^\/api\/construction\/organization\/designations\/([^/]+)\/(\w+)$/.exec(
          url,
        ) ?? [];
      const source = items.find((item) => item.id === id);
      if (source == null) return undefined;
      if (action === "duplicate") {
        const copy = {
          ...source,
          id: "0199a1b2-0000-7000-8000-0000000000ff",
          name: `${source.name} (copy)`,
          isSeed: false,
        };
        items = [...items, copy];
        return Response.json(copy, { status: 201 });
      }
      if (action === "delete") {
        if (source.name === "Owner")
          return Response.json(
            {
              code: "DESIGNATION_IN_USE",
              message:
                "Team Members hold this Designation. Give them another Designation first.",
            },
            { status: 409 },
          );
        items = items.filter((item) => item.id !== id);
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Masters/Designations/List",
  component: DesignationsList,
  render: () => (
    <StoryQueryClient>
      <DesignationsList />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof DesignationsList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDesignations: Story = {
  beforeEach: serve(STORY_DESIGNATIONS),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Designations" });
    const rows = within(list).getAllByRole("listitem");
    await expect(
      rows.map((row) => row.querySelector("a")?.textContent),
    ).toEqual(["Accountant", "Billing Engineer", "Owner", "Site Engineer"]);
    const [, billing, , engineer] = rows;
    if (billing == null || engineer == null) throw new Error("Rows missing");
    await expect(within(engineer).getByText("Default")).toBeVisible();
    await expect(within(engineer).getByText("Has template")).toBeVisible();
    await expect(within(billing).queryByText("Default")).toBeNull();
    await expect(within(billing).queryByText("Has template")).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "Add Designation" }),
    ).toHaveAttribute("href", "/app/masters/designations/new");

    await userEvent.type(canvas.getByLabelText("Search Designations"), "eng");
    await expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.clear(canvas.getByLabelText("Search Designations"));

    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Site Engineer" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "Edit" }));
    await expect(getRouter().push).toHaveBeenCalledWith(
      `/app/masters/designations/${SITE_ENGINEER.id}`,
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Site Engineer" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Duplicate" }),
    );
    await expect(
      await canvas.findByRole("link", { name: "Site Engineer (copy)" }),
    ).toBeVisible();
  },
};

export const DeleteAsksFirst: Story = {
  beforeEach: serve(STORY_DESIGNATIONS),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Actions for Owner" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = await body.findByRole("alertdialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("heading", { name: "Delete Owner?" }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(
        "Team Members hold this Designation. Give them another Designation first.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for Billing Engineer" }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Delete" }),
    );
    await userEvent.click(
      within(await body.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(
        canvas.queryByRole("link", { name: "Billing Engineer" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      calledPath(api.spy, `${String(STORY_DESIGNATIONS[1]?.id)}/delete`),
    ).toBe(true);
  },
};

export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Designations yet")).toBeVisible();
    const links = canvas.getAllByRole("link", { name: "Add Designation" });
    await expect(links).toHaveLength(2);
    await expect(
      canvas.queryByLabelText("Search Designations"),
    ).not.toBeInTheDocument();
  },
};
