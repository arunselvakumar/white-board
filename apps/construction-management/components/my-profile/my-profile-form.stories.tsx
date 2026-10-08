import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, waitFor } from "storybook/test";

import { QuerySuspense } from "@/components/query-suspense";
import type { MyProfileModel } from "@/src/queries/my-profile";

import { signInAs } from "../../.storybook/mocks/auth";
import {
  PIXEL_PNG,
  apiError,
  mockApi,
  pngFile,
  sentJson,
  type ApiHandler,
} from "../../.storybook/mocks/profile-api";
import { MyProfileScreen } from "./my-profile-screen";

const BASE = "/api/construction/organization/me";

function myProfile(overrides: Partial<MyProfileModel> = {}): MyProfileModel {
  return {
    id: "0199c3a0-0000-7000-8000-000000000002",
    name: "Suresh Kale",
    designation: {
      id: "0199c3a0-0000-7000-8000-000000000003",
      name: "Site Engineer",
    },
    mobile: "+919812345678",
    email: null,
    address: null,
    emergencyContact: null,
    aadhaarMasked: "XXXXXXXX2346",
    panMasked: "XXXXXX234F",
    memberType: "normal",
    isOwner: false,
    photoUrl: null,
    updatedAt: "2026-10-08T06:30:00.000Z",
    ...overrides,
  };
}

let api: ReturnType<typeof mockApi> | null = null;

function server(start: MyProfileModel, override?: ApiHandler) {
  let current = start;
  api = mockApi(async (call) => {
    const answer = await override?.(call);
    if (answer != null) return answer;
    if (call.method === "GET" && call.path === `${BASE}/profile`)
      return Response.json(current);
    if (call.method === "POST" && call.path === `${BASE}/profile/update`) {
      const body = sentJson(call.init) as Record<string, string | null>;
      current = {
        ...current,
        name: body["name"] ?? current.name,
        email: body["email"] ?? null,
        address: body["address"] ?? null,
        emergencyContact: body["emergencyContact"] ?? null,
        aadhaarMasked:
          body["aadhaar"] == null
            ? current.aadhaarMasked
            : `XXXXXXXX${body["aadhaar"].replace(/\s/g, "").slice(-4)}`,
      };
      return Response.json(current);
    }
    if (
      call.method === "POST" &&
      call.path === `${BASE}/profile/reveal-identifiers`
    )
      return Response.json({ aadhaar: "234123412346", pan: "ABCPE1234F" });
    if (call.method === "POST" && call.path === `${BASE}/photo`) {
      current = { ...current, photoUrl: PIXEL_PNG };
      return Response.json(current);
    }
    if (call.method === "POST" && call.path === `${BASE}/photo/remove`) {
      current = { ...current, photoUrl: null };
      return Response.json(current);
    }
    return undefined;
  });
  return api;
}

const meta = {
  title: "Account/MyProfileForm",
  component: MyProfileScreen,
  parameters: { nextjs: { navigation: { pathname: "/app/profile" } } },
  render: () => (
    <QuerySuspense>
      <MyProfileScreen />
    </QuerySuspense>
  ),
  beforeEach() {
    signInAs("member");
  },
} satisfies Meta<typeof MyProfileScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EditAndSave: Story = {
  beforeEach() {
    return server(myProfile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText("Site Engineer · Patil Builders"),
    ).toBeVisible();
    const mobile = canvas.getByLabelText("Mobile");
    await expect(mobile).toHaveValue("+91 98123 45678");
    await expect(mobile).toBeDisabled();
    await expect(
      canvas.getByText(
        "This is how you sign in, so it cannot be changed here.",
      ),
    ).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("Name"));
    await userEvent.type(canvas.getByLabelText("Email"), "suresh@");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("Enter your name")).toBeVisible();
    await expect(canvas.getByText("Enter a valid email address")).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Name"), "Suresh Kale");
    await userEvent.type(canvas.getByLabelText("Email"), "patil.in");
    await userEvent.type(
      canvas.getByLabelText("Emergency contact"),
      "Meena Kale, 98111 22233",
    );
    await userEvent.type(canvas.getByLabelText("Address"), "Wakad, Pune");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("Your profile is saved."),
    ).toBeVisible();
    const [update] = api?.calls("POST", `${BASE}/profile/update`) ?? [];
    // Aadhaar and PAN are not sent unless changed.
    await expect(sentJson(update?.init)).toEqual({
      name: "Suresh Kale",
      email: "suresh@patil.in",
      address: "Wakad, Pune",
      emergencyContact: "Meena Kale, 98111 22233",
    });
  },
};

export const RevealIdentifiers: Story = {
  beforeEach() {
    return server(myProfile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("XXXXXXXX2346")).toBeVisible();
    await expect(canvas.getByText("XXXXXX234F")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Reveal" }));
    await expect(await canvas.findByText("234123412346")).toBeVisible();
    await expect(canvas.getByText("ABCPE1234F")).toBeVisible();
    await expect(
      api?.calls("POST", `${BASE}/profile/reveal-identifiers`),
    ).toHaveLength(1);
    await userEvent.click(canvas.getByRole("button", { name: "Hide" }));
    await expect(await canvas.findByText("XXXXXXXX2346")).toBeVisible();
  },
};

export const ChangeAadhaar: Story = {
  beforeEach() {
    return server(myProfile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole("button", { name: "Change Aadhaar" }),
    );
    const input = canvas.getByLabelText("New Aadhaar");
    await userEvent.type(input, "2341 2341 2345");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText("Enter a valid 12-digit Aadhaar number"),
    ).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "4991 1866 5246");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(await canvas.findByText("XXXXXXXX5246")).toBeVisible();
    const [update] = api?.calls("POST", `${BASE}/profile/update`) ?? [];
    await expect(sentJson(update?.init)).toMatchObject({
      aadhaar: "4991 1866 5246",
    });
    await expect(
      canvas.queryByLabelText("New Aadhaar"),
    ).not.toBeInTheDocument();
  },
};

export const ServerError: Story = {
  beforeEach() {
    return server(myProfile(), (call) =>
      call.path === `${BASE}/profile/update`
        ? apiError(
            409,
            "MEMBER_EMAIL_IN_USE",
            "Another Team Member in this Company has this email.",
          )
        : undefined,
    ).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(await canvas.findByLabelText("Email"), "a@patil.in");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(
      await canvas.findByText(
        "Another Team Member in this Company has this email.",
      ),
    ).toBeVisible();
  },
};

export const PhotoUploadAndRemove: Story = {
  beforeEach() {
    return server(myProfile()).restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("SK")).toBeVisible();
    await userEvent.upload(
      canvas.getByLabelText("Choose photo file"),
      pngFile("me.png"),
    );
    await expect(
      await canvas.findByRole("img", { name: "Your photo" }),
    ).toBeVisible();
    const [upload] = api?.calls("POST", `${BASE}/photo`) ?? [];
    await expect(new Headers(upload?.init?.headers).get("content-type")).toBe(
      "image/png",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Remove photo" }));
    await expect(
      await canvas.findByRole("button", { name: "Upload photo" }),
    ).toBeVisible();
  },
};

export const PhotoWrongType: Story = {
  beforeEach() {
    return server(myProfile()).restore;
  },
  play: async ({ canvas }) => {
    const input = await canvas.findByLabelText("Choose photo file");
    // The picker's `accept` hides other types; a drop or "All files" can
    // still hand one over.
    await fireEvent.change(input, {
      target: {
        files: [new File(["%PDF-1.7"], "id.pdf", { type: "application/pdf" })],
      },
    });
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Choose a PNG, JPEG or WebP image.",
    );
    await waitFor(() =>
      expect(api?.calls("POST", `${BASE}/photo`)).toHaveLength(0),
    );
  },
};

export const NoIdentityNumbersYet: Story = {
  beforeEach() {
    signInAs("owner");
    return server(
      myProfile({
        name: "Ramesh Patil",
        isOwner: true,
        designation: {
          id: "0199c3a0-0000-7000-8000-000000000004",
          name: "Owner",
        },
        aadhaarMasked: null,
        panMasked: null,
      }),
    ).restore;
  },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Owner · Patil Builders"),
    ).toBeVisible();
    await expect(canvas.getAllByText("Not added")).toHaveLength(2);
    await expect(
      canvas.queryByRole("button", { name: "Reveal" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Add Aadhaar" }),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Add PAN" })).toBeVisible();
  },
};
