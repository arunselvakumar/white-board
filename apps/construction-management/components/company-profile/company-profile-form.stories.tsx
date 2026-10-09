import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";
import type { CompanyProfileModel } from "@/src/queries/company-profile";

import { signInAs } from "../../.storybook/mocks/auth";
import {
  PIXEL_PNG,
  apiError,
  mockApi,
  pngFile,
  sentJson,
  type ApiHandler,
} from "../../.storybook/mocks/profile-api";
import { CompanyProfileScreen } from "./company-profile-screen";

const BASE = "/api/construction/organization/company-profile";

function profile(
  overrides: Partial<CompanyProfileModel> = {},
): CompanyProfileModel {
  return {
    id: "0199c3a0-0000-7000-8000-000000000001",
    name: "Anugraha Engineers",
    mobile: "+917708165767",
    email: "office@anugrahaengineers.in",
    country: "IN",
    gstin: null,
    pan: null,
    address: "Plot 4, Vadasery, Nagercoil",
    currency: "INR",
    isIndian: true,
    timezone: "Asia/Kolkata",
    logoUrl: null,
    canUpdate: true,
    createdAt: "2026-10-08T06:30:00.000Z",
    updatedAt: "2026-10-08T06:30:00.000Z",
    ...overrides,
  };
}

let api: ReturnType<typeof mockApi> | null = null;

/** A tiny server holding one profile; `override` answers first. */
function server(start: CompanyProfileModel, override?: ApiHandler) {
  let current = start;
  api = mockApi(async (call) => {
    const answer = await override?.(call);
    if (answer != null) return answer;
    if (call.method === "GET" && call.path === BASE)
      return Response.json(current);
    if (call.method === "POST" && call.path === `${BASE}/update`) {
      const body = sentJson(call.init) as Partial<CompanyProfileModel>;
      current = {
        ...current,
        ...body,
        updatedAt: "2026-10-08T07:00:00.000Z",
      };
      return Response.json(current);
    }
    if (call.method === "POST" && call.path === `${BASE}/logo`) {
      current = { ...current, logoUrl: PIXEL_PNG };
      return Response.json(current);
    }
    if (call.method === "POST" && call.path === `${BASE}/logo/remove`) {
      current = { ...current, logoUrl: null };
      return Response.json(current);
    }
    return undefined;
  });
  return api;
}

const meta = {
  title: "Masters/CompanyProfileForm",
  component: CompanyProfileScreen,
  parameters: {
    nextjs: { navigation: { pathname: "/app/masters/company" } },
  },
  render: () => (
    <QuerySuspense>
      <CompanyProfileScreen />
    </QuerySuspense>
  ),
  beforeEach() {
    signInAs("owner");
  },
} satisfies Meta<typeof CompanyProfileScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditAndSave: Story = {
  beforeEach() {
    return server(profile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Company name");
    await expect(name).toHaveValue("Anugraha Engineers");
    await expect(canvas.getByLabelText("Company mobile")).toHaveValue(
      "7708165767",
    );
    await expect(canvas.getByLabelText("Country")).toHaveValue("India");
    await expect(canvas.getByLabelText("Country")).toBeDisabled();

    await userEvent.clear(name);
    await userEvent.type(name, "Anugraha Infra");
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await userEvent.type(canvas.getByLabelText("Company PAN"), "aapfa0939f");
    await userEvent.click(canvas.getByLabelText("Time zone"));
    await userEvent.click(
      await within(document.body).findByRole("option", { name: "Asia/Dubai" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));

    await expect(
      await canvas.findByText("Company profile saved."),
    ).toBeVisible();
    const [update] = api?.calls("POST", `${BASE}/update`) ?? [];
    await expect(sentJson(update?.init)).toEqual({
      name: "Anugraha Infra",
      mobile: "+917708165767",
      email: "office@anugrahaengineers.in",
      gstin: "33AAPFA0939F1ZM",
      pan: "AAPFA0939F",
      address: "Plot 4, Vadasery, Nagercoil",
      currency: "INR",
      timezone: "Asia/Dubai",
      expectedUpdatedAt: "2026-10-08T06:30:00.000Z",
    });
  },
};

export const ValidationMessages: Story = {
  beforeEach() {
    return server(profile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    const name = await canvas.findByLabelText("Company name");
    await userEvent.clear(name);
    // The check character of 33AAPFA0939F1ZM is V, not W.
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZW");
    await userEvent.type(canvas.getByLabelText("Company PAN"), "AAPF0939F");
    await userEvent.clear(canvas.getByLabelText("Company email"));
    await userEvent.type(canvas.getByLabelText("Company email"), "office@");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));

    await expect(
      await canvas.findByText("Enter the Company name"),
    ).toBeVisible();
    await expect(
      canvas.getByText(/last character does not match its checksum/),
    ).toBeVisible();
    await expect(
      canvas.getByText("Enter a valid 10-character PAN, like AAPFA0939F"),
    ).toBeVisible();
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("GSTIN"));
    await userEvent.type(canvas.getByLabelText("GSTIN"), "33AAPFA0939F1ZM");
    await userEvent.clear(canvas.getByLabelText("Company PAN"));
    await userEvent.type(canvas.getByLabelText("Company PAN"), "ABCPE1234F");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("The GSTIN must contain the Company PAN"),
    ).toBeVisible();
  },
};

export const ServerErrors: Story = {
  beforeEach() {
    let saves = 0;
    return server(profile(), (call) => {
      if (call.path !== `${BASE}/update`) return undefined;
      saves += 1;
      return saves === 1
        ? apiError(400, "GSTIN_INVALID", "Enter a valid 15-character GSTIN.")
        : apiError(
            409,
            "COMPANY_PROFILE_CHANGED",
            "Someone else changed the Company profile. Reload to see their changes.",
          );
    }).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Save changes" }),
    );
    await expect(
      await canvas.findByText("Enter a valid 15-character GSTIN."),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Someone else changed the Company profile",
    );
  },
};

export const LogoUploadReplaceRemove: Story = {
  beforeEach() {
    return server(profile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("button", { name: "Upload logo" }),
    ).toBeVisible();
    await expect(canvas.getByText("AE")).toBeVisible();
    await userEvent.upload(
      canvas.getByLabelText("Choose logo file"),
      pngFile("logo.png"),
    );
    await expect(
      await canvas.findByRole("img", { name: "Your logo" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Replace logo" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Remove logo" }));
    await expect(
      await canvas.findByRole("button", { name: "Upload logo" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("img", { name: "Your logo" }),
    ).not.toBeInTheDocument();
  },
};

export const LogoRejected: Story = {
  beforeEach() {
    return server(profile(), (call) =>
      call.path === `${BASE}/logo`
        ? apiError(
            400,
            "FILE_TYPE_NOT_ALLOWED",
            "Choose a PNG, JPEG or WebP image.",
          )
        : undefined,
    ).restore;
  },
  play: async ({ canvas, userEvent }) => {
    const input = await canvas.findByLabelText("Choose logo file");
    // Too large for a logo: refused before it is sent.
    await userEvent.upload(input, pngFile("big.png", 2 * 1024 * 1024 + 1));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The file must be at most 2 MB.",
    );
    // The server sniffs the content and refuses it.
    await userEvent.upload(input, pngFile("renamed.png"));
    await waitFor(() =>
      expect(canvas.getByRole("alert")).toHaveTextContent(
        "Choose a PNG, JPEG or WebP image.",
      ),
    );
  },
};

export const ReadOnlyWithoutSettingsUpdate: Story = {
  beforeEach() {
    signInAs("member");
    return server(
      profile({
        canUpdate: false,
        gstin: "33AAPFA0939F1ZM",
        pan: "AAPFA0939F",
        logoUrl: PIXEL_PNG,
      }),
    ).restore;
  },
  play: async ({ canvas }) => {
    // The Company's own GSTIN and PAN are shown in full.
    await expect(await canvas.findByLabelText("GSTIN")).toHaveValue(
      "33AAPFA0939F1ZM",
    );
    await expect(canvas.getByLabelText("Company PAN")).toHaveValue(
      "AAPFA0939F",
    );
    await expect(canvas.getByLabelText("Company name")).toBeDisabled();
    await expect(
      canvas.queryByRole("button", { name: "Save changes" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Replace logo" }),
    ).toBeDisabled();
    await expect(
      canvas.getByText(/Only the Owner, or a Team Member allowed/),
    ).toBeVisible();
  },
};

export const OutsideIndia: Story = {
  beforeEach() {
    return server(
      profile({
        country: "AE",
        isIndian: false,
        currency: "AED",
        timezone: "Asia/Dubai",
        mobile: "+971501234567",
      }),
    ).restore;
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByLabelText("Country")).toHaveValue(
      "United Arab Emirates",
    );
    await expect(canvas.queryByLabelText("GSTIN")).not.toBeInTheDocument();
    await expect(canvas.getByLabelText("Company mobile")).toHaveValue(
      "+971501234567",
    );
    await expect(canvas.getByLabelText("Currency")).toHaveTextContent("AED");
  },
};

export const NoAccess: Story = {
  beforeEach() {
    signInAs("member");
    return mockApi((call) =>
      call.path === BASE
        ? apiError(
            403,
            "PERMISSION_DENIED",
            "You do not have permission to do this.",
          )
        : undefined,
    ).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("You cannot see the Company profile"),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText("Company name"),
    ).not.toBeInTheDocument();
  },
};
