import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";

import type { ProjectHome } from "@/src/queries/project-home";

import { PagePlaceholder } from "@/components/app-shell/page-placeholder";

import { mockApi, StoryQueries } from "../../.storybook/mocks/api";
import { KUMARI, STORY_LOGO_URL } from "./project-fixtures";
import {
  clearProjectFlash,
  peekProjectFlash,
  setProjectFlash,
} from "./project-flash";
import { storyHome } from "./project-home-fixtures";
import { ProjectShell } from "./project-shell";

const BASE = "/api/construction/projects/projects";
const PATH = `/app/projects/${KUMARI.id}`;

let api: ReturnType<typeof mockApi>;

function serve(
  home: ProjectHome | null = storyHome(),
  subject = KUMARI,
): () => () => void {
  return () => {
    let current = home;
    api = mockApi(({ method, path }) => {
      if (method === "GET" && path === `${BASE}/${subject.id}`)
        return Response.json(subject);
      if (method === "GET" && path === `${BASE}/${subject.id}/home`)
        return current == null ? undefined : Response.json(current);
      if (method === "POST" && path === `${BASE}/${subject.id}/pin`) {
        if (current != null) current = { ...current, pinned: true };
        return Response.json({ pinned: true });
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Projects/ProjectShell",
  component: ProjectShell,
  args: { id: KUMARI.id, children: null },
  beforeEach: serve(),
  parameters: { nextjs: { navigation: { pathname: `${PATH}/dashboard` } } },
  render: () => (
    <StoryQueries>
      <ProjectShell id={KUMARI.id}>
        <PagePlaceholder title="Dashboard" description="The module's page." />
      </ProjectShell>
    </StoryQueries>
  ),
} satisfies Meta<typeof ProjectShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" }),
    ).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      `${PATH}/edit`,
    );
    await expect(canvas.getByText("1 Apr 2026 – 31 Mar 2027")).toBeVisible();
    // The page sits under the header.
    await expect(
      canvas.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  },
};

/** Pin, Hide / show modules and Backup; no Arrange tiles (#99). */
export const OptionsWithUpdateFlag: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project options" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await body.findByRole("menuitem", { name: "Backup…" });
    await expect(
      body.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Pin to top", "Hide / show modules", "Backup…"]);
  },
};

export const OptionsWithoutUpdateFlag: Story = {
  beforeEach: serve(
    storyHome({
      keys: ["documents", "attendance", "payments"],
      canHideModules: false,
    }),
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    // Without the Update flag the options offer no Hide / show modules.
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project options" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await body.findByRole("menuitem", { name: "Backup…" });
    await expect(
      body.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Pin to top", "Backup…"]);
  },
};

/** A message from the screen before (Edit Project) shows on the next page. */
export const MessageFromTheScreenBefore: Story = {
  beforeEach: () => {
    setProjectFlash(
      KUMARI.id,
      "The logo couldn't be saved. Try again from Edit Project.",
    );
    return serve()();
  },
  play: async ({ canvas, userEvent }) => {
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(
      "The logo couldn't be saved. Try again from Edit Project.",
    );
    await expect(peekProjectFlash(KUMARI.id)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Dismiss" }));
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

/**
 * The bare Project path only forwards to the first module, so the message
 * waits for that page instead of flashing past.
 */
export const MessageWaitsOutTheLanding: Story = {
  parameters: { nextjs: { navigation: { pathname: PATH } } },
  beforeEach: () => {
    setProjectFlash(
      KUMARI.id,
      "1 file couldn't upload. Add it again from Documents.",
    );
    const restore = serve()();
    return () => {
      restore();
      clearProjectFlash(KUMARI.id);
    };
  },
  play: async ({ canvas }) => {
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(peekProjectFlash(KUMARI.id)).toBe(
      "1 file couldn't upload. Add it again from Documents.",
    );
  },
};

export const PinFromOptions: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project options" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Pin to top" }),
    );
    await expect(await canvas.findByText("Pinned")).toBeVisible();
    await expect(
      api.calls.mock.calls.some(
        ([call]) => call.method === "POST" && call.path.endsWith("/pin"),
      ),
    ).toBe(true);
  },
};

export const WithoutHomeFallsBack: Story = {
  beforeEach: serve(null),
  play: async ({ canvas }) => {
    // The home could not load: no options (the sidebar falls back, see ProjectNavMenu).
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await expect(
      canvas.queryByRole("button", { name: "Project options" }),
    ).toBeNull();
  },
};

export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  play: async ({ canvas, canvasElement }) => {
    // The slim header wraps; the page never scrolls sideways.
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await canvas.findByRole("button", { name: "Project options" });
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

export const WithLogoAndType: Story = {
  beforeEach() {
    const mock = mockApi(({ method, path }) => {
      if (method === "GET" && path === `${BASE}/${KUMARI.id}`)
        return Response.json({ ...KUMARI, logoUrl: STORY_LOGO_URL });
      if (method === "GET" && path === `${BASE}/${KUMARI.id}/home`)
        return Response.json(storyHome());
      return undefined;
    });
    return mock.restore;
  },
  play: async ({ canvas, canvasElement }) => {
    const heading = await canvas.findByRole("heading", {
      level: 1,
      name: "Kumari Heights",
    });
    const header = heading.closest("header");
    if (header == null) throw new Error("The title is not in a header");
    await expect(await within(header).findByText("Residential")).toBeVisible();
    await expect(
      header.querySelector("[data-slot=avatar-image]"),
    ).toHaveAttribute("src", STORY_LOGO_URL);
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};

export const WithoutLogo: Story = {
  play: async ({ canvas }) => {
    const heading = await canvas.findByRole("heading", {
      level: 1,
      name: "Kumari Heights",
    });
    await expect(
      heading.closest("header")?.querySelector("[data-slot=avatar]"),
    ).toBeNull();
  },
};

/** Project options → Backup… opens the Project backup dialog (CM-906). */
export const BackupFromOptions: Story = {
  beforeEach: () => {
    const restore = serve()();
    const original = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const href =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (href.includes("/api/construction/reporting/backups/options"))
        return Promise.resolve(
          Response.json({
            modules: [
              {
                key: "site_work.daily_worksheet",
                label: "Daily Worksheets",
                group: "Daily Work",
                includesMoney: false,
                hasMedia: true,
              },
            ],
          }),
        );
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
      restore();
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByRole("heading", { level: 1, name: "Kumari Heights" });
    await userEvent.click(
      await canvas.findByRole("button", { name: "Project options" }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Backup…" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await expect(
      await dialog.findByText("Back up Kumari Heights"),
    ).toBeVisible();
    await expect(
      await dialog.findByRole("checkbox", { name: "Daily Worksheets" }),
    ).toBeVisible();
  },
};
