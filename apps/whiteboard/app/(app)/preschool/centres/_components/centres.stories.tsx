import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, waitFor, within } from "storybook/test";

import { CentreDetailScreen } from "@/app/(app)/preschool/centres/[id]/_components/centre-detail-screen";
import { CentreCreateScreen } from "@/app/(app)/preschool/centres/new/_components/centre-create-screen";
import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  CENTRE_IDS,
  mockPreschoolApi,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { PreschoolCentre } from "@/src/queries/preschool/centres";

import { CentreList } from "./centre-list";
import { CentresScreen } from "./centres-screen";

const NOW = "2026-11-25T05:00:00.000Z";

function centre(overrides: Partial<PreschoolCentre> = {}): PreschoolCentre {
  return {
    id: CENTRE_IDS.annaNagar,
    name: "Little Steps Anna Nagar",
    code: "LSAN",
    ownership: "company_owned",
    status: "active",
    phone: "04426201234",
    email: "annanagar@littlesteps.in",
    addressLine: "4th Avenue",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600040",
    franchiseeName: null,
    franchiseePhone: null,
    franchiseeEmail: null,
    agreementStartOn: null,
    agreementEndOn: null,
    royaltyPercent: 0,
    mayOverrideFees: true,
    activeChildren: 86,
    classrooms: 6,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const TAMBARAM = centre({
  id: CENTRE_IDS.tambaram,
  name: "Little Steps Tambaram",
  code: "LSTB",
  ownership: "franchised",
  city: "Chennai",
  franchiseeName: "Priya Raman",
  franchiseePhone: "9840012345",
  agreementStartOn: "2026-06-01",
  agreementEndOn: "2031-05-31",
  royaltyPercent: 12.5,
  activeChildren: 41,
  classrooms: 3,
});

const VELACHERY = centre({
  id: CENTRE_IDS.velachery,
  name: "Little Steps Velachery",
  code: "LSVL",
  ownership: "franchised",
  status: "closed",
  franchiseeName: "Karthik S",
  royaltyPercent: 8,
  activeChildren: 0,
  classrooms: 0,
});

const calls: PreschoolApiCall[] = [];
const onAdd = fn();

const meta = {
  title: "Preschool/Centres",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/centres" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  beforeEach() {
    onAdd.mockClear();
    return mockPreschoolApi();
  },
  render: () => <CentreList centres={[]} onAdd={onAdd} />,
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("No Centres yet")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Add Centre" }));
    await expect(onAdd).toHaveBeenCalledOnce();
  },
};

export const List: Story = {
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        "GET /centres": () => ({
          json: { items: [centre(), TAMBARAM, VELACHERY] },
        }),
      },
    });
  },
  render: () => <CentresScreen />,
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Centres" }),
    ).toBeVisible();
    await expect(canvas.getByText("3 Centres · 2 Franchised")).toBeVisible();
    const tambaram = within(
      canvas.getByRole("link", { name: /Little Steps Tambaram/ }),
    );
    await expect(tambaram.getByText("Franchised")).toBeVisible();
    await expect(tambaram.getByText("12.5%")).toBeVisible();
    await expect(tambaram.getByText("41")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: /Little Steps Tambaram/ }),
    ).toHaveAttribute("href", `/preschool/centres/${CENTRE_IDS.tambaram}`);
    const velachery = within(
      canvas.getByRole("link", { name: /Little Steps Velachery/ }),
    );
    await expect(velachery.getByText("Closed")).toBeVisible();
  },
};

export const AddFranchisedCentre: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/centres/new" } },
  },
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({
      calls,
      routes: {
        "POST /centres": () => ({ status: 201, json: TAMBARAM }),
      },
    });
  },
  render: () => <CentreCreateScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByLabelText("Centre name"),
      "Little Steps Tambaram",
    );
    await userEvent.type(canvas.getByLabelText("Centre code"), "lstb");
    await userEvent.type(canvas.getByLabelText("City"), "Chennai");
    await expect(
      canvas.queryByLabelText("Franchisee name"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByLabelText("Ownership"));
    await userEvent.click(
      await body.findByRole("option", { name: "Franchised" }),
    );
    await userEvent.type(
      await canvas.findByLabelText("Franchisee name"),
      "Priya Raman",
    );
    await userEvent.type(canvas.getByLabelText("Royalty (%)"), "12.5");
    await userEvent.click(canvas.getByRole("button", { name: "Save Centre" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/preschool/centres/${CENTRE_IDS.tambaram}`,
      ),
    );
    await expect(
      calls.find((call) => call.route === "POST /centres")?.body,
    ).toEqual({
      name: "Little Steps Tambaram",
      code: "LSTB",
      phone: null,
      email: null,
      addressLine: null,
      city: "Chennai",
      state: null,
      pincode: null,
      ownership: "franchised",
      franchiseeName: "Priya Raman",
      franchiseePhone: null,
      franchiseeEmail: null,
      agreementStartOn: null,
      agreementEndOn: null,
      royaltyPercent: 12.5,
      mayOverrideFees: true,
    });
  },
};

export const AddCentreValidation: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/centres/new" } },
  },
  beforeEach() {
    calls.length = 0;
    return mockPreschoolApi({ calls });
  },
  render: () => <CentreCreateScreen />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const save = await canvas.findByRole("button", { name: "Save Centre" });
    await userEvent.click(save);
    await expect(
      await canvas.findByText("Centre name is required"),
    ).toBeVisible();
    await expect(
      canvas.getByText("Use 2 to 6 letters or digits"),
    ).toBeVisible();
    await userEvent.click(canvas.getByLabelText("Ownership"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Franchised",
      }),
    );
    await userEvent.type(canvas.getByLabelText("Royalty (%)"), "12.345");
    await userEvent.click(save);
    await expect(
      await canvas.findByText(
        "A Franchised Centre needs the franchisee's name",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter 0 to 100, with at most two decimals"),
    ).toBeVisible();
    await expect(
      calls.filter((call) => call.route === "POST /centres"),
    ).toEqual([]);
  },
};

export const CodeInUse: Story = {
  parameters: {
    nextjs: { navigation: { pathname: "/preschool/centres/new" } },
  },
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        "POST /centres": () => ({
          status: 409,
          json: {
            code: "CENTRE_CODE_IN_USE",
            message: "Another Centre in this Workspace has this code.",
          },
        }),
      },
    });
  },
  render: () => <CentreCreateScreen />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Centre name"),
      "Second Anna Nagar",
    );
    await userEvent.type(canvas.getByLabelText("Centre code"), "LSAN");
    await userEvent.click(canvas.getByRole("button", { name: "Save Centre" }));
    await expect(
      await canvas.findByText(
        "Another Centre in this Workspace has this code.",
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Centre code")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

/** Edit ownership in place: a Franchised Centre becomes Company-owned. */
export const EditOwnership: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: `/preschool/centres/${CENTRE_IDS.tambaram}` },
    },
  },
  beforeEach() {
    calls.length = 0;
    let current = TAMBARAM;
    return mockPreschoolApi({
      calls,
      routes: {
        [`GET /centres/${CENTRE_IDS.tambaram}`]: () => ({ json: current }),
        [`POST /centres/${CENTRE_IDS.tambaram}/franchise`]: () => {
          current = {
            ...TAMBARAM,
            ownership: "company_owned",
            franchiseeName: null,
            franchiseePhone: null,
            agreementStartOn: null,
            agreementEndOn: null,
            royaltyPercent: 0,
          };
          return { json: current };
        },
      },
    });
  },
  render: () => <CentreDetailScreen centreId={CENTRE_IDS.tambaram} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Little Steps Tambaram" }),
    ).toBeVisible();
    await expect(canvas.getByText("Priya Raman")).toBeVisible();
    await expect(canvas.getByText("12.5%")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Edit ownership" }),
    );
    const form = within(
      canvas.getByRole("form", { name: "Edit ownership and royalty" }),
    );
    await expect(form.getByLabelText("Franchisee name")).toHaveValue(
      "Priya Raman",
    );
    await userEvent.click(form.getByLabelText("Ownership"));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", {
        name: "Company-owned",
      }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save ownership" }));
    await waitFor(() =>
      expect(
        canvas.queryByRole("form", { name: "Edit ownership and royalty" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      calls.find((call) => call.route.endsWith("/franchise"))?.body,
    ).toEqual({ ownership: "company_owned", mayOverrideFees: true });
    await expect(canvas.queryByText("Priya Raman")).not.toBeInTheDocument();
  },
};

/** Closing a Centre with active Children says why it cannot. */
export const CloseRefused: Story = {
  parameters: {
    nextjs: {
      navigation: { pathname: `/preschool/centres/${CENTRE_IDS.annaNagar}` },
    },
  },
  beforeEach() {
    return mockPreschoolApi({
      routes: {
        [`GET /centres/${CENTRE_IDS.annaNagar}`]: () => ({ json: centre() }),
        [`POST /centres/${CENTRE_IDS.annaNagar}/close`]: () => ({
          status: 409,
          json: {
            code: "CENTRE_HAS_ACTIVE_CHILDREN",
            message:
              "This Centre still has 86 active Children. Withdraw or transfer them first.",
          },
        }),
      },
    });
  },
  render: () => <CentreDetailScreen centreId={CENTRE_IDS.annaNagar} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Close Centre" }),
    );
    const dialog = await body.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Close Centre" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This Centre still has 86 active Children.",
    );
  },
};
