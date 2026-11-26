import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { ActiveCentreProvider } from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  mockPreschoolApi,
  type PreschoolApiCall,
} from "@/app/(app)/preschool/_components/preschool-story-api";
import type { PreschoolAcademicYear } from "@/src/queries/preschool/academic-years";
import type { PreschoolProgramme } from "@/src/queries/preschool/programmes";

import { ProgrammesScreen } from "./programmes-screen";

const id = (n: number) =>
  `7a0e8400-e29b-41d4-a716-4466554400${String(n).padStart(2, "0")}`;

const PROGRAMMES: PreschoolProgramme[] = [
  {
    id: id(1),
    name: "Playgroup",
    minAgeMonths: 18,
    maxAgeMonths: 35,
    isDaycare: false,
    sortOrder: 0,
    isArchived: false,
  },
  {
    id: id(2),
    name: "Nursery (Pre-KG)",
    minAgeMonths: 36,
    maxAgeMonths: 47,
    isDaycare: false,
    sortOrder: 1,
    isArchived: false,
  },
  {
    id: id(3),
    name: "LKG",
    minAgeMonths: 48,
    maxAgeMonths: 59,
    isDaycare: false,
    sortOrder: 2,
    isArchived: false,
  },
  {
    id: id(4),
    name: "Daycare",
    minAgeMonths: null,
    maxAgeMonths: null,
    isDaycare: true,
    sortOrder: 3,
    isArchived: false,
  },
  {
    id: id(5),
    name: "Summer Camp",
    minAgeMonths: 36,
    maxAgeMonths: null,
    isDaycare: false,
    sortOrder: 4,
    isArchived: true,
  },
];

const YEARS: PreschoolAcademicYear[] = [
  {
    id: id(20),
    name: "2026–27",
    startsOn: "2026-04-01",
    endsOn: "2027-03-31",
    isCurrent: true,
  },
  {
    id: id(21),
    name: "2025–26",
    startsOn: "2025-04-01",
    endsOn: "2026-03-31",
    isCurrent: false,
  },
];

const calls: PreschoolApiCall[] = [];

/** A stateful Programmes and Academic Years API for one story. */
function api(
  initial: {
    programmes?: PreschoolProgramme[];
    years?: PreschoolAcademicYear[];
  } = {},
) {
  calls.length = 0;
  let programmes = [...(initial.programmes ?? PROGRAMMES)];
  let years = [...(initial.years ?? YEARS)];
  return mockPreschoolApi({
    calls,
    routes: {
      "GET /programmes": () => ({ json: { items: programmes } }),
      "GET /academic-years": () => ({ json: { items: years } }),
      "POST /programmes": (body) => {
        const created = {
          ...(body as PreschoolProgramme),
          id: id(9),
          sortOrder: programmes.length,
          isArchived: false,
        };
        programmes = [...programmes, created];
        return { status: 201, json: created };
      },
      "POST /programmes/reorder": (body) => {
        const ids = (body as { programmeIds: string[] }).programmeIds;
        programmes = [
          ...ids.flatMap((each) => programmes.filter((p) => p.id === each)),
          ...programmes.filter((p) => p.isArchived),
        ];
        return { json: { items: programmes } };
      },
      [`POST /programmes/${id(3)}/archive`]: () => ({
        status: 409,
        json: {
          code: "PROGRAMME_HAS_CLASSROOMS",
          message:
            "LKG has 2 Classrooms this Academic Year. Archive them first.",
        },
      }),
      [`POST /programmes/${id(5)}/restore`]: () => {
        programmes = programmes.map((p) =>
          p.id === id(5) ? { ...p, isArchived: false } : p,
        );
        return { json: programmes.find((p) => p.id === id(5)) };
      },
      "POST /academic-years": () => {
        const created = {
          id: id(22),
          name: "2027–28",
          startsOn: "2027-04-01",
          endsOn: "2028-03-31",
          isCurrent: false,
        };
        years = [created, ...years];
        return { status: 201, json: created };
      },
      [`POST /academic-years/${id(21)}/make-current`]: () => {
        years = years.map((y) => ({ ...y, isCurrent: y.id === id(21) }));
        return { json: years.find((y) => y.id === id(21)) };
      },
    },
  });
}

const meta = {
  title: "Preschool/Programmes",
  parameters: {
    layout: "fullscreen",
    nextjs: { navigation: { pathname: "/preschool/programmes" } },
  },
  decorators: [
    (Story) => (
      <ActiveCentreProvider>
        <Story />
      </ActiveCentreProvider>
    ),
  ],
  render: () => <ProgrammesScreen />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, userEvent }) => {
    const programmes = within(
      await canvas.findByRole("region", { name: "Programmes" }),
    );
    await expect(programmes.getByText("1 y 6 m – 2 y 11 m")).toBeVisible();
    await expect(programmes.getByText("3 y – 3 y 11 m")).toBeVisible();
    await expect(programmes.getByText("No age limit")).toBeVisible();
    await expect(programmes.getAllByText("Daycare")).toHaveLength(2);
    await expect(programmes.queryByText("Summer Camp")).not.toBeInTheDocument();
    await userEvent.click(
      programmes.getByRole("switch", { name: "Show archived (1)" }),
    );
    await expect(programmes.getByText("Summer Camp")).toBeVisible();
    await expect(programmes.getByText("Archived")).toBeVisible();
    await expect(
      programmes.getByRole("button", { name: "Move Playgroup up" }),
    ).toBeDisabled();
    const years = within(
      canvas.getByRole("region", { name: "Academic Years" }),
    );
    await expect(years.getByText("Current")).toBeVisible();
    await expect(years.getByText("1 Apr 2026 – 31 Mar 2027")).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: () => api({ programmes: [] }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("No Programmes yet")).toBeVisible();
  },
};

export const AddProgramme: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add Programme" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Add Programme" }),
    );
    await userEvent.type(form.getByLabelText("Programme name"), "UKG");
    await userEvent.type(form.getByLabelText("Youngest age, years"), "5");
    await userEvent.type(form.getByLabelText("Oldest age, years"), "5");
    await userEvent.type(form.getByLabelText("Oldest age, months"), "11");
    await userEvent.click(form.getByRole("button", { name: "Save Programme" }));
    await waitFor(() =>
      expect(
        body.queryByRole("form", { name: "Add Programme" }),
      ).not.toBeInTheDocument(),
    );
    await expect(
      calls.find((call) => call.route === "POST /programmes")?.body,
    ).toEqual({
      name: "UKG",
      minAgeMonths: 60,
      maxAgeMonths: 71,
      isDaycare: false,
    });
    await expect(await canvas.findByText("5 y – 5 y 11 m")).toBeVisible();
  },
};

export const ProgrammeValidation: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Edit Nursery (Pre-KG)" }),
    );
    const form = within(
      await body.findByRole("form", { name: "Edit Programme" }),
    );
    await expect(form.getByLabelText("Youngest age, years")).toHaveValue("3");
    await expect(form.getByLabelText("Oldest age, months")).toHaveValue("11");
    await userEvent.clear(form.getByLabelText("Programme name"));
    await userEvent.clear(form.getByLabelText("Oldest age, years"));
    await userEvent.type(form.getByLabelText("Oldest age, years"), "2");
    await userEvent.type(form.getByLabelText("Youngest age, months"), "14");
    await userEvent.click(form.getByRole("button", { name: "Save Programme" }));
    await expect(
      await form.findByText("Programme name is required"),
    ).toBeVisible();
    await expect(form.getByText("Enter 0 to 11 months")).toBeVisible();
    await expect(
      calls.filter((call) => call.route.startsWith("POST /programmes")),
    ).toEqual([]);
  },
};

export const ReorderArchiveRestore: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, userEvent }) => {
    const programmes = within(
      await canvas.findByRole("region", { name: "Programmes" }),
    );
    await userEvent.click(
      programmes.getByRole("button", { name: "Move LKG up" }),
    );
    await waitFor(() =>
      expect(
        calls.find((call) => call.route === "POST /programmes/reorder")?.body,
      ).toEqual({
        programmeIds: [id(1), id(3), id(2), id(4)],
      }),
    );
    await userEvent.click(
      programmes.getByRole("button", { name: "Archive LKG" }),
    );
    await expect(await programmes.findByRole("alert")).toHaveTextContent(
      "LKG has 2 Classrooms this Academic Year.",
    );
    await userEvent.click(
      programmes.getByRole("switch", { name: "Show archived (1)" }),
    );
    await userEvent.click(programmes.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(programmes.queryByText("Archived")).not.toBeInTheDocument(),
    );
  },
};

export const AddNextAndMakeCurrent: Story = {
  beforeEach: () => api(),
  play: async ({ canvas, canvasElement, userEvent }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Add next Academic Year" }),
    );
    const add = within(await body.findByRole("alertdialog"));
    await expect(add.getByText("Add Academic Year 2027–28?")).toBeVisible();
    await expect(add.getByText(/1 Apr 2027 – 31 Mar 2028/)).toBeVisible();
    await userEvent.click(add.getByRole("button", { name: "Add year" }));
    const years = within(
      canvas.getByRole("region", { name: "Academic Years" }),
    );
    await expect(await years.findByText("2027–28")).toBeVisible();
    await expect(
      calls.some((call) => call.route === "POST /academic-years"),
    ).toBe(true);

    await userEvent.click(
      years.getByRole("button", { name: "Make 2025–26 current" }),
    );
    const current = within(await body.findByRole("alertdialog"));
    await expect(
      current.getByText(
        /Classrooms and Admissions belong to one Academic Year/,
      ),
    ).toBeVisible();
    await userEvent.click(
      current.getByRole("button", { name: "Make current" }),
    );
    await waitFor(() =>
      expect(
        years.queryByRole("button", { name: "Make 2025–26 current" }),
      ).not.toBeInTheDocument(),
    );
  },
};
