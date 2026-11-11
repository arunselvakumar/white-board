import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import type { SiteEngineer } from "@/src/queries/site-engineers";

import { mockApi, StoryQueries } from "@/.storybook/mocks/api";
import { chooseFromMenu } from "@/app/app/_components/masters/masters-story-support";
import {
  SITE_ENGINEERS_URL,
  noSignInEngineer,
  officeStaffEngineer,
  siteEngineer,
  OWN_SIGN_IN_PENDING,
} from "./site-engineer-fixtures";
import { SupervisorsList } from "./supervisors-list";

const KARTHIK = siteEngineer();
const PRABHU = officeStaffEngineer();
const VIGNESH = noSignInEngineer({ disabled: true });
const MEENA = siteEngineer({
  id: "0199a1b2-0000-7000-8000-000000000404",
  name: "Meena Kumari",
  mobile: null,
  profile: { ...KARTHIK.profile, employeeCode: "SE-014", specialisation: null },
  signIn: OWN_SIGN_IN_PENDING,
});
const ALL = [VIGNESH, KARTHIK, PRABHU, MEENA];

let api: ReturnType<typeof mockApi> | null = null;

/**
 * An in-memory Site Engineers API over `initial`. Names in `inUse` are
 * named by Labours, so their delete answers SUPERVISOR_IN_USE.
 */
function serve(initial: SiteEngineer[], inUse: string[] = []) {
  return () => {
    let items = [...initial];
    api = mockApi(({ method, path }) => {
      if (method === "GET" && path === SITE_ENGINEERS_URL)
        return Response.json({ items, total: items.length });
      const [, list, id, action] =
        /^\/api\/construction\/masters\/(site-engineers|supervisors)\/([^/]+)\/(\w+)$/.exec(
          path,
        ) ?? [];
      const item = items.find((candidate) => candidate.id === id);
      if (method !== "POST" || item == null) return undefined;
      if (
        list === "supervisors" &&
        (action === "disable" || action === "enable")
      ) {
        items = items.map((candidate) =>
          candidate.id === id
            ? { ...candidate, disabled: action === "disable" }
            : candidate,
        );
        return new Response(null, { status: 204 });
      }
      if (list === "site-engineers" && action === "delete") {
        if (inUse.includes(item.name))
          return Response.json(
            {
              code: "SUPERVISOR_IN_USE",
              message:
                "Labours, Vendors or attendance use this, so it cannot be deleted. Disable it instead.",
            },
            { status: 409 },
          );
        items = items.filter((candidate) => candidate.id !== id);
        return new Response(null, { status: 204 });
      }
      return undefined;
    });
    return api.restore;
  };
}

const meta = {
  title: "Human Resources/Site Engineers/List",
  component: SupervisorsList,
  render: () => (
    <StoryQueries>
      <SupervisorsList />
    </StoryQueries>
  ),
} satisfies Meta<typeof SupervisorsList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rows by name with how each signs in; each opens its own page. */
export const WithSiteEngineers: Story = {
  beforeEach: serve(ALL),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const list = await canvas.findByRole("list", { name: "Site Engineers" });
    const rows = within(list).getAllByRole("listitem");
    await expect(
      rows.map((row) => row.querySelector("p")?.textContent),
    ).toEqual([
      "Karthik Raja",
      "Meena Kumari",
      "Prabhu Saravanan",
      "Vignesh Anand",
    ]);
    const [karthik, meena, prabhu, vignesh] = rows;
    if (karthik == null || meena == null || prabhu == null || vignesh == null)
      throw new Error("Rows missing");
    await expect(
      within(karthik).getByText("+91 77081 65767 · SE-001 · Steel / PEB"),
    ).toBeVisible();
    await expect(within(karthik).getByText("Active")).toBeVisible();
    await expect(within(meena).getByText("Joining Pending")).toBeVisible();
    await expect(within(meena).getByText("SE-014")).toBeVisible();
    await expect(within(prabhu).getByText("Office Staff")).toBeVisible();
    await expect(within(vignesh).getByText("No sign-in")).toBeVisible();
    await expect(within(vignesh).getByText("Disabled")).toBeVisible();

    // Add and each name are links to a page, not a dialog.
    for (const link of canvas.getAllByRole("link", {
      name: "Add Site Engineer",
    }))
      await expect(link).toHaveAttribute(
        "href",
        "/app/staff/site-engineers/new",
      );
    await expect(
      within(karthik).getByRole("link", { name: "Karthik Raja" }),
    ).toHaveAttribute("href", `/app/staff/site-engineers/${KARTHIK.id}`);

    const search = canvas.getByLabelText("Search Site Engineers");
    await userEvent.type(search, "se-014");
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(search);
    await userEvent.type(search, "77081");
    await expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.clear(search);

    // Enable goes through the Site Engineer row's own route.
    await chooseFromMenu(canvasElement, userEvent, "Vignesh Anand", "Enable");
    await waitFor(() =>
      expect(api?.calls).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "POST",
          path: `/api/construction/masters/supervisors/${VIGNESH.id}/enable`,
        }),
      ),
    );
    await waitFor(() =>
      expect(
        within(within(list).getAllByRole("listitem")[3] ?? list).queryByText(
          "Disabled",
        ),
      ).toBeNull(),
    );

    await chooseFromMenu(canvasElement, userEvent, "Karthik Raja", "Edit");
    await expect(getRouter().push).toHaveBeenCalledWith(
      `/app/staff/site-engineers/${KARTHIK.id}`,
    );
  },
};

/** Delete says their sign-in goes too; one Labours name is refused. */
export const DeleteAsksFirst: Story = {
  beforeEach: serve(ALL, ["Meena Kumari"]),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await chooseFromMenu(canvasElement, userEvent, "Meena Kumari", "Delete");
    const dialog = await body.findByRole("alertdialog");
    await expect(
      within(dialog).getByText(/their sign-in is removed too/),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );
    await expect(
      await within(dialog).findByText(
        "Labours, Vendors or attendance use this, so it cannot be deleted. Disable it instead.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    // One who is Office Staff keeps that record.
    await chooseFromMenu(
      canvasElement,
      userEvent,
      "Prabhu Saravanan",
      "Delete",
    );
    const officeStaff = await body.findByRole("alertdialog");
    await expect(
      within(officeStaff).getByText(/Prabhu Saravanan stays on Office Staff/),
    ).toBeVisible();
    await userEvent.click(
      within(officeStaff).getByRole("button", { name: "Cancel" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );

    await chooseFromMenu(canvasElement, userEvent, "Karthik Raja", "Delete");
    await userEvent.click(
      within(await body.findByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(canvas.queryByText("Karthik Raja")).not.toBeInTheDocument(),
    );
    await expect(api?.calls).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        path: `/api/construction/masters/site-engineers/${KARTHIK.id}/delete`,
      }),
    );
  },
};

export const Empty: Story = {
  beforeEach: serve([]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("No Site Engineers yet"),
    ).toBeVisible();
    await expect(
      canvas.getAllByRole("link", { name: "Add Site Engineer" }),
    ).toHaveLength(2);
    await expect(
      canvas.queryByLabelText("Search Site Engineers"),
    ).not.toBeInTheDocument();
  },
};
