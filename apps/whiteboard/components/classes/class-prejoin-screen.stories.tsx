import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { ClassDetail } from "@/src/training-institute/application/class-service";
import { classQueries } from "@/src/queries/classes";
import { getQueryClient } from "@/src/queries/query-client";
import { clerkMocks } from "../../.storybook/mocks/clerk";

import { ClassPrejoinScreen } from "./class-prejoin-screen";

const batchId = "660e8400-e29b-41d4-a716-446655440000";
const date = "2026-09-30";
const startTime = "09:00";
const detail: ClassDetail = {
  batchId,
  batchName: "DCA Morning",
  courseName: "DCA",
  date,
  startTime,
  endTime: "10:00",
  timezone: "Asia/Kolkata",
  meetingOption: "external",
  joinUrl: "https://meet.google.com/example",
  isHost: true,
  status: "scheduled",
  recordingStatus: null,
  recordingReady: false,
  classChange: null,
  rescheduledFrom: null,
};

function state(value: ClassDetail, role = "org:admin") {
  clerkMocks.orgId = "org_riverside";
  clerkMocks.orgRole = role;
  getQueryClient().setQueryData(
    classQueries.detail(
      `org_riverside:undefined:${role}`,
      batchId,
      date,
      startTime,
    ).queryKey,
    value,
  );
}

const meta = {
  title: "Pages/Class pre-join",
  component: ClassPrejoinScreen,
  args: { batchId, date, startTime },
  parameters: {
    layout: "fullscreen",
    nextjs: {
      navigation: { pathname: `/classes/${batchId}/${date}/${startTime}` },
    },
  },
} satisfies Meta<typeof ClassPrejoinScreen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ExternalLink: Story = {
  beforeEach: () => {
    state(detail);
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Join class" }),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open meeting" }),
    ).toHaveAttribute("href", "https://meet.google.com/example");
  },
};

export const WaitingForRecording: Story = {
  beforeEach: () => {
    state(
      { ...detail, meetingOption: "whiteboard", joinUrl: null, isHost: false },
      "org:student",
    );
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Waiting for the class to start"),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Join recorded class" }),
    ).toBeNull();
  },
};

export const RecordedClassReadyToJoin: Story = {
  beforeEach: () => {
    state(
      {
        ...detail,
        meetingOption: "whiteboard",
        joinUrl: null,
        isHost: false,
        status: "live",
        recordingStatus: "recording",
      },
      "org:student",
    );
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Class is live and being recorded"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Join recorded class" }),
    ).toBeVisible();
  },
};

export const RecordingDownload: Story = {
  beforeEach: () => {
    state({
      ...detail,
      meetingOption: "whiteboard",
      joinUrl: null,
      status: "ended",
      recordingStatus: "ready",
      recordingReady: true,
    });
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ready to download")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download recording" }),
    ).toHaveAttribute(
      "href",
      `/app/api/training-institute/classes/${batchId}/${date}/09%3A00/recording`,
    );
  },
};

export const StudentRecordingDownload: Story = {
  beforeEach: () => {
    state(
      {
        ...detail,
        meetingOption: "whiteboard",
        joinUrl: null,
        isHost: false,
        status: "ended",
        recordingStatus: "ready",
        recordingReady: true,
      },
      "org:student",
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ready to download")).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Download recording" }),
    ).toHaveAttribute(
      "href",
      `/app/api/training-institute/classes/${batchId}/${date}/09%3A00/recording`,
    );
  },
};

export const StudentRecordingNotReady: Story = {
  beforeEach: () => {
    state(
      {
        ...detail,
        meetingOption: "whiteboard",
        joinUrl: null,
        isHost: false,
        status: "ended",
        recordingStatus: "uploading",
      },
      "org:student",
    );
  },
  play: async ({ canvas }) => {
    await expect(canvas.queryByText("Class recording")).toBeNull();
  },
};

export const CancelledClass: Story = {
  beforeEach: () => {
    state(
      {
        ...detail,
        meetingOption: "whiteboard",
        joinUrl: null,
        isHost: false,
        status: "cancelled",
        classChange: { status: "cancelled", reason: "Pongal", movedTo: null },
      },
      "org:student",
    );
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "This class is cancelled" }),
    ).toBeVisible();
    await expect(canvas.getByText("Reason: Pongal")).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: /Join|Start/ }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("link", { name: "Open meeting" }),
    ).toBeNull();
  },
};

export const CancelledHostedClassForOwner: Story = {
  beforeEach: () => {
    state({
      ...detail,
      meetingOption: "whiteboard",
      joinUrl: null,
      status: "cancelled",
      classChange: { status: "holiday", reason: "Diwali", movedTo: null },
    });
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "No class: Holiday" }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("button", { name: "Start class" }),
    ).toBeNull();
    await expect(canvas.queryByText("Class recording")).toBeNull();
  },
};

export const MovedClass: Story = {
  beforeEach: () => {
    state(
      {
        ...detail,
        joinUrl: null,
        isHost: false,
        status: "cancelled",
        classChange: {
          status: "moved",
          reason: null,
          movedTo: { date: "2026-10-03", startTime: "16:00", endTime: "18:00" },
        },
      },
      "org:parent",
    );
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "This class has moved" }),
    ).toBeVisible();
    await expect(
      canvas.getByText("Moved to Sat, Oct 3 · 4:00 PM–6:00 PM"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Go to the new time" }),
    ).toHaveAttribute("href", `/classes/${batchId}/2026-10-03/16%3A00`);
  },
};

export const RescheduledClass: Story = {
  beforeEach: () => {
    state({
      ...detail,
      rescheduledFrom: { date: "2026-09-28", startTime: "09:00" },
    });
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Rescheduled\s+from Mon, Sep 28 · 9:00 AM/),
    ).toBeVisible();
    await expect(
      canvas.getByRole("link", { name: "Open meeting" }),
    ).toBeVisible();
  },
};
