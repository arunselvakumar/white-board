import { useCallback, useEffect, useRef, useState } from "react";

import { STILL_JPEG_BASE64 } from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-fixtures";

import type { Facing } from "./camera-frame";
import type { Camera, CameraStatus } from "./use-camera";

/** What a story's camera was asked to do, in order. */
export type FakeCameraEvent = "start" | "stop" | "switch" | "capture";

/** A still frame for the `<video>`: a night-blue gradient with a figure. */
function stillFrame(facing: Facing): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const context = canvas.getContext("2d");
  if (context == null) return "";
  const sky = context.createLinearGradient(0, 0, 0, 480);
  sky.addColorStop(0, "#2a2f55");
  sky.addColorStop(1, "#13141b");
  context.fillStyle = sky;
  context.fillRect(0, 0, 640, 480);
  context.fillStyle = "#6b72dc";
  context.beginPath();
  context.arc(320, 190, 70, 0, Math.PI * 2);
  context.fill();
  context.fillRect(210, 280, 220, 200);
  context.fillStyle = "#f1f0f7";
  context.font = "24px sans-serif";
  context.fillText(facing === "user" ? "Front camera" : "Rear camera", 24, 452);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * A stand-in for `useCamera` in stories: it starts as `initial`, becomes
 * `onStart` when started, paints a still frame and takes a fixed small
 * JPEG.
 */
export function fakeCamera({
  initial = "live",
  onStart = "live",
  canSwitch = true,
  onEvent,
}: {
  initial?: CameraStatus;
  onStart?: CameraStatus;
  canSwitch?: boolean;
  onEvent?: (event: FakeCameraEvent) => void;
} = {}): () => Camera {
  return function useFakeCamera(): Camera {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<CameraStatus>(initial);
    const [facing, setFacing] = useState<Facing>("environment");

    useEffect(() => {
      const video = videoRef.current;
      if (video == null) return;
      video.poster = status === "live" ? stillFrame(facing) : "";
    }, [status, facing]);

    const start = useCallback(() => {
      onEvent?.("start");
      setStatus(onStart);
    }, []);
    const stop = useCallback(() => {
      onEvent?.("stop");
      setStatus("idle");
    }, []);
    const switchCamera = useCallback(() => {
      onEvent?.("switch");
      setFacing((current) => (current === "user" ? "environment" : "user"));
    }, []);
    const capture = useCallback(() => {
      onEvent?.("capture");
      return Promise.resolve({
        base64: STILL_JPEG_BASE64,
        previewUrl: `data:image/jpeg;base64,${STILL_JPEG_BASE64}`,
      });
    }, []);

    return {
      videoRef,
      status,
      facing: status === "live" ? facing : null,
      canSwitch,
      start,
      stop,
      switchCamera,
      capture,
    };
  };
}
