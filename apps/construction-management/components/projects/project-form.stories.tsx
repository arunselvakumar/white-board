import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import { expect, fn, mocked, waitFor, within } from "storybook/test";

import {
  mockApi,
  StoryQueries,
  type ApiCall,
} from "../../.storybook/mocks/api";
import {
  DocumentAttachments,
  useUploadHeldFiles,
  type DocumentAttachmentsProps,
  type HeldFile,
  type HeldUploadStatus,
} from "./documents/document-attachments";
import {
  ANUGRAHA,
  KUMARI,
  project,
  projectList,
  STORY_LOGO_URL,
  STORY_PROJECTS,
} from "./project-fixtures";
import { clearProjectFlash, peekProjectFlash } from "./project-flash";
import { NewProjectScreen } from "./project-form";
import { ProjectEditScreen } from "./project-overview";

const BASE = "/api/construction/projects/projects";
const LABELS = `${BASE}/custom-field-labels`;

let calls: ApiCall[] = [];

function posts(): ApiCall[] {
  return calls.filter((call) => call.method === "POST");
}

/**
 * `financial`: the viewer's Project menu Financial flag, which the form
 * reads from the Projects list.
 */
function api(
  handler: (call: ApiCall) => Response | undefined,
  { financial = true }: { financial?: boolean } = {},
) {
  calls = [];
  const mocked = mockApi((call) => {
    calls.push(call);
    if (call.method === "GET" && call.path === LABELS)
      return Response.json({
        items: ["Site engineer", "Architect", "Structural consultant"],
      });
    if (call.method === "GET" && call.path === BASE)
      return Response.json(projectList(STORY_PROJECTS, financial));
    return handler(call);
  });
  return mocked.restore;
}

/** Picks a Project Type; options portal to the document body. */
async function chooseType(
  canvas: { findByLabelText: (text: string) => Promise<HTMLElement> },
  body: {
    findByRole: (
      role: "option",
      options: { name: string },
    ) => Promise<HTMLElement>;
  },
  userEvent: { click: (element: Element) => Promise<void> },
  label = "Residential",
) {
  await userEvent.click(await canvas.findByLabelText("Project Type"));
  await userEvent.click(await body.findByRole("option", { name: label }));
}

/** A real 1×1 PNG, so the preview loads. */
function logoFile(name = "logo.png"): File {
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    ),
    (char) => char.charCodeAt(0),
  );
  return new File([bytes], name, { type: "image/png" });
}

/** Every contract field blank, as Add Project sends it. */
const NO_CONTRACT = {
  useLogoInReports: false,
  clientName: null,
  clientPhone: null,
  tenderRef: null,
  quotationNo: null,
  quotationDate: null,
  loaNo: null,
  loaDate: null,
  clientOrderNo: null,
  clientOrderDate: null,
  agreementNo: null,
  agreementDate: null,
  customFields: [],
};

function created(call: ApiCall): Response | undefined {
  return call.method === "POST" && call.path === BASE
    ? Response.json({ ...ANUGRAHA, ...(call.body as object) }, { status: 201 })
    : undefined;
}

/** An optional card's header button; its name also carries the summary. */
function cardButton(
  canvas: {
    getByRole: (role: "button", options: { name: RegExp }) => HTMLElement;
  },
  title: string,
): HTMLElement {
  return canvas.getByRole("button", { name: new RegExp(`^${title}`) });
}

const meta = {
  title: "Projects/ProjectForm",
  component: NewProjectScreen,
  render: () => (
    <StoryQueries>
      <NewProjectScreen />
    </StoryQueries>
  ),
} satisfies Meta<typeof NewProjectScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NewStartsWithOptionalCardsClosed: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole("heading", { name: "New Project" }),
    ).toBeVisible();
    for (const title of ["Client", "Contract", "Additional details"]) {
      const button = cardButton(canvas, title);
      await expect(button).toHaveAttribute("aria-expanded", "false");
      await expect(button).toHaveTextContent("Optional");
    }
    await expect(canvas.queryByLabelText("Client name")).toBeNull();
    await expect(canvas.queryByLabelText("Order value")).toBeNull();
  },
};

export const NewValidatesAndSaves: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Project" }),
    );
    await expect(
      await canvas.findByText("Enter the Project name"),
    ).toBeVisible();
    await expect(canvas.getByText("Choose the Project Type")).toBeVisible();
    await expect(posts()).toHaveLength(0);
    await chooseType(canvas, body, userEvent, "Commercial");

    await userEvent.type(
      canvas.getByLabelText("Project name"),
      "Anugraha Residency",
    );
    await userEvent.type(canvas.getByLabelText("Start date"), "2026-10-08");
    await userEvent.type(
      canvas.getByLabelText("Expected completion"),
      "2026-10-01",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText("The end date cannot be before the start date"),
    ).toBeVisible();
    await expect(posts()).toHaveLength(0);

    await userEvent.clear(canvas.getByLabelText("Expected completion"));
    await userEvent.type(
      canvas.getByLabelText("Expected completion"),
      "2027-03-31",
    );
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(
      await body.findByRole("option", { name: "Not started" }),
    );
    await userEvent.type(
      canvas.getByLabelText("Project address"),
      "Saravanampatti, Coimbatore",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${ANUGRAHA.id}`,
      ),
    );
    await expect(posts()[0]?.body).toEqual({
      name: "Anugraha Residency",
      status: "not_started",
      projectType: "commercial",
      address: "Saravanampatti, Coimbatore",
      startDate: "2026-10-08",
      endDate: "2027-03-31",
      ...NO_CONTRACT,
    });
  },
};

export const NewWithClientAndContract: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );

    await userEvent.click(cardButton(canvas, "Client"));
    await userEvent.type(
      canvas.getByLabelText("Client name"),
      "Sri Balaji Developers",
    );
    await userEvent.type(canvas.getByLabelText("Client mobile"), "98431 22110");

    await userEvent.click(cardButton(canvas, "Contract"));
    await expect(cardButton(canvas, "Contract")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Quotation and PO / WO are always there; the rest wait to be asked for.
    await expect(canvas.getByLabelText("Quotation number")).toBeVisible();
    await expect(canvas.getByLabelText("PO / WO date")).toBeVisible();
    await expect(canvas.queryByLabelText("LOA number")).toBeNull();
    await expect(canvas.queryByLabelText("Tender / RFQ ref.")).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Add LOA" }));
    const loa = await canvas.findByLabelText("LOA number");
    await waitFor(() => expect(loa).toHaveFocus());
    await expect(canvas.queryByRole("button", { name: "Add LOA" })).toBeNull();
    await expect(
      canvas.getByRole("button", { name: "Add Agreement" }),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Order value"), "1,84,50,000");
    await userEvent.type(
      canvas.getByLabelText("Quotation number"),
      "SBD/Q/2026/114",
    );
    await userEvent.type(canvas.getByLabelText("Quotation date"), "2026-02-12");
    await userEvent.type(loa, "SBD/LOA/2026/022");
    await userEvent.type(
      canvas.getByLabelText("PO / WO number"),
      "WO/2026/031",
    );
    await userEvent.type(canvas.getByLabelText("PO / WO date"), "2026-03-02");

    // Folded, a card sums itself up on one line.
    await userEvent.click(cardButton(canvas, "Contract"));
    await expect(cardButton(canvas, "Contract")).toHaveTextContent(
      "₹1,84,50,000 excl. GST · Quotation SBD/Q/2026/114 · LOA SBD/LOA/2026/022 · PO / WO WO/2026/031",
    );
    await userEvent.click(cardButton(canvas, "Client"));
    await expect(cardButton(canvas, "Client")).toHaveTextContent(
      "Sri Balaji Developers · +91 98431 22110",
    );

    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalled());
    await expect(posts()[0]?.body).toEqual({
      name: "Anugraha Residency",
      status: "ongoing",
      projectType: "residential",
      address: null,
      startDate: null,
      endDate: null,
      ...NO_CONTRACT,
      clientName: "Sri Balaji Developers",
      clientPhone: "+919843122110",
      orderValue: 1845000000,
      quotationNo: "SBD/Q/2026/114",
      quotationDate: "2026-02-12",
      loaNo: "SBD/LOA/2026/022",
      clientOrderNo: "WO/2026/031",
      clientOrderDate: "2026-03-02",
    });
  },
};

export const NewOrderValueKeepsPaise: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.click(cardButton(canvas, "Contract"));
    const value = canvas.getByLabelText("Order value");
    await userEvent.type(value, "18450000.5");
    await userEvent.tab();
    await expect(value).toHaveValue("1,84,50,000.50");
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await expect(posts()[0]?.body).toMatchObject({ orderValue: 1845000050 });
  },
};

export const NewErrorOpensItsCard: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.click(cardButton(canvas, "Client"));
    await userEvent.type(canvas.getByLabelText("Client mobile"), "12345");
    await userEvent.click(cardButton(canvas, "Client"));
    await expect(canvas.queryByLabelText("Client mobile")).toBeNull();

    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText(
        "Enter a 10-digit mobile number, like 98431 22110",
      ),
    ).toBeVisible();
    await expect(cardButton(canvas, "Client")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Client mobile")).toHaveFocus(),
    );
    await expect(posts()).toHaveLength(0);
  },
};

export const NewShowsNameInUse: Story = {
  beforeEach: () =>
    api((call) =>
      call.method === "POST"
        ? Response.json(
            {
              code: "PROJECT_NAME_IN_USE",
              message: "A Project with this name already exists.",
            },
            { status: 409 },
          )
        : undefined,
    ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText("A Project with this name already exists."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Project name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(posts()[0]?.body).toEqual({
      name: "Anugraha Residency",
      status: "ongoing",
      projectType: "residential",
      address: null,
      startDate: null,
      endDate: null,
      ...NO_CONTRACT,
    });
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const NewShowsPlanLimit: Story = {
  beforeEach: () =>
    api((call) =>
      call.method === "POST"
        ? Response.json(
            {
              code: "PLAN_LIMIT_EXCEEDED",
              message:
                "Your plan allows 10 Projects. Buy an add-on to add more.",
              details: { grant: "project", limit: 10, used: 10 },
            },
            { status: 402 },
          )
        : undefined,
    ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Project 11",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText(
        "Your plan allows 10 Projects. Buy an add-on to add more.",
      ),
    ).toBeVisible();
  },
};

/**
 * Stands in for the attachments UI: one button per paper that holds a
 * file. The real component belongs to the documents work; this story only
 * checks what the form does with held files.
 */
function FakeAttachments({
  kind,
  label,
  held,
  onHeldChange,
}: DocumentAttachmentsProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        onHeldChange([
          ...held,
          {
            id: `${kind}-${String(held.length + 1)}`,
            kind,
            file: new File(["%PDF-1.7"], `${kind}.pdf`, {
              type: "application/pdf",
            }),
          },
        ]);
      }}
    >
      Attach to {label}
    </Button>
  );
}

let releaseUploads: () => void = () => undefined;
const uploadSpy = fn<(projectId: string, held: readonly HeldFile[]) => void>();

/** Uploads wait for the story to release them, then the second one fails. */
function useFakeUploads() {
  const [status, setStatus] = useState<HeldUploadStatus>(null);
  return {
    status,
    upload: async (projectId: string, held: readonly HeldFile[]) => {
      uploadSpy(projectId, held);
      setStatus({ done: 0, total: held.length });
      await new Promise<void>((resolve) => {
        releaseUploads = resolve;
      });
      setStatus({ done: held.length, total: held.length });
      return { failed: held.slice(1) };
    },
  };
}

export const NewUploadsHeldFilesAfterCreate: Story = {
  beforeEach: () => {
    const restore = api(created);
    uploadSpy.mockClear();
    clearProjectFlash(ANUGRAHA.id);
    mocked(DocumentAttachments).mockImplementation(FakeAttachments);
    mocked(useUploadHeldFiles).mockImplementation(useFakeUploads);
    return () => {
      restore();
      mocked(DocumentAttachments).mockReset();
      mocked(useUploadHeldFiles).mockReset();
    };
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.click(cardButton(canvas, "Contract"));
    await userEvent.click(
      canvas.getByRole("button", { name: "Attach to Quotation" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Attach to PO / WO" }),
    );
    await userEvent.click(cardButton(canvas, "Contract"));
    await expect(cardButton(canvas, "Contract")).toHaveTextContent("2 files");

    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByRole("button", { name: "Uploading files 1 of 2…" }),
    ).toBeDisabled();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await expect(uploadSpy).toHaveBeenCalledWith(ANUGRAHA.id, [
      expect.objectContaining({ kind: "quotation" }),
      expect.objectContaining({ kind: "client_order" }),
    ]);

    releaseUploads();
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${ANUGRAHA.id}`,
      ),
    );
    await expect(peekProjectFlash(ANUGRAHA.id)).toBe(
      "1 file couldn't upload. Add it again from Documents.",
    );
  },
};

const editRender = (id: string) =>
  function EditStory() {
    return (
      <StoryQueries>
        <ProjectEditScreen id={id} />
      </StoryQueries>
    );
  };

function editApi(
  subject: typeof KUMARI,
  options: { financial?: boolean } = {},
) {
  return api((call) => {
    if (call.method === "GET" && call.path === `${BASE}/${subject.id}`)
      return Response.json(subject);
    if (call.method === "POST" && call.path === `${BASE}/${subject.id}/update`)
      return Response.json({
        ...subject,
        ...(call.body as object),
        updatedAt: "2026-10-08T07:00:00.000Z",
      });
    return undefined;
  }, options);
}

export const EditOpensFilledCards: Story = {
  render: editRender(KUMARI.id),
  beforeEach: () => editApi(KUMARI),
  play: async ({ canvas }) => {
    await canvas.findByLabelText("Project name");
    for (const title of ["Client", "Contract", "Additional details"])
      await expect(cardButton(canvas, title)).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    await expect(canvas.getByLabelText("Client mobile")).toHaveValue(
      "98431 22110",
    );
    await expect(canvas.getByLabelText("Order value")).toHaveValue(
      "4,85,00,000",
    );
    // Every paper with a value is on screen, so no chips are left.
    await expect(canvas.getByLabelText("Tender / RFQ ref.")).toHaveValue(
      "SBD/T/2026/031",
    );
    await expect(canvas.getByLabelText("LOA date")).toHaveValue("2026-03-05");
    await expect(canvas.getByLabelText("Agreement number")).toHaveValue(
      "SBD/AGR/2026/009",
    );
    await expect(canvas.queryByRole("button", { name: /^Add LOA/ })).toBeNull();
    await expect(canvas.getByLabelText("Field name 2")).toHaveValue(
      "Client architect",
    );
  },
};

export const EditKeepsEmptyCardsClosed: Story = {
  render: editRender(ANUGRAHA.id),
  beforeEach: () =>
    editApi(
      project({
        id: ANUGRAHA.id,
        name: "Anugraha Residency",
        clientName: "Sri Balaji Developers",
      }),
    ),
  play: async ({ canvas }) => {
    await canvas.findByLabelText("Project name");
    await expect(cardButton(canvas, "Client")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(cardButton(canvas, "Contract")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(cardButton(canvas, "Additional details")).toHaveTextContent(
      "Optional",
    );
  },
};

export const EditSaves: Story = {
  render: editRender(KUMARI.id),
  beforeEach: () => editApi(KUMARI),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    const name = await canvas.findByLabelText("Project name");
    await expect(name).toHaveValue("Kumari Heights");
    await expect(canvas.getByLabelText("Start date")).toHaveValue("2026-04-01");
    await userEvent.click(canvas.getByLabelText("Status"));
    await userEvent.click(await body.findByRole("option", { name: "On hold" }));
    await userEvent.clear(canvas.getByLabelText("Project address"));
    await userEvent.clear(canvas.getByLabelText("LOA number"));
    await userEvent.clear(canvas.getByLabelText("LOA date"));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${KUMARI.id}`,
      ),
    );
    await expect(posts()[0]?.body).toEqual({
      name: "Kumari Heights",
      status: "on_hold",
      projectType: "residential",
      useLogoInReports: false,
      budgetValue: 4_20_00_000_00,
      address: null,
      startDate: "2026-04-01",
      endDate: "2027-03-31",
      clientName: "Sri Balaji Developers",
      clientPhone: "+919843122110",
      tenderRef: "SBD/T/2026/031",
      quotationNo: "SBD/Q/2026/114",
      quotationDate: "2026-02-10",
      loaNo: null,
      loaDate: null,
      clientOrderNo: "SBD/WO/2026/057",
      clientOrderDate: "2026-03-12",
      agreementNo: "SBD/AGR/2026/009",
      agreementDate: "2026-03-20",
      orderValue: 4_85_00_000_00,
      customFields: KUMARI.customFields,
      expectedUpdatedAt: KUMARI.updatedAt,
    });
  },
};

/**
 * Order value and budget come back null without the Project menu's
 * Financial flag.
 */
const WITHOUT_FINANCIAL = { ...ANUGRAHA, orderValue: null, budgetValue: null };

export const EditWithoutFinancialHidesAmounts: Story = {
  render: editRender(ANUGRAHA.id),
  beforeEach: () => editApi(WITHOUT_FINANCIAL, { financial: false }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Project name");
    await expect(canvas.queryByLabelText("Budget")).toBeNull();
    await expect(canvas.getByLabelText("Order value")).not.toBeVisible();
    await userEvent.clear(canvas.getByLabelText("Quotation date"));
    await userEvent.type(canvas.getByLabelText("Quotation date"), "2026-02-14");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const sent = posts()[0]?.body as Record<string, unknown>;
    await expect(sent).not.toHaveProperty("orderValue");
    await expect(sent).not.toHaveProperty("budgetValue");
    await expect(sent["quotationDate"]).toBe("2026-02-14");
  },
};

export const CustomFieldsAddPickAndRemove: Story = {
  render: editRender(ANUGRAHA.id),
  beforeEach: () =>
    editApi(project({ id: ANUGRAHA.id, name: "Anugraha Residency" })),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByLabelText("Project name");
    await userEvent.click(cardButton(canvas, "Additional details"));
    await expect(
      canvas.getByText(
        "Add anything else you track, like Site engineer or Architect.",
      ),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    const first = canvas.getByLabelText("Field name 1");
    await waitFor(() => expect(first).toHaveFocus());
    await userEvent.type(first, "site");
    await userEvent.click(
      await body.findByRole("option", { name: "Site engineer" }),
    );
    await expect(first).toHaveValue("Site engineer");
    await userEvent.type(canvas.getByLabelText("Value 1"), "Prabhu Saravanan");

    // A name already on the form is not offered again.
    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    await userEvent.type(canvas.getByLabelText("Field name 2"), "e");
    await expect(
      await body.findByRole("option", { name: "Architect" }),
    ).toBeVisible();
    await expect(
      body.queryByRole("option", { name: "Site engineer" }),
    ).toBeNull();
    await userEvent.keyboard("{Escape}");
    await userEvent.clear(canvas.getByLabelText("Field name 2"));
    await userEvent.type(canvas.getByLabelText("Field name 2"), "Floors");
    await userEvent.type(canvas.getByLabelText("Value 2"), "G + 4");

    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    await userEvent.type(canvas.getByLabelText("Field name 3"), "Watchman");
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove field 3" }),
    );
    await expect(canvas.queryByLabelText("Field name 3")).toBeNull();

    await userEvent.click(cardButton(canvas, "Additional details"));
    await expect(cardButton(canvas, "Additional details")).toHaveTextContent(
      "2 fields",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await expect(posts()[0]?.body).toMatchObject({
      customFields: [
        { label: "Site engineer", value: "Prabhu Saravanan" },
        { label: "Floors", value: "G + 4" },
      ],
    });
  },
};

export const CustomFieldDuplicateCaughtOnForm: Story = {
  render: editRender(ANUGRAHA.id),
  beforeEach: () => editApi(ANUGRAHA),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Project name");
    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    await userEvent.type(
      canvas.getByLabelText("Field name 3"),
      "site Engineer",
    );
    await userEvent.type(canvas.getByLabelText("Value 3"), "Karthik");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        '"site Engineer" is already a field on this Project',
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Field name 3")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(posts()).toHaveLength(0);
  },
};

export const CustomFieldServerErrorMarksItsRow: Story = {
  render: editRender(ANUGRAHA.id),
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET") return Response.json(ANUGRAHA);
      // Index 2 counts rows as sent: the blank third row is not sent.
      return Response.json(
        {
          code: "PROJECT_CUSTOM_FIELD_DUPLICATE",
          message:
            '"Structural consultant" is already a field on this Project.',
          details: { index: 2 },
        },
        { status: 400 },
      );
    }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Project name");
    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    await userEvent.click(canvas.getByRole("button", { name: "Add field" }));
    await userEvent.type(
      canvas.getByLabelText("Field name 4"),
      "Structural consultant",
    );
    await userEvent.type(canvas.getByLabelText("Value 4"), "Ramesh & Co.");
    // Fold the card: the error opens it again.
    await userEvent.click(cardButton(canvas, "Additional details"));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await expect(
      await canvas.findByText(
        '"Structural consultant" is already a field on this Project.',
      ),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Field name 4")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(canvas.getByLabelText("Field name 3")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Field name 4")).toHaveFocus(),
    );
    await expect(
      (posts()[0]?.body as { customFields: unknown[] }).customFields,
    ).toHaveLength(3);
  },
};

export const EditShowsSomeoneElsesChange: Story = {
  render: editRender(KUMARI.id),
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET") return Response.json(KUMARI);
      return Response.json(
        {
          code: "PROJECT_CHANGED",
          message:
            "Someone else changed this Project after you opened it. Reload to see their changes.",
        },
        { status: 409 },
      );
    }),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Project name");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(/Someone else changed this Project/),
    ).toBeVisible();
  },
};

export const DeleteRefusedWhileInUse: Story = {
  render: editRender(KUMARI.id),
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET") return Response.json(KUMARI);
      if (call.path.endsWith("/delete"))
        return Response.json(
          {
            code: "PROJECT_IN_USE",
            message:
              "Labours, vendors, attendance, payments, documents, Wings, Locations, drawings or testing reports are recorded on this Project, so it cannot be deleted. Mark it Completed instead.",
          },
          { status: 409 },
        );
      return undefined;
    }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Delete Project" }),
    );
    const dialog = within(await body.findByRole("alertdialog"));
    await userEvent.click(dialog.getByRole("button", { name: "Delete" }));
    await expect(
      await canvas.findByText(/so it cannot be deleted/),
    ).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const NewRequiresProjectType: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await expect(canvas.getByLabelText("Project Type")).toHaveTextContent(
      "Choose a type",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await expect(
      await canvas.findByText("Choose the Project Type"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Project Type")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Project Type")).toHaveFocus(),
    );
    await expect(posts()).toHaveLength(0);

    await chooseType(canvas, body, userEvent, "Infrastructure");
    await expect(canvas.getByLabelText("Project Type")).toHaveTextContent(
      "Infrastructure",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await expect(posts()[0]?.body).toMatchObject({
      projectType: "infrastructure",
    });
  },
};

export const NewWithBudget: Story = {
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    const budget = canvas.getByLabelText("Budget");
    await userEvent.type(budget, "32000000");
    await userEvent.tab();
    await expect(budget).toHaveValue("3,20,00,000");
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await expect(posts()[0]?.body).toMatchObject({
      budgetValue: 3_20_00_000_00,
    });
  },
};

export const NewWithoutFinancialHidesBudget: Story = {
  beforeEach: () => api(created, { financial: false }),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await expect(canvas.queryByLabelText("Budget")).toBeNull();
    await userEvent.click(cardButton(canvas, "Contract"));
    await expect(canvas.getByLabelText("Order value")).not.toBeVisible();
    await expect(canvas.getByLabelText("Quotation number")).toBeVisible();
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const sent = posts()[0]?.body as Record<string, unknown>;
    await expect(sent).not.toHaveProperty("budgetValue");
    await expect(sent).not.toHaveProperty("orderValue");
  },
};

const LOGO_PATH = `${BASE}/${ANUGRAHA.id}/logo`;

export const NewUploadsPickedLogoAfterCreate: Story = {
  beforeEach: () => {
    clearProjectFlash(ANUGRAHA.id);
    return api((call) => {
      if (call.method === "POST" && call.path === LOGO_PATH)
        return Response.json({
          ...ANUGRAHA,
          logoUrl: `${LOGO_PATH}?v=1`,
        });
      return created(call);
    });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await expect(canvas.getByText("AR")).toBeVisible();
    await userEvent.upload(
      canvas.getByLabelText("Choose logo file"),
      logoFile(),
    );
    await expect(
      await canvas.findByRole("img", { name: "Your logo" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Replace logo" }),
    ).toBeVisible();
    // Nothing is sent until the Project is saved.
    await expect(posts()).toHaveLength(0);
    await userEvent.click(
      canvas.getByRole("switch", { name: "Use Project logo on reports" }),
    );

    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/projects/${ANUGRAHA.id}`,
      ),
    );
    await expect(posts().map((call) => call.path)).toEqual([BASE, LOGO_PATH]);
    await expect(posts()[0]?.body).toMatchObject({ useLogoInReports: true });
    await expect(peekProjectFlash(ANUGRAHA.id)).toBeNull();
  },
};

export const NewLogoThatFailsIsReported: Story = {
  beforeEach: () => {
    clearProjectFlash(ANUGRAHA.id);
    return api((call) => {
      if (call.method === "POST" && call.path === LOGO_PATH)
        return Response.json(
          { code: "PLAN_LIMIT_EXCEEDED", message: "No storage left." },
          { status: 402 },
        );
      return created(call);
    });
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Project name"),
      "Anugraha Residency",
    );
    await chooseType(
      canvas,
      within(canvasElement.ownerDocument.body),
      userEvent,
    );
    await userEvent.upload(
      canvas.getByLabelText("Choose logo file"),
      logoFile(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Project" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalled());
    await expect(peekProjectFlash(ANUGRAHA.id)).toBe(
      "The logo couldn't be saved. Try again from Edit Project.",
    );
  },
};

const KUMARI_LOGO = `${BASE}/${KUMARI.id}/logo`;

export const EditRemovesLogoOnSave: Story = {
  render: editRender(KUMARI.id),
  beforeEach: () =>
    api((call) => {
      if (call.method === "GET" && call.path === `${BASE}/${KUMARI.id}`)
        return Response.json({ ...KUMARI, logoUrl: STORY_LOGO_URL });
      if (call.method === "POST" && call.path === `${BASE}/${KUMARI.id}/update`)
        return Response.json({ ...KUMARI, ...(call.body as object) });
      if (call.method === "POST" && call.path === `${KUMARI_LOGO}/remove`)
        return Response.json({ ...KUMARI, logoUrl: null });
      return undefined;
    }),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("img", { name: "Your logo" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Remove logo" }));
    await expect(
      canvas.getByRole("button", { name: "Upload logo" }),
    ).toBeVisible();
    await expect(posts()).toHaveLength(0);
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalled());
    await expect(posts().map((call) => call.path)).toEqual([
      `${BASE}/${KUMARI.id}/update`,
      `${KUMARI_LOGO}/remove`,
    ]);
  },
};

export const EditOfProjectWithoutType: Story = {
  render: editRender(ANUGRAHA.id),
  beforeEach: () =>
    editApi(
      project({
        id: ANUGRAHA.id,
        name: "Anugraha Residency",
        projectType: null,
      }),
    ),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByLabelText("Project name");
    await expect(canvas.getByLabelText("Project Type")).toHaveTextContent(
      "Not set",
    );
    // A Project from before M4 may stay without a type.
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    await expect(posts()[0]?.body).not.toHaveProperty("projectType");
  },
};

export const NewOnAPhone: Story = {
  globals: { viewport: { value: "mobile1" } },
  beforeEach: () => api(created),
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByLabelText("Project Type")).toBeVisible();
    await expect(canvas.getByLabelText("Budget")).toBeVisible();
    await expect(
      canvas.getByRole("switch", { name: "Use Project logo on reports" }),
    ).toBeVisible();
    // Nothing scrolls sideways.
    const page = canvasElement.ownerDocument.documentElement;
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth);
  },
};
