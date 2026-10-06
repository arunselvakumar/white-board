import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { ClassDetail } from "@/src/training/application/class-service";
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
      `/app/api/classes/${batchId}/${date}/09%3A00/recording`,
    );
  },
};
