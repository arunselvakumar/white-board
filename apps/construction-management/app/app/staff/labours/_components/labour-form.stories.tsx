import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueryClient } from "@/app/app/_components/masters/masters-story-support";

import { mockFetch } from "@/.storybook/mock-fetch";
import {
  CATEGORY_LIST,
  MASON,
  DHURESH,
  MEENA,
  RAVI,
  listOf,
  withoutAmounts,
} from "./labour-fixtures";
import { EditLabourScreen, NewLabourScreen } from "./labour-form";
import { fakeCamera } from "@/app/app/_components/camera/fake-camera";
import { CameraContext } from "@/app/app/_components/camera/use-camera";
import { STILL_JPEG_BASE64 } from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-fixtures";

const LABOURS = "/api/construction/labour/labours";

let api: ReturnType<typeof mockFetch>;

function sent(path: string): unknown {
  const call = api.spy.mock.calls.find(
    ([input, init]) => init?.method === "POST" && input === path,
  );
  const body = call?.[1]?.body;
  return typeof body === "string" ? (JSON.parse(body) as unknown) : undefined;
}

function posts(): number {
  return api.spy.mock.calls.filter(([, init]) => init?.method === "POST")
    .length;
}

const LOOKUPS = [
  {
    path: "/api/construction/masters/labour-categories",
    respond: () => Response.json(CATEGORY_LIST),
  },
  // Reports To searches the active Labours (ADR CM-0035).
  {
    path: LABOURS,
    respond: () => Response.json(listOf([DHURESH, MEENA, RAVI])),
  },
];

type Queries = {
  getByRole: (role: string, options: { name: string }) => HTMLElement;
  findByRole: (role: string, options: { name: string }) => Promise<HTMLElement>;
};
type Click = { click: (element: Element) => Promise<void> };

async function choose(
  canvas: Queries,
  body: Queries,
  userEvent: Click,
  label: string,
  option: string,
) {
  await userEvent.click(canvas.getByRole("combobox", { name: label }));
  await userEvent.click(await body.findByRole("option", { name: option }));
}

const meta = {
  title: "Masters/Labours/Form",
  component: NewLabourScreen,
  render: () => (
    <StoryQueryClient>
      <NewLabourScreen />
    </StoryQueryClient>
  ),
} satisfies Meta<typeof NewLabourScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AddValidatesAndSaves: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () => Response.json(DHURESH, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Add Labour" }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter the Labour's name"),
    ).toBeVisible();
    await expect(canvas.getByText("Enter the wage per day")).toBeVisible();
    await expect(posts()).toBe(0);

    // The wage type decides which wage field shows.
    await expect(canvas.queryByLabelText("Wage per month")).toBeNull();
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Wage type" })).getByRole(
        "button",
        { name: "Monthly wages" },
      ),
    );
    await expect(canvas.getByLabelText("Wage per month")).toBeVisible();
    await expect(canvas.queryByLabelText("Wage per day")).toBeNull();
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Wage type" })).getByRole(
        "button",
        { name: "Daily wages" },
      ),
    );

    await userEvent.type(canvas.getByLabelText("Labour name"), "Dhuresh Nawin");
    await userEvent.type(canvas.getByLabelText("Labour Id"), "L-001");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "700");
    await userEvent.clear(canvas.getByLabelText("Overtime wage per hour"));
    await userEvent.type(
      canvas.getByLabelText("Overtime wage per hour"),
      "100.50",
    );
    await userEvent.type(canvas.getByLabelText("Opening balance"), "-500");
    await userEvent.click(
      within(canvas.getByRole("group", { name: "Weekly holidays" })).getByRole(
        "button",
        { name: "Sat" },
      ),
    );
    await userEvent.type(canvas.getByLabelText("Aadhaar"), "1234");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Enter a valid 12-digit Aadhaar number"),
    ).toBeVisible();
    await userEvent.clear(canvas.getByLabelText("Aadhaar"));

    await choose(canvas, body, userEvent, "Labour Category", "Mason");
    await expect(body.queryByRole("option", { name: "Welder" })).toBeNull();
    // No Site Engineer to pick: they come from the Projects (ADR CM-0041).
    await expect(
      canvas.queryByRole("combobox", { name: "Site Engineer" }),
    ).toBeNull();
    // Nor Projects: a Labour is put on a Project from its Resources.
    await expect(
      canvas.queryByRole("combobox", { name: "Projects" }),
    ).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent(LABOURS)).toBeDefined());
    await expect(sent(LABOURS)).toMatchObject({
      name: "Dhuresh Nawin",
      labourCode: "L-001",
      joiningDate: "2026-09-01",
      wageType: "daily",
      wagePerDay: 70_000,
      wagePerMonth: null,
      overtimeWagePerHour: 10_050,
      openingBalance: -50_000,
      weeklyHolidays: [0, 6],
      workingHoursPerDay: "8",
      labourCategoryId: MASON.id,
      aadhaar: null,
    });
    await expect(sent(LABOURS)).not.toHaveProperty("supervisorId");
    await expect(sent(LABOURS)).not.toHaveProperty("projectIds");
    // No photo was chosen, so none is sent.
    await expect(posts()).toBe(1);
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/staff/labours"),
    );
  },
};

/**
 * Working hours per day (ADR CM-0011): 8 unless changed, more than 0 and at
 * most 24 with two places, sent as typed.
 */
export const WorkingHoursPerDay: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () => Response.json(DHURESH, { status: 201 }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    const hours = await canvas.findByLabelText("Working hours per day");
    await expect(hours).toHaveValue("8");
    await expect(
      canvas.getByText("Time worked beyond this is overtime."),
    ).toBeVisible();

    await userEvent.type(canvas.getByLabelText("Labour name"), "Ravi Kumar");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "700");

    const message = "Enter hours more than 0 and at most 24, like 8 or 8.5";
    for (const wrong of ["0", "24.5", "8.125"]) {
      await userEvent.clear(hours);
      await userEvent.type(hours, wrong);
      await userEvent.click(canvas.getByRole("button", { name: "Save" }));
      await expect(await canvas.findByText(message)).toBeVisible();
      await expect(hours).toHaveAttribute("aria-invalid", "true");
    }
    await expect(posts()).toBe(0);

    await userEvent.clear(hours);
    await userEvent.type(hours, "12");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent(LABOURS)).toBeDefined());
    await expect(sent(LABOURS)).toMatchObject({
      name: "Ravi Kumar",
      workingHoursPerDay: "12",
    });
  },
};

export const ServerErrorOnField: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () =>
          Response.json(
            {
              code: "LABOUR_CODE_TAKEN",
              message: "Another Labour has this Labour Id.",
              details: { field: "labourCode" },
            },
            { status: 409 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      await canvas.findByLabelText("Labour name"),
      "Dhuresh Nawin",
    );
    await userEvent.type(canvas.getByLabelText("Labour Id"), "L-001");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "700");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText("Another Labour has this Labour Id."),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Labour Id")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  },
};

export const EditWithoutFinancial: Story = {
  render: () => (
    <StoryQueryClient>
      <EditLabourScreen id={DHURESH.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    const hidden = { ...withoutAmounts(DHURESH), workingHoursPerDay: "9.5" };
    api = mockFetch([
      ...LOOKUPS,
      {
        path: `${LABOURS}/${DHURESH.id}`,
        respond: () => Response.json(hidden),
      },
      {
        path: `${LABOURS}/${DHURESH.id}/documents`,
        respond: () =>
          Response.json({
            items: [
              {
                id: "0199a1b2-0000-7000-8000-00000000f001",
                fileName: "Aadhaar card.pdf",
                contentType: "application/pdf",
                bytes: 120_000,
                createdAt: DHURESH.createdAt,
                url: `${LABOURS}/${DHURESH.id}/documents/0199a1b2-0000-7000-8000-00000000f001`,
              },
            ],
          }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${DHURESH.id}/update`,
        respond: () => Response.json(hidden),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole("heading", { name: "Edit Dhuresh Nawin" }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Labour name")).toHaveValue(
      "Dhuresh Nawin",
    );
    await expect(canvas.queryByLabelText("Wage per day")).toBeNull();
    await expect(canvas.queryByLabelText("Opening balance")).toBeNull();
    await expect(canvas.getByText(/You cannot see wages/)).toBeVisible();
    // Working hours are not money: shown and kept without Financial.
    await expect(canvas.getByLabelText("Working hours per day")).toHaveValue(
      "9.5",
    );
    await expect(
      canvas.getByText("Leave blank to keep XXXXXXXX2346."),
    ).toBeVisible();
    // Photo & documents come first; Projects are not on this page.
    await expect(
      canvas
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Photo & documents",
      "Basic",
      "Wage",
      "Statutory",
      "Category & contact",
    ]);
    await expect(
      canvas.queryByRole("combobox", { name: "Projects" }),
    ).toBeNull();
    await expect(
      await canvas.findByRole("link", { name: "Aadhaar card.pdf" }),
    ).toBeVisible();

    await userEvent.clear(canvas.getByLabelText("Labour name"));
    await userEvent.type(canvas.getByLabelText("Labour name"), "Dhuresh P.");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent(`${LABOURS}/${DHURESH.id}/update`)).toBeDefined(),
    );
    const update = sent(`${LABOURS}/${DHURESH.id}/update`) as Record<
      string,
      unknown
    >;
    await expect(update).toMatchObject({
      name: "Dhuresh P.",
      workingHoursPerDay: "9.5",
      expectedUpdatedAt: DHURESH.updatedAt,
    });
    // Left out, so their Projects are kept.
    await expect("projectIds" in update).toBe(false);
    await expect("wagePerDay" in update).toBe(false);
    await expect("openingBalance" in update).toBe(false);
    await expect("aadhaar" in update).toBe(false);
  },
};

function jpeg(name: string): File {
  return new File(
    [Uint8Array.from(atob(STILL_JPEG_BASE64), (c) => c.charCodeAt(0))],
    name,
    {
      type: "image/jpeg",
    },
  );
}

/**
 * Add Labour starts with the photo: chosen (or taken) before Save, then
 * uploaded once the Labour is saved.
 */
export const AddWithPhoto: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () => Response.json(DHURESH, { status: 201 }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${DHURESH.id}/photo`,
        respond: () =>
          Response.json({ photoUrl: `${LABOURS}/${DHURESH.id}/photo?v=1` }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      (await canvas.findAllByRole("heading", { level: 2 }))[0],
    ).toHaveTextContent("Photo & documents");
    await expect(
      canvas.getByText(
        "The photo is saved with them. Add documents after you save.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Take photo" }),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Labour name"), "Ravi Kumar");
    // The initials follow the name typed.
    await expect(canvas.getByText("RK")).toBeVisible();
    await userEvent.upload(
      canvas.getByLabelText("Choose photo file"),
      jpeg("ravi.jpg"),
    );
    await expect(
      await canvas.findByRole("button", { name: "Replace photo" }),
    ).toBeVisible();
    await expect(posts()).toBe(0);

    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "650");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(
        api.spy.mock.calls.some(
          ([input, init]) =>
            init?.method === "POST" &&
            input === `${LABOURS}/${DHURESH.id}/photo`,
        ),
      ).toBe(true),
    );
    await expect(sent(LABOURS)).toMatchObject({ name: "Ravi Kumar" });
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/app/staff/labours"),
    );
  },
};

/** The Labour is saved but the photo is not: their page opens, to try again. */
export const AddPhotoFails: Story = {
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        method: "POST",
        path: LABOURS,
        respond: () => Response.json(DHURESH, { status: 201 }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${DHURESH.id}/photo`,
        respond: () =>
          Response.json(
            { code: "STORAGE_UNAVAILABLE", message: "Try again." },
            { status: 503 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.upload(
      await canvas.findByLabelText("Choose photo file"),
      jpeg("ravi.jpg"),
    );
    await userEvent.type(canvas.getByLabelText("Labour name"), "Ravi Kumar");
    await userEvent.type(canvas.getByLabelText("Joining date"), "2026-09-01");
    await userEvent.type(canvas.getByLabelText("Wage per day"), "650");
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith(
        `/app/staff/labours/${DHURESH.id}`,
      ),
    );
    await expect(posts()).toBe(2);
  },
};

/**
 * Edit Labour: Photo & documents first. Take photo opens the camera (a
 * stand-in here); Use photo uploads the frame as a JPEG.
 */
export const EditTakesPhoto: Story = {
  render: () => (
    <CameraContext value={fakeCamera()}>
      <StoryQueryClient>
        <EditLabourScreen id={DHURESH.id} />
      </StoryQueryClient>
    </CameraContext>
  ),
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        path: `${LABOURS}/${DHURESH.id}`,
        respond: () => Response.json(DHURESH),
      },
      {
        path: `${LABOURS}/${DHURESH.id}/documents`,
        respond: () => Response.json({ items: [] }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${DHURESH.id}/photo`,
        respond: () =>
          Response.json({ photoUrl: `${LABOURS}/${DHURESH.id}/photo?v=1` }),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Edit Dhuresh Nawin" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Take photo" }));
    const dialog = within(
      await body.findByRole("dialog", { name: "Take photo" }),
    );
    await expect(dialog.getByLabelText("Camera")).toBeInTheDocument();
    await userEvent.click(dialog.getByRole("button", { name: "Take photo" }));
    await expect(await dialog.findByAltText("The frame taken")).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Retake" }));
    await expect(dialog.queryByAltText("The frame taken")).toBeNull();
    await userEvent.click(dialog.getByRole("button", { name: "Take photo" }));
    await userEvent.click(
      await dialog.findByRole("button", { name: "Use photo" }),
    );
    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "Take photo" })).toBeNull(),
    );
    const upload = api.spy.mock.calls.find(
      ([input, init]) =>
        init?.method === "POST" && input === `${LABOURS}/${DHURESH.id}/photo`,
    );
    await expect(upload?.[1]?.body).toBeInstanceOf(File);
    await expect((upload?.[1]?.body as File).type).toBe("image/jpeg");
  },
};

/**
 * Reports To (ADR CM-0035): the saved Labour shows by name; the picker
 * offers other active Labours, never the one being edited, and can be
 * cleared.
 */
export const EditReportsTo: Story = {
  render: () => (
    <StoryQueryClient>
      <EditLabourScreen id={MEENA.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        path: `${LABOURS}/${MEENA.id}`,
        respond: () => Response.json(MEENA),
      },
      {
        path: `${LABOURS}/${MEENA.id}/documents`,
        respond: () => Response.json({ items: [] }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${MEENA.id}/update`,
        respond: () => Response.json(MEENA),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await canvas.findByRole("heading", { name: "Edit Meena Selvi" }),
    ).toBeVisible();
    const reportsTo = canvas.getByRole("combobox", { name: "Reports To" });
    await expect(reportsTo).toHaveValue("Dhuresh Nawin");

    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Reports To" }),
    );
    await expect(reportsTo).toHaveValue("");
    await userEvent.click(canvas.getByRole("button", { name: "Show Labours" }));
    const list = within(await body.findByRole("listbox", { name: "Labours" }));
    await expect(
      await list.findByRole("option", { name: /Ravi Kumar/ }),
    ).toBeVisible();
    // Meena cannot report to herself.
    await expect(
      list.queryByRole("option", { name: /Meena Selvi/ }),
    ).toBeNull();
    await userEvent.click(list.getByRole("option", { name: /Ravi Kumar/ }));
    await expect(reportsTo).toHaveValue("Ravi Kumar");

    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(sent(`${LABOURS}/${MEENA.id}/update`)).toBeDefined(),
    );
    await expect(sent(`${LABOURS}/${MEENA.id}/update`)).toMatchObject({
      reportsToId: RAVI.id,
    });
  },
};

/** A loop the server refuses shows on Reports To. */
export const ReportsToLoopRefused: Story = {
  render: () => (
    <StoryQueryClient>
      <EditLabourScreen id={MEENA.id} />
    </StoryQueryClient>
  ),
  beforeEach: () => {
    api = mockFetch([
      ...LOOKUPS,
      {
        path: `${LABOURS}/${MEENA.id}`,
        respond: () => Response.json(MEENA),
      },
      {
        path: `${LABOURS}/${MEENA.id}/documents`,
        respond: () => Response.json({ items: [] }),
      },
      {
        method: "POST",
        path: `${LABOURS}/${MEENA.id}/update`,
        respond: () =>
          Response.json(
            {
              code: "REPORTS_TO_LOOP",
              message:
                "Dhuresh Nawin reports to this Labour, so this Labour cannot report to them.",
            },
            { status: 400 },
          ),
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByRole("heading", { name: "Edit Meena Selvi" });
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(
      await canvas.findByText(
        "Dhuresh Nawin reports to this Labour, so this Labour cannot report to them.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("combobox", { name: "Reports To" }),
    ).toHaveAttribute("aria-invalid", "true");
  },
};

const BAR_BENDER = {
  id: "0199a1b2-0000-7000-8000-00000000c009",
  name: "Bar Bender",
  skill: "skilled",
  isSeed: false,
  disabled: false,
  createdAt: "2026-11-03T06:30:00.000Z",
  updatedAt: "2026-11-03T06:30:00.000Z",
};

/**
 * Add under Labour Category opens a slide-over from the right. Saving adds
 * the category, reloads the choices and picks it, without saving the
 * Labour.
 */
export const AddCategoryFromForm: Story = {
  beforeEach: () => {
    let added = false;
    api = mockFetch([
      ...LOOKUPS.filter(
        (route) => route.path !== "/api/construction/masters/labour-categories",
      ),
      {
        path: "/api/construction/masters/labour-categories",
        respond: () =>
          Response.json(
            added
              ? {
                  items: [BAR_BENDER, ...CATEGORY_LIST.items],
                  total: CATEGORY_LIST.total + 1,
                }
              : CATEGORY_LIST,
          ),
      },
      {
        method: "POST",
        path: "/api/construction/masters/labour-categories",
        respond: () => {
          added = true;
          return Response.json(BAR_BENDER, { status: 201 });
        },
      },
    ]);
    return api.restore;
  },
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("heading", { name: "Add Labour" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Add Labour Category" }),
    );
    const sheet = within(
      await body.findByRole("dialog", { name: "Add Labour Category" }),
    );
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));
    await expect(
      await sheet.findByText("Enter the Labour Category name"),
    ).toBeVisible();
    await userEvent.type(
      sheet.getByLabelText("Labour Category name"),
      "Bar Bender",
    );
    await userEvent.click(sheet.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        body.queryByRole("dialog", { name: "Add Labour Category" }),
      ).toBeNull(),
    );
    await expect(sent("/api/construction/masters/labour-categories")).toEqual({
      name: "Bar Bender",
      skill: "skilled",
    });
    // The Labour is not saved; the new category is chosen.
    await expect(sent(LABOURS)).toBeUndefined();
    await expect(
      canvas.getByRole("combobox", { name: "Labour Category" }),
    ).toHaveTextContent("Bar Bender");
  },
};
