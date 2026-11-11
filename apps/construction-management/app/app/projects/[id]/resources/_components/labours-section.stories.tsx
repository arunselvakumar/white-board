import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";

import { mockFetch } from "@/.storybook/mock-fetch";
import { LaboursSection } from "./labours-section";
import { PROJECT_ID } from "./resource-fixtures";
import {
  ARUMUGAM,
  BALU,
  DHANAM,
  ELANGO,
  FEW_LABOURS,
  LABOUR_OPTIONS,
  LABOURS_API,
  TODAY,
  labourPage,
  manyLabours,
} from "./staffing-fixtures";

let api: ReturnType<typeof mockFetch>;

const PROJECTS_API = "/api/construction/projects/projects";

function posted(path: string): unknown {
  const call = api.spy.mock.calls.find(
    ([input, init]) => init?.method === "POST" && input === path,
  );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

function listCalls(): URLSearchParams[] {
  return api.spy.mock.calls
    .map(([input]) =>
      typeof input === "string" ? new URL(input, "http://story.local") : null,
    )
    .filter((url): url is URL => url != null)
    .filter((url) => url.pathname === LABOURS_API)
    .map((url) => url.searchParams);
}

function refused(code: string, message: string, details: unknown) {
  return Response.json({ code, message, details }, { status: 409 });
}

const meta = {
  title: "Projects/Resources/Labours",
  component: LaboursSection,
  args: {
    projectId: PROJECT_ID,
    total: FEW_LABOURS.length,
    today: TODAY,
    canEdit: true,
    canPickLabours: true,
    canOpenLabours: true,
    canTransfer: true,
  },
  render: (args) => (
    <StoryQueryClient>
      <div className="grid max-w-5xl gap-6 p-6 lg:grid-cols-2">
        <LaboursSection {...args} />
      </div>
    </StoryQueryClient>
  ),
} satisfies Meta<typeof LaboursSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { total: 0 },
  beforeEach: () => {
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage([], search)),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Labours on this Project"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Add Labours" }),
    ).toBeVisible();
    // Nothing to search yet.
    await expect(canvas.queryByRole("searchbox")).toBeNull();
  },
};

export const AFew: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(FEW_LABOURS, search)),
      },
      {
        path: `${PROJECTS_API}/${PROJECT_ID}`,
        respond: () => Response.json({ id: PROJECT_ID, name: "Sky Towers" }),
      },
      {
        path: `${PROJECTS_API}/options`,
        respond: () =>
          Response.json({
            items: [
              {
                id: "0199a1b2-0000-7000-8000-0000000000a2",
                name: "Green Park",
              },
            ],
          }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const section = within(
      await canvas.findByRole("region", { name: "Labours 3" }),
    );
    const rows = within(section.getByRole("list", { name: "Labours" }));
    await expect(
      rows.getByRole("link", { name: ARUMUGAM.name }),
    ).toHaveAttribute("href", `/app/staff/labours/${ARUMUGAM.id}`);
    await expect(
      rows.getByText("L-001 · Mason · Since 2 Mar 2026"),
    ).toBeVisible();
    await expect(rows.getByText("Inactive")).toBeVisible();
    // Three Labours fit on one page: no pager.
    await expect(section.queryByRole("button", { name: "Next" })).toBeNull();

    await userEvent.click(
      rows.getByRole("button", { name: `Actions for ${ARUMUGAM.name}` }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", {
        name: "Transfer to another Project",
      }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByText(`Transfer ${ARUMUGAM.name}`)).toBeVisible();
    await expect(await dialog.findByText(/Now on Sky Towers/)).toBeVisible();
  },
};

export const Hundreds: Story = {
  args: { total: 320 },
  beforeEach: () => {
    const all = manyLabours(320);
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(all, search)),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const section = within(
      await canvas.findByRole("region", { name: "Labours 320" }),
    );
    await expect(section.getByText("1–50 of 320")).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    await userEvent.click(section.getByRole("button", { name: "Next" }));
    await expect(await section.findByText("51–100 of 320")).toBeVisible();
    await expect(section.getByText("Labour 051")).toBeVisible();
    await userEvent.click(section.getByRole("button", { name: "Previous" }));
    await expect(await section.findByText("1–50 of 320")).toBeVisible();

    // The search goes to the server and starts on its first page.
    await userEvent.type(
      section.getByRole("searchbox", {
        name: "Search Labours on this Project",
      }),
      "Labour 31",
    );
    await expect(await section.findByText("Labour 310")).toBeVisible();
    // Ten match: one page, no pager.
    await waitFor(() =>
      expect(section.queryByRole("button", { name: "Next" })).toBeNull(),
    );
    await waitFor(() =>
      expect(listCalls().at(-1)?.get("search")).toBe("Labour 31"),
    );
    await expect(section.queryByText("Labour 001")).toBeNull();
  },
};

export const AddLabours: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(FEW_LABOURS, search)),
      },
      {
        path: `${LABOURS_API}/options`,
        respond: ({ search }) => {
          const needle = (search.get("search") ?? "").toLowerCase();
          return Response.json({
            items: LABOUR_OPTIONS.filter((item) =>
              item.name.toLowerCase().includes(needle),
            ),
            hasMore: false,
          });
        },
      },
      {
        method: "POST",
        path: LABOURS_API,
        respond: () => new Response(null, { status: 204 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Labours" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      await dialog.findByRole("checkbox", { name: /Dhanalakshmi/ }),
    );
    // A tick survives a new search.
    await userEvent.type(
      dialog.getByRole("searchbox", { name: "Search Labours" }),
      "elan",
    );
    await waitFor(() =>
      expect(dialog.queryByRole("checkbox", { name: /Fathima/ })).toBeNull(),
    );
    await userEvent.click(dialog.getByRole("checkbox", { name: /Elango/ }));
    await expect(dialog.getByText("2 selected")).toBeVisible();
    await expect(dialog.getByLabelText(/^From/)).toHaveValue(TODAY);
    await userEvent.type(dialog.getByLabelText(/Remark/), "Slab work");
    await userEvent.click(
      dialog.getByRole("button", { name: "Add 2 Labours" }),
    );
    await waitFor(() => expect(body.queryByRole("dialog")).toBeNull());
    await expect(posted(LABOURS_API)).toEqual({
      labourIds: [DHANAM.id, ELANGO.id],
      from: TODAY,
      remark: "Slab work",
    });
  },
};

export const AddLaboursRefusedOnTheDate: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(FEW_LABOURS, search)),
      },
      {
        path: `${LABOURS_API}/options`,
        respond: () => Response.json({ items: LABOUR_OPTIONS, hasMore: false }),
      },
      {
        method: "POST",
        path: LABOURS_API,
        respond: () =>
          refused(
            "TRANSFER_BEFORE_LAST_TRANSFER",
            "Elango's Projects last changed on 2026-11-15. Choose that date or later.",
            { field: "from", labourId: ELANGO.id },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Labours" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      await dialog.findByRole("checkbox", { name: /Elango/ }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Add" }));
    const from = dialog.getByLabelText(/^From/);
    await waitFor(() => expect(from).toHaveAttribute("aria-invalid", "true"));
    await expect(
      dialog.getByText(/Elango's Projects last changed on 2026-11-15/),
    ).toBeVisible();
    // Nothing was added: the dialog stays open with the tick.
    await expect(
      dialog.getByRole("checkbox", { name: /Elango/ }),
    ).toBeChecked();
  },
};

export const RemoveRefusedForAttendance: Story = {
  beforeEach: () => {
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(FEW_LABOURS, search)),
      },
      {
        method: "POST",
        path: `${LABOURS_API}/${BALU.id}/remove`,
        respond: ({ init }) => {
          const sent = JSON.parse(
            typeof init?.body === "string" ? init.body : "{}",
          ) as { lastDay: string };
          return sent.lastDay === TODAY
            ? refused(
                "TRANSFER_BEFORE_ATTENDANCE",
                "Balu has attendance on this Project up to 2026-11-12. Choose that day or later as the Last day.",
                { field: "lastDay", labourId: BALU.id },
              )
            : new Response(null, { status: 204 });
        },
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: `Actions for ${BALU.name}` }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Remove from Project" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      dialog.getByText(`Remove ${BALU.name} from this Project`),
    ).toBeVisible();
    const lastDay = dialog.getByLabelText(/^Last day/);
    await expect(lastDay).toHaveValue(TODAY);
    await userEvent.click(dialog.getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(lastDay).toHaveAttribute("aria-invalid", "true"),
    );
    await expect(
      dialog.getByText(/Balu has attendance on this Project up to 2026-11-12/),
    ).toBeVisible();
    await expect(posted(`${LABOURS_API}/${BALU.id}/remove`)).toEqual({
      lastDay: TODAY,
      remark: null,
    });
  },
};

export const ReadOnly: Story = {
  args: {
    canEdit: false,
    canPickLabours: false,
    canOpenLabours: false,
    canTransfer: false,
  },
  beforeEach: () => {
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(FEW_LABOURS, search)),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(ARUMUGAM.name)).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Add Labours" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /^Actions for/ }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: ARUMUGAM.name }),
    ).toBeNull();
  },
};

export const OnAPhone: Story = {
  args: { total: 320 },
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => {
    const all = manyLabours(320);
    api = mockFetch([
      {
        path: LABOURS_API,
        respond: ({ search }) => Response.json(labourPage(all, search)),
      },
      {
        path: `${LABOURS_API}/options`,
        respond: () => Response.json({ items: LABOUR_OPTIONS, hasMore: true }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByText("1–50 of 320")).toBeVisible();
    const html = canvasElement.ownerDocument.documentElement;
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
    await userEvent.click(canvas.getByRole("button", { name: "Add Labours" }));
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      await dialog.findByText(/Showing the first 3\. Search/),
    ).toBeVisible();
    await expect(html.scrollWidth).toBeLessThanOrEqual(html.clientWidth);
  },
};
