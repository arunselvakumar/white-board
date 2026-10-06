import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { TeacherForm } from "./teacher-form";
import { TeachersEmptyState } from "./teachers-empty-state";
import { TeacherDocumentsSection } from "./teacher-documents-section";
import type { TeacherWriteInput } from "../../src/queries/teachers";

const meta = {
  title: "Pages/Teachers",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AddTeacher: Story = {
  render: () => (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <h1 className="mb-6 text-2xl font-semibold">Add Teacher</h1>
        <TeacherForm
          onSubmit={() => Promise.resolve()}
          onCancel={() => undefined}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add Teacher" }));
    await expect(canvas.getByText("Name is required")).toBeVisible();
    await expect(canvas.getByText("Teacher photo is required")).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Teaching profile" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Weekly availability" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Verification" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("heading", { name: "Pay details" }),
    ).toBeVisible();
    await userEvent.type(canvas.getByLabelText("Full name"), "Asha Rao");
    await userEvent.type(canvas.getByLabelText("Email"), "asha@example.com");
    await expect(canvas.getByDisplayValue("Asha Rao")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Add availability" }),
    );
    await expect(canvas.getByLabelText("From")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove availability 1" }),
    );
    await expect(canvas.queryByLabelText("From")).toBeNull();
    const documentUpload = canvasElement.querySelector<HTMLInputElement>(
      'input[accept="application/pdf,image/jpeg,image/png"]',
    );
    if (documentUpload == null) throw new Error("Document input is missing");
    await userEvent.upload(
      documentUpload,
      new File(["%PDF-1.7"], "Certificate.pdf", { type: "application/pdf" }),
    );
    await expect(
      canvas.getByText("Certificate.pdf · certificate"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Certificate.pdf" }),
    );
    await expect(
      canvas.queryByText("Certificate.pdf · certificate"),
    ).toBeNull();
  },
};

const saveWithPhoto = fn((_input: TeacherWriteInput) => Promise.resolve());
export const AddTeacherWithPhoto: Story = {
  render: () => (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <TeacherForm onSubmit={saveWithPhoto} onCancel={() => undefined} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Full name"), "Meera Shah");
    await userEvent.type(canvas.getByLabelText("Email"), "meera@example.com");
    await userEvent.type(
      canvas.getByLabelText("Teaching specialisms"),
      "Drawing, Painting",
    );
    const upload = canvasElement.querySelectorAll(
      'input[type="file"]',
    )[1] as HTMLInputElement;
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9vZZ0AAAAASUVORK5CYII=",
      ),
      (value) => value.charCodeAt(0),
    );
    await userEvent.upload(
      upload,
      new File([png], "meera.png", { type: "image/png" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Add Teacher" }));
    await waitFor(() => expect(saveWithPhoto).toHaveBeenCalledOnce());
    const saved = saveWithPhoto.mock.calls[0]?.[0];
    await expect(saved?.name).toBe("Meera Shah");
    await expect(saved?.photo?.mimeType).toBe("image/png");
    await expect(saved?.details?.teachingSpecialisms).toEqual([
      "Drawing",
      "Painting",
    ]);
  },
};

export const Empty: Story = {
  render: () => <TeachersEmptyState />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "No Teachers yet" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Add Teacher" }),
    ).toHaveAttribute("href", "/teachers/new");
  },
};

const saveProfile = fn();
export const EditTeacher: Story = {
  render: () => (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl">
        <TeacherForm
          teacher={{
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Asha Rao",
            email: "asha@example.com",
            kind: "centre_teacher",
            phone: null,
            qualificationSummary: null,
            photoUrl: null,
            privateDetails: { idNumberLast4: "1234", bankAccountLast4: "9012" },
            details: {
              salutation: null,
              preferredName: "Asha",
              gender: null,
              dateOfBirth: null,
              address: null,
              alternatePhone: null,
              cityArea: "Pune",
              emergencyContactName: null,
              emergencyContactPhone: null,
              teachingSpecialisms: ["Drawing"],
              learnerLevels: ["Beginner"],
              yearsExperience: 5,
              highestQualification: "Fine Arts Diploma",
              certifications: [],
              languages: ["Hindi"],
              bio: null,
              portfolioUrl: null,
              startDate: null,
              availability: [],
              idProofType: null,
              backgroundCheckStatus: "not_checked",
              backgroundCheckDate: null,
              backgroundCheckNote: null,
              payBasis: null,
              payRatePaise: null,
              bankAccountHolder: null,
              bankName: null,
              bankIfsc: null,
            },
            invitationStatus: "accepted",
            clerkUserId: "user_1",
            deactivatedAt: null,
            createdAt: "2026-09-25T00:00:00.000Z",
            updatedAt: "2026-09-25T00:00:00.000Z",
          }}
          onSubmit={saveProfile}
          onCancel={() => undefined}
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Email")).toHaveAttribute("readonly");
    await userEvent.click(canvas.getByRole("button", { name: "Save changes" }));
    await expect(saveProfile).toHaveBeenCalled();
  },
};

const addDocument = fn();
const removeDocument = fn();
export const Documents: Story = {
  render: () => (
    <div className="w-full max-w-4xl p-6">
      <TeacherDocumentsSection
        teacherId="550e8400-e29b-41d4-a716-446655440000"
        documents={[
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            teacherId: "550e8400-e29b-41d4-a716-446655440000",
            kind: "certificate",
            name: "Fine Arts Diploma.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1234,
            uploadedAt: "2026-09-29T00:00:00.000Z",
          },
        ]}
        onAdd={addDocument}
        onRemove={removeDocument}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Documents" }),
    ).toBeVisible();
    await expect(canvas.getByText("Fine Arts Diploma.pdf")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download Fine Arts Diploma.pdf" }),
    ).toHaveAttribute(
      "href",
      "/app/api/training-institute/teachers/550e8400-e29b-41d4-a716-446655440000/documents/550e8400-e29b-41d4-a716-446655440001",
    );
  },
};
