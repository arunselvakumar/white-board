import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import type {
  HrmsBranch,
  HrmsBranchList,
  HrmsProjectSites,
} from "@/src/queries/hrms-branches";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import { BranchDialog } from "./branch-dialog";
import { BranchesPage } from "./branches-page";

const BRANCHES = "/api/construction/hrms/branches";
const AT = "2026-10-10T06:00:00.000Z";

const CHENNAI: HrmsBranch = {
  id: "0199d0a0-0000-7000-8000-000000000001",
  kind: "office_branch",
  name: "Chennai Head Office",
  address: "Anna Salai",
  projectId: null,
  projectName: null,
  latitude: 13.0827,
  longitude: 80.2707,
  radiusMetres: 150,
  memberIds: ["0199d0a0-0000-7000-8000-0000000000a1"],
  createdAt: AT,
  updatedAt: AT,
};

const TOWER_SITE: HrmsBranch = {
  ...CHENNAI,
  id: "0199d0a0-0000-7000-8000-000000000002",
  kind: "project_site",
  name: "Main gate",
  address: null,
  projectId: "0199d0a0-0000-7000-8000-0000000000b1",
  projectName: "Sea View Towers",
  latitude: 13.0502,
  longitude: 80.2121,
  radiusMetres: 300,
  memberIds: [],
};

const EMPLOYEES: HrmsBranchList["employees"] = [
  {
    memberId: "0199d0a0-0000-7000-8000-0000000000a1",
    name: "Prabhu Saravanan",
    memberType: "normal",
    designationName: "Site Engineer",
    active: true,
  },
  {
    memberId: "0199d0a0-0000-7000-8000-0000000000a2",
    name: "Meena Rajan",
    memberType: "hrms",
    designationName: "Accountant",
    active: true,
  },
];

const SITES: HrmsProjectSites = {
  items: [
    {
      project: { id: TOWER_SITE.projectId ?? "", name: "Sea View Towers" },
      fence: TOWER_SITE,
    },
    {
      project: { id: "0199d0a0-0000-7000-8000-0000000000b2", name: "Villas" },
      fence: null,
    },
  ],
};

let calls: ApiCall[] = [];
let list: HrmsBranchList = { items: [], employees: EMPLOYEES };
let createResponse: (body: unknown) => Response = (body) =>
  Response.json(
    {
      ...CHENNAI,
      ...(body as object),
      id: "0199d0a0-0000-7000-8000-00000000000f",
    },
    { status: 201 },
  );

function posted(path: string): unknown[] {
  return calls
    .filter((call) => call.method === "POST" && call.path === path)
    .map((call) => call.body);
}

function serve(items: HrmsBranch[]) {
  return () => {
    calls = [];
    list = { items, employees: EMPLOYEES };
    const api = mockApi((call) => {
      calls.push(call);
      if (call.method === "GET" && call.path === BRANCHES)
        return Response.json(list);
      if (call.path === `${BRANCHES}/project-sites`)
        return Response.json(SITES);
      if (call.method === "POST" && call.path === BRANCHES)
        return createResponse(call.body);
      if (call.path.endsWith("/members"))
        return Response.json({ ...CHENNAI, ...(call.body as object) });
      if (call.path.endsWith("/remove"))
        return new Response(null, { status: 204 });
      return undefined;
    });
    return () => {
      api.restore();
      createResponse = (body) =>
        Response.json(
          {
            ...CHENNAI,
            ...(body as object),
            id: "0199d0a0-0000-7000-8000-00000000000f",
          },
          { status: 201 },
        );
    };
  };
}

const meta = {
  title: "HRMS/Branches",
  component: BranchesPage,
  args: { showMap: false },
  render: (args) => (
    <StoryQueries>
      <BranchesPage {...args} />
    </StoryQueries>
  ),
} satisfies Meta<typeof BranchesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoFencesYet: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Branches & Sites" }),
    ).toBeVisible();
    await expect(canvas.getByText("No fences yet")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "New Office Branch" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "New site fence" }),
    ).toBeVisible();
  },
};

export const ListsBranchesAndSites: Story = {
  beforeEach: serve([CHENNAI, TOWER_SITE]),
  play: async ({ canvas }) => {
    const offices = within(
      await canvas.findByRole("list", { name: "Office branches" }),
    );
    await expect(offices.getByText("Chennai Head Office")).toBeVisible();
    await expect(offices.getByText("Members: Prabhu Saravanan")).toBeVisible();
    await expect(offices.getByText(/150 m radius/)).toBeVisible();
    const sites = within(canvas.getByRole("list", { name: "Project sites" }));
    await expect(sites.getByText("Main gate")).toBeVisible();
    await expect(sites.getByText("Sea View Towers")).toBeVisible();
  },
};

export const AddsAnOfficeBranch: Story = {
  beforeEach: serve([]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New Office Branch" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Office Branch" }),
    );
    await userEvent.type(
      dialog.getByLabelText("Branch name"),
      "Madurai Office",
    );
    await userEvent.type(dialog.getByLabelText("Latitude"), "9.925201");
    await userEvent.type(dialog.getByLabelText("Longitude"), "78.119775");
    const radius = dialog.getByLabelText("Radius");
    await userEvent.clear(radius);
    await userEvent.type(radius, "200");
    await userEvent.click(dialog.getByRole("button", { name: "Save fence" }));
    await waitFor(() =>
      expect(posted(BRANCHES)).toEqual([
        {
          kind: "office_branch",
          name: "Madurai Office",
          address: null,
          projectId: null,
          latitude: 9.925201,
          longitude: 78.119775,
          radiusMetres: 200,
        },
      ]),
    );
    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "New Office Branch" }),
      ).toBeNull(),
    );
  },
};

export const RefusesARadiusOutsideTheLimits: Story = {
  beforeEach: serve([]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New Office Branch" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(dialog.getByLabelText("Branch name"), "Tiny");
    await userEvent.type(dialog.getByLabelText("Latitude"), "95");
    await userEvent.type(dialog.getByLabelText("Longitude"), "80.27");
    const radius = dialog.getByLabelText("Radius");
    await userEvent.clear(radius);
    await userEvent.type(radius, "10");
    await userEvent.click(dialog.getByRole("button", { name: "Save fence" }));
    await expect(
      await dialog.findByText("Use 25 to 5,000 whole metres"),
    ).toBeVisible();
    await expect(
      dialog.getByText("Enter a latitude from -90 to 90"),
    ).toBeVisible();
    await expect(radius).toHaveAttribute("aria-invalid", "true");
    await expect(posted(BRANCHES)).toHaveLength(0);
  },
};

export const ShowsATakenName: Story = {
  beforeEach: serve([CHENNAI]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    createResponse = () =>
      Response.json(
        {
          code: "BRANCH_NAME_TAKEN",
          message: "An office branch is already called “Chennai Head Office”.",
          details: { field: "name" },
        },
        { status: 409 },
      );
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New Office Branch" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.type(
      dialog.getByLabelText("Branch name"),
      "Chennai Head Office",
    );
    await userEvent.type(dialog.getByLabelText("Latitude"), "13.0827");
    await userEvent.type(dialog.getByLabelText("Longitude"), "80.2707");
    await userEvent.click(dialog.getByRole("button", { name: "Save fence" }));
    await expect(
      await dialog.findByText(/already called “Chennai Head Office”/),
    ).toBeVisible();
    await expect(dialog.getByLabelText("Branch name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const AddsASiteFenceOnAFreeProject: Story = {
  beforeEach: serve([CHENNAI, TOWER_SITE]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New site fence" }),
    );
    const dialog = within(
      await body.findByRole("dialog", { name: "New Project site fence" }),
    );
    await userEvent.click(dialog.getByRole("combobox", { name: "Project" }));
    // Sea View Towers already has its fence.
    await expect(
      body.queryByRole("option", { name: "Sea View Towers" }),
    ).toBeNull();
    await userEvent.click(await body.findByRole("option", { name: "Villas" }));
    await userEvent.type(dialog.getByLabelText("Site label"), "Gate 1");
    await userEvent.type(dialog.getByLabelText("Latitude"), "12.9716");
    await userEvent.type(dialog.getByLabelText("Longitude"), "80.2201");
    await userEvent.click(dialog.getByRole("button", { name: "Save fence" }));
    await waitFor(() =>
      expect(posted(BRANCHES)).toEqual([
        expect.objectContaining({
          kind: "project_site",
          name: "Gate 1",
          projectId: "0199d0a0-0000-7000-8000-0000000000b2",
          radiusMetres: 100,
        }),
      ]),
    );
  },
};

export const UsesMyLocation: Story = {
  beforeEach: () => {
    const restore = serve([])();
    const original = Object.getOwnPropertyDescriptor(navigator, "geolocation");
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) => {
          success({
            coords: {
              latitude: 13.0826802,
              longitude: 80.2707184,
              accuracy: 12,
            },
          } as GeolocationPosition);
        },
      },
    });
    return () => {
      restore();
      if (original == null) Reflect.deleteProperty(navigator, "geolocation");
      else Object.defineProperty(navigator, "geolocation", original);
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "New Office Branch" }),
    );
    const dialog = within(await body.findByRole("dialog"));
    await userEvent.click(
      dialog.getByRole("button", { name: "Use my location" }),
    );
    await expect(dialog.getByLabelText("Latitude")).toHaveValue("13.082680");
    await expect(dialog.getByLabelText("Longitude")).toHaveValue("80.270718");
  },
};

export const LinksMembersToABranch: Story = {
  beforeEach: serve([CHENNAI]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Actions for Chennai Head Office",
      }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Members" }),
    );
    const dialog = within(
      await body.findByRole("dialog", {
        name: "Members who check in at Chennai Head Office",
      }),
    );
    await expect(dialog.getByText("1 linked.")).toBeVisible();
    await userEvent.click(
      dialog.getByRole("checkbox", { name: /Meena Rajan/ }),
    );
    await expect(dialog.getByText("2 linked.")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Save members" }));
    await waitFor(() =>
      expect(posted(`${BRANCHES}/${CHENNAI.id}/members`)).toEqual([
        {
          memberIds: [
            "0199d0a0-0000-7000-8000-0000000000a1",
            "0199d0a0-0000-7000-8000-0000000000a2",
          ],
          expectedUpdatedAt: AT,
        },
      ]),
    );
  },
};

export const RemovesAFence: Story = {
  beforeEach: serve([CHENNAI]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Actions for Chennai Head Office",
      }),
    );
    await userEvent.click(
      await body.findByRole("menuitem", { name: "Remove fence" }),
    );
    const dialog = within(
      await body.findByRole("alertdialog", {
        name: "Remove Chennai Head Office?",
      }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Remove fence" }));
    await waitFor(() =>
      expect(posted(`${BRANCHES}/${CHENNAI.id}/remove`)).toHaveLength(1),
    );
  },
};

/** The real map, with OpenStreetMap tiles: for a look in Storybook, not run as a test. */
export const MapPicker: StoryObj<typeof BranchDialog> = {
  tags: ["!test"],
  beforeEach: serve([CHENNAI]),
  render: () => (
    <StoryQueries>
      <BranchDialog
        kind="office_branch"
        branch={CHENNAI}
        onClose={() => undefined}
      />
    </StoryQueries>
  ),
};
