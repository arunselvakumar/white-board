import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";

import { mockFetch } from "@/.storybook/mock-fetch";
import { NO_RESOURCES, PROJECT_ID } from "./resource-fixtures";
import { SiteEngineersSection } from "./site-engineers-section";
import {
  ANAND,
  BHASKAR,
  CHANDRAN,
  DURAI,
  SITE_ENGINEERS_API,
} from "./staffing-fixtures";

let api: ReturnType<typeof mockFetch>;

function posted(): unknown {
  const call = api.spy.mock.calls.find(
    ([input, init]) => init?.method === "POST" && input === SITE_ENGINEERS_API,
  );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

const meta = {
  title: "Projects/Resources/Site Engineers",
  component: SiteEngineersSection,
  args: {
    projectId: PROJECT_ID,
    engineers: [ANAND, BHASKAR],
    canEdit: true,
    canOpenPages: true,
  },
  render: (args) => (
    <StoryQueryClient>
      <div className="grid max-w-5xl gap-6 p-6 lg:grid-cols-2">
        <SiteEngineersSection {...args} />
      </div>
    </StoryQueryClient>
  ),
} satisfies Meta<typeof SiteEngineersSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { engineers: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("No Site Engineers on this Project"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Site Engineers" }),
    ).toBeVisible();
  },
};

export const AFew: Story = {
  play: async ({ canvas }) => {
    const section = within(
      canvas.getByRole("region", { name: "Site Engineers 2" }),
    );
    await expect(
      section.getByRole("link", { name: ANAND.name }),
    ).toHaveAttribute("href", `/app/staff/site-engineers/${ANAND.id}`);
    await expect(section.getByText("SE-001 · +91 98400 12345")).toBeVisible();
    await expect(section.getByText("Disabled")).toBeVisible();
  },
};

export const AddSiteEngineers: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: `${SITE_ENGINEERS_API}/options`,
        respond: () => Response.json({ items: [CHANDRAN, DURAI] }),
      },
      {
        method: "POST",
        path: SITE_ENGINEERS_API,
        respond: () =>
          Response.json({
            ...NO_RESOURCES,
            siteEngineers: [ANAND, BHASKAR, CHANDRAN],
          }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineers" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    // Without a sign-in: listed, not offered, with a way to their page.
    await expect(
      await dialog.findByRole("checkbox", { name: /Durai Murugan/ }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      dialog.getByRole("link", {
        name: "Durai Murugan needs a sign-in: open their page",
      }),
    ).toHaveAttribute("href", `/app/staff/site-engineers/${DURAI.id}`);
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Chandran Pillai/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(posted()).toEqual({
      ids: [ANAND.id, BHASKAR.id, CHANDRAN.id],
      expectedIds: [ANAND.id, BHASKAR.id],
    });
  },
};

export const RemoveChangedElsewhere: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        method: "POST",
        path: SITE_ENGINEERS_API,
        respond: () =>
          Response.json(
            {
              code: "PROJECT_RESOURCES_CHANGED",
              message:
                "Someone else changed this Project's Resources after you opened them. Reload to see their changes.",
            },
            { status: 409 },
          ),
      },
      {
        path: /\/resources$/,
        respond: () => Response.json(NO_RESOURCES),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: `Remove ${BHASKAR.name}` }),
    );
    const confirm = within(await body.findByRole("alertdialog"));
    await expect(
      confirm.getByText(`Remove ${BHASKAR.name} from this Project?`),
    ).toBeVisible();
    await userEvent.click(confirm.getByRole("button", { name: "Remove" }));
    await expect(
      await canvas.findByText(/Someone else changed this Project's Resources/),
    ).toBeVisible();
    await expect(posted()).toEqual({
      ids: [ANAND.id],
      expectedIds: [ANAND.id, BHASKAR.id],
    });
  },
};

export const ReadOnly: Story = {
  args: { canEdit: false, canOpenPages: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(ANAND.name)).toBeVisible();
    await expect(canvas.queryByRole("link", { name: ANAND.name })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /Add Site Engineers|Remove/ }),
    ).toBeNull();
  },
};

export const OnAPhone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => {
    api = mockFetch([
      {
        path: `${SITE_ENGINEERS_API}/options`,
        respond: () => Response.json({ items: [CHANDRAN, DURAI] }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const html = canvasElement.ownerDocument.documentElement;
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Site Engineers" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      await dialog.findByRole("checkbox", { name: /Chandran Pillai/ }),
    ).toBeVisible();
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
  },
};
