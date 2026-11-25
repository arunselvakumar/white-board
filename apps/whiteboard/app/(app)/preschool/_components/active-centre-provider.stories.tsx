import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { AppShell } from "@/app/(app)/_components/app-shell/app-shell";
import { WorkspaceGate } from "@/app/(app)/_components/workspace/workspace-gate";
import { openSidebar } from "@/.storybook/expect-app-shell";
import { PRESCHOOL_CENTRE_COOKIE } from "@/lib/preschool-active-centre";

import {
  ActiveCentreProvider,
  useActiveCentre,
} from "./active-centre-provider";
import { PreschoolPage } from "./preschool-page";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  preschoolMe,
  type PreschoolApiCall,
} from "./preschool-story-api";

function ActiveCentreName() {
  const { centre, me } = useActiveCentre();
  return (
    <PreschoolPage title="Centre Dashboard">
      <p>
        Working in {centre.name} as {me.role}
      </p>
    </PreschoolPage>
  );
}

const meta = {
  title: "Preschool/Layout",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool" } },
  },
  render: () => (
    <WorkspaceGate>
      <AppShell>
        <ActiveCentreProvider>
          <ActiveCentreName />
        </ActiveCentreProvider>
      </AppShell>
    </WorkspaceGate>
  ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const requests: string[] = [];
const calls: PreschoolApiCall[] = [];

function centreCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${PRESCHOOL_CENTRE_COOKIE}=`))
    ?.split("=")[1];
}

/**
 * The Owner of a chain: the Centre menu, the Head Office group, Switch
 * Centre, and no Training Institute request from the shell.
 */
export const OwnerOfSeveralCentres: Story = {
  beforeEach() {
    requests.length = 0;
    return mockPreschoolApi({ requests });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByText("Working in Little Steps Anna Nagar as owner"),
    ).toBeVisible();
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    const main = within(
      sidebar.getByRole("navigation", { name: "This Centre" }),
    );
    await expect(main.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(main.getByRole("link", { name: "Children" })).toHaveAttribute(
      "href",
      "/preschool/children",
    );
    const headOffice = within(
      sidebar.getByRole("navigation", { name: "Head Office" }),
    );
    for (const label of ["Head Office", "Royalty"])
      await expect(headOffice.getByRole("link", { name: label })).toBeVisible();
    const setup = within(sidebar.getByRole("navigation", { name: "Setup" }));
    for (const label of [
      "Classrooms",
      "Staff",
      "Centres",
      "Programmes",
      "Fee Structures",
      "Stock Items",
    ])
      await expect(setup.getByRole("link", { name: label })).toBeVisible();
    await expect(
      sidebar.queryByRole("button", { name: /Notifications/ }),
    ).not.toBeInTheDocument();
    await expect(canvas.queryByText("Today's Batches")).not.toBeInTheDocument();
    await expect(
      requests.filter((path) => path.startsWith("/api/training-institute")),
    ).toEqual([]);
  },
};

/** Switch Centre changes the active Centre, remembers it, and closes. */
export const SwitchCentre: Story = {
  beforeEach() {
    return mockPreschoolApi();
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByText("Working in Little Steps Anna Nagar as owner");
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    await userEvent.click(
      sidebar.getByRole("button", {
        name: "Switch Centre. Active Centre: Little Steps Anna Nagar",
      }),
    );
    const modal = await body.findByRole("dialog", { name: "Switch Centre" });
    await waitFor(() => expect(modal).toBeVisible());
    await userEvent.click(
      within(modal).getByRole("button", {
        name: "Little Steps Velachery LSVL · Franchised",
      }),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Switch Centre" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      await body.findByText("Working in Little Steps Velachery as owner"),
    ).toBeVisible();
    await expect(centreCookie()).toBe(CENTRE_IDS.velachery);
  },
};

/** The remembered Centre opens first; one the User lost falls back. */
export const RemembersTheCentre: Story = {
  beforeEach() {
    return mockPreschoolApi({ centreId: CENTRE_IDS.tambaram });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Working in Little Steps Tambaram as owner"),
    ).toBeVisible();
    await expect(canvas.getByText("Little Steps Tambaram")).toBeVisible();
  },
};

/** A standalone preschool: no Head Office group, no Switch Centre; Centres stays under Setup. */
export const OwnerOfOneCentre: Story = {
  beforeEach() {
    const me = preschoolMe({ hasSeveralCentres: false });
    return mockPreschoolApi({ me: { ...me, centres: me.centres.slice(0, 1) } });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await canvas.findByText("Working in Little Steps Anna Nagar as owner");
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    await expect(
      sidebar.queryByRole("navigation", { name: "Head Office" }),
    ).not.toBeInTheDocument();
    await expect(
      within(sidebar.getByRole("navigation", { name: "Setup" })).getByRole(
        "link",
        { name: "Centres" },
      ),
    ).toBeVisible();
    await expect(
      sidebar.queryByRole("button", { name: /^Switch Centre/ }),
    ).not.toBeInTheDocument();
  },
};

/** A Teacher's menu, and a Teacher sent Home from the Dashboard. */
export const TeacherIsSentHome: Story = {
  beforeEach() {
    return mockPreschoolApi({
      me: preschoolMe({
        role: "teacher",
        hasSeveralCentres: true,
        centres: preschoolMe().centres.slice(0, 1),
      }),
    });
  },
  play: async ({ canvasElement, userEvent }) => {
    await waitFor(() =>
      expect(getRouter().replace).toHaveBeenCalledWith("/preschool/teacher"),
    );
    const sidebar = within(await openSidebar(canvasElement, userEvent));
    const main = within(
      await sidebar.findByRole("navigation", { name: "Main menu" }),
    );
    await expect(main.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/preschool/teacher",
    );
    await expect(
      main.queryByRole("link", { name: "Fees" }),
    ).not.toBeInTheDocument();
    await expect(
      sidebar.queryByRole("navigation", { name: "Head Office" }),
    ).not.toBeInTheDocument();
    await expect(
      sidebar.queryByRole("navigation", { name: "Setup" }),
    ).not.toBeInTheDocument();
  },
};

/** The Owner's first visit finishes a setup Workspace Creation left half-done. */
export const OwnerFinishesSetup: Story = {
  beforeEach() {
    calls.length = 0;
    let setUp = false;
    return mockPreschoolApi({
      me: null,
      memberRole: "owner",
      calls,
      routes: {
        "GET /me": () =>
          setUp
            ? { json: preschoolMe() }
            : {
                status: 403,
                json: {
                  code: "NOT_A_PRESCHOOL",
                  message: "This Workspace is not a Preschool.",
                },
              },
        "POST /setup": () => {
          setUp = true;
          return {
            status: 201,
            json: {
              centreId: CENTRE_IDS.annaNagar,
              academicYearId: "5c0e8400-e29b-41d4-a716-446655440000",
              created: true,
            },
          };
        },
      },
    });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Working in Little Steps Anna Nagar as owner"),
    ).toBeVisible();
    await expect(
      calls.filter((call) => call.route === "POST /setup"),
    ).toHaveLength(1);
  },
};

/** Anyone but the Owner waits for the Owner to finish the setup. */
export const NotSetUpYet: Story = {
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      me: null,
      memberRole: "teacher",
      calls,
      routes: {
        "GET /me": () => ({
          status: 403,
          json: {
            code: "NOT_A_PRESCHOOL",
            message: "This Workspace is not a Preschool.",
          },
        }),
      },
    });
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("This Preschool is not set up yet"),
    ).toBeVisible();
    await expect(
      calls.filter((call) => call.route === "POST /setup"),
    ).toHaveLength(0);
  },
};

/** A staff member the Preschool has no Staff record for. */
export const NoAccess: Story = {
  beforeEach() {
    return mockPreschoolApi({
      me: null,
      memberRole: "teacher",
      routes: {
        "GET /me": () => ({
          status: 403,
          json: { code: "FORBIDDEN", message: "You do not have access." },
        }),
      },
    });
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Nothing to show yet")).toBeVisible();
  },
};
