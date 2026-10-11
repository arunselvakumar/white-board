import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { StoryQueries, type ApiCall } from "../../../.storybook/mocks/api";
import { mockXhrUploads } from "../../../.storybook/mocks/xhr";
import { SITE_WORK_DOCUMENTS_API } from "@/components/site-work/documents/site-work-document-fixtures";

import {
  DIARY_DATE,
  DIARY_PROJECT_ID,
  mockSiteDiaryApi,
  SITE_DIARY_API,
  siteDiary,
  type SiteDiaryApiOptions,
} from "./site-diary-fixtures";
import { SiteDiaryForm } from "./site-diary-form";

let api: ReturnType<typeof mockSiteDiaryApi>;

function posts(path: string): ApiCall[] {
  return api.calls.mock.calls
    .map(([call]) => call)
    .filter((call) => call.method === "POST" && call.path === path);
}

function diaryApi(options: SiteDiaryApiOptions = {}) {
  return () => {
    api = mockSiteDiaryApi(options);
    return api.restore;
  };
}

const BASE = `/app/projects/${DIARY_PROJECT_ID}/site-diary`;

const meta = {
  title: "Site work/Site Diary/Form",
  component: SiteDiaryForm,
  args: { projectId: DIARY_PROJECT_ID, date: DIARY_DATE },
  beforeEach: diaryApi(),
  parameters: { nextjs: { navigation: { pathname: `${BASE}/new` } } },
  render: (args) => (
    <StoryQueries>
      <div className="w-full p-6">
        <SiteDiaryForm {...args} />
      </div>
    </StoryQueries>
  ),
} satisfies Meta<typeof SiteDiaryForm>;

export default meta;
type Story = StoryObj<typeof meta>;

function body(canvasElement: HTMLElement) {
  return within(canvasElement.ownerDocument.body);
}

/** Rows need a name, a giver and an instruction; time out is not before time in. */
export const Validation: Story = {
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Site Diary" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Add visitor" }));
    await userEvent.type(form.getByLabelText("Time in"), "10:00");
    await userEvent.type(form.getByLabelText("Time out"), "09:30");
    await userEvent.click(
      form.getByRole("button", { name: "Add instruction" }),
    );
    await userEvent.type(form.getByLabelText("Rainfall (mm)"), "1.25");
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText("Enter the visitor's name."),
    ).toBeVisible();
    await expect(
      form.getByText("Time out cannot be before time in."),
    ).toBeVisible();
    await expect(
      form.getByText("Enter who gave the instruction."),
    ).toBeVisible();
    await expect(form.getByText("Write the instruction.")).toBeVisible();
    await expect(
      form.getByText("Enter the rainfall in mm, with at most 1 decimal."),
    ).toBeVisible();
    await expect(posts(SITE_DIARY_API)).toHaveLength(0);
  },
};

/** A new diary with weather, rainfall and one row of each kind. */
export const SaveWithRows: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Site Diary" }),
    );
    await expect(form.getByLabelText("Date")).toHaveValue(DIARY_DATE);
    await userEvent.click(
      form.getByRole("combobox", { name: "Weather (morning)" }),
    );
    await userEvent.click(
      await body(canvasElement).findByRole("option", { name: "Cloudy" }),
    );
    await userEvent.type(form.getByLabelText("Rainfall (mm)"), "12.5");
    await userEvent.type(
      form.getByLabelText("Site condition"),
      "Water logging at the north gate",
    );
    await userEvent.click(form.getByRole("button", { name: "Add visitor" }));
    const visitor = within(form.getByRole("listitem", { name: "Visitor 1" }));
    await userEvent.type(visitor.getByLabelText("Name"), "Ravi Shankar");
    await userEvent.type(visitor.getByLabelText("Organisation"), "Client");
    await userEvent.type(visitor.getByLabelText("Time in"), "10:00");
    await userEvent.type(visitor.getByLabelText("Time out"), "11:30");
    await userEvent.click(
      form.getByRole("button", { name: "Add instruction" }),
    );
    const instruction = within(
      form.getByRole("listitem", { name: "Instruction 1" }),
    );
    await userEvent.type(instruction.getByLabelText("Given by"), "Architect");
    await userEvent.type(
      instruction.getByLabelText("Instruction"),
      "Hold the pour until the cubes are tested",
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(async () => {
      await expect(posts(SITE_DIARY_API)).toHaveLength(1);
    });
    await expect(posts(SITE_DIARY_API)[0]?.body).toEqual({
      projectId: DIARY_PROJECT_ID,
      diaryDate: DIARY_DATE,
      weatherMorning: "cloudy",
      weatherAfternoon: null,
      rainfallMm: "12.5",
      siteCondition: "Water logging at the north gate",
      notes: null,
      visitors: [
        {
          name: "Ravi Shankar",
          organisation: "Client",
          purpose: null,
          timeIn: "10:00",
          timeOut: "11:30",
        },
      ],
      instructions: [
        {
          givenBy: "Architect",
          givenTo: null,
          instruction: "Hold the pour until the cubes are tested",
          actionTaken: null,
        },
      ],
    });
  },
};

/** A second diary for the date is refused under the date. */
export const DateTaken: Story = {
  beforeEach: diaryApi({ exists: true }),
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Site Diary" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    await expect(
      await form.findByText(/already has a Site Diary for that date/),
    ).toBeVisible();
  },
};

/** Editing starts from the diary's rows and sends its `updatedAt`. */
export const Edit: Story = {
  args: { diary: siteDiary() },
  parameters: { nextjs: { navigation: { pathname: `${BASE}/edit` } } },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "Edit Site Diary" }),
    );
    await expect(
      form.getAllByRole("listitem", { name: /^Visitor/ }),
    ).toHaveLength(2);
    await expect(
      form.getAllByRole("listitem", { name: /^Instruction/ }),
    ).toHaveLength(1);
    await userEvent.click(
      form.getByRole("button", { name: "Remove visitor 2" }),
    );
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const path = `${SITE_DIARY_API}/0199c4a0-0000-7000-8000-0000000e1001/update`;
    await waitFor(async () => {
      await expect(posts(path)[0]?.body).toMatchObject({
        diaryDate: DIARY_DATE,
        weatherMorning: "sunny",
        rainfallMm: "4.5",
        visitors: [{ name: "Ravi Shankar" }],
        instructions: [{ givenBy: "Architect" }],
        expectedUpdatedAt: "2026-10-10T12:00:00.000Z",
      });
    });
  },
};

/** Photos picked on a new diary upload to it once it is saved. */
export const SaveWithPhotos: Story = {
  beforeEach: () => {
    api = mockSiteDiaryApi();
    const xhr = mockXhrUploads({ stepMs: 5 });
    return () => {
      xhr.restore();
      api.restore();
    };
  },
  play: async ({ canvas, userEvent }) => {
    const form = within(
      await canvas.findByRole("form", { name: "New Site Diary" }),
    );
    await userEvent.upload(form.getByLabelText("Choose photos for Photos"), [
      new File(["x"], "Ramp.jpg", { type: "image/jpeg" }),
    ]);
    await expect(
      form.getByRole("list", { name: "Photos to upload" }),
    ).toBeVisible();
    await userEvent.click(form.getByRole("button", { name: "Save" }));
    const base = `${SITE_WORK_DOCUMENTS_API}/site_diary/0199c4a0-0000-7000-8000-0000000e1001/files`;
    await waitFor(async () => {
      await expect(
        api.calls.mock.calls
          .map(([call]) => call)
          .filter((call) => call.method === "POST" && call.path === base),
      ).toHaveLength(1);
    });
    await expect(posts(SITE_DIARY_API)).toHaveLength(1);
  },
};
