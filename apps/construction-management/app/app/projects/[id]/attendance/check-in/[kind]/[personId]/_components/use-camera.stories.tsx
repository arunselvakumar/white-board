import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, waitFor } from "storybook/test";

import { Button } from "@repo/ui/components/button";

import { useCamera, type Camera } from "./use-camera";

/**
 * The real `useCamera` against a stand-in for the browser's cameras, so the
 * promise that every track is stopped on leaving can be tested where a
 * late answer from the browser is the whole question.
 */

type Devices = {
  /** Every stream handed out, to see which are still live. */
  streams: MediaStream[];
  opened: number;
  /** Answers the pending `enumerateDevices` calls. */
  listCameras: () => void;
  restore: () => void;
};

let devices: Devices;

function liveTracks(): number {
  return devices.streams
    .flatMap((stream) => stream.getTracks())
    .filter((track) => track.readyState === "live").length;
}

function standInCameras(): Devices {
  const real = navigator.mediaDevices;
  const waiting: (() => void)[] = [];
  const cameras = ["rear", "front"].map((label, index): MediaDeviceInfo => ({
    deviceId: `camera-${String(index)}`,
    groupId: "",
    kind: "videoinput",
    label,
    toJSON: () => ({}),
  }));
  const state: Devices = {
    streams: [],
    opened: 0,
    listCameras: () => {
      for (const answer of waiting.splice(0)) answer();
    },
    restore: () => {
      for (const stream of state.streams)
        for (const track of stream.getTracks()) track.stop();
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: real,
      });
    },
  };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () => {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 48;
        canvas.getContext("2d")?.fillRect(0, 0, 64, 48);
        const stream = canvas.captureStream(1);
        state.streams.push(stream);
        state.opened += 1;
        return Promise.resolve(stream);
      },
      enumerateDevices: () =>
        new Promise<MediaDeviceInfo[]>((resolve) => {
          waiting.push(() => {
            resolve(cameras);
          });
        }),
    },
  });
  return state;
}

function Controls({ camera }: { camera: Camera }) {
  const { videoRef, status, canSwitch, start, stop, switchCamera } = camera;
  return (
    <div className="space-y-2 p-4">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera"
        className="h-24 w-32 bg-black"
      />
      <p role="status">{status}</p>
      <Button type="button" onClick={start}>
        Start
      </Button>
      {canSwitch ? (
        <Button type="button" onClick={switchCamera}>
          Switch
        </Button>
      ) : null}
      <Button type="button" onClick={stop}>
        Stop
      </Button>
    </div>
  );
}

function Screen() {
  return <Controls camera={useCamera()} />;
}

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      {open ? <Screen /> : <p>Left the screen</p>}
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(false);
        }}
      >
        Leave
      </Button>
    </div>
  );
}

const meta = {
  title: "Attendance/Check-In/useCamera",
  component: Harness,
  beforeEach: () => {
    devices = standInCameras();
    return devices.restore;
  },
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Switch camera lists the cameras before it opens the other one. Leaving in
 * that moment must open nothing: a stream opened after the screen is gone
 * has nobody left to stop it.
 */
export const SwitchThenLeave: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("live"),
    );
    devices.listCameras();
    await userEvent.click(
      await canvas.findByRole("button", { name: "Switch" }),
    );
    // The list of cameras is still on its way when the operator leaves.
    await userEvent.click(canvas.getByRole("button", { name: "Leave" }));
    await expect(canvas.getByText("Left the screen")).toBeVisible();
    await expect(liveTracks()).toBe(0);
    const opened = devices.opened;
    devices.listCameras();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(devices.opened).toBe(opened);
    await expect(liveTracks()).toBe(0);
  },
};

/** Stop releases the camera and takes the switch button away with it. */
export const StopHidesSwitch: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("live"),
    );
    devices.listCameras();
    await canvas.findByRole("button", { name: "Switch" });
    await userEvent.click(canvas.getByRole("button", { name: "Stop" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("idle");
    await expect(canvas.queryByRole("button", { name: "Switch" })).toBeNull();
    await expect(liveTracks()).toBe(0);
  },
};

/**
 * A page put in the back/forward cache with the camera on comes back with
 * it released: it says idle while away, and starts again on return.
 */
export const RestoredFromPageCache: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Start" }));
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("live"),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("idle"),
    );
    await expect(liveTracks()).toBe(0);
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("status")).toHaveTextContent("live"),
    );
    await expect(liveTracks()).toBe(1);
  },
};
