"use client";

import {
  Camera as CameraIcon,
  CameraOff,
  SwitchCamera,
  VideoOff,
} from "lucide-react";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "@repo/ui/lib/utils";

import type { Camera, CameraStatus } from "./use-camera";

/** One sentence for each way the camera can fail. */
export const CAMERA_MESSAGES: Record<
  Exclude<CameraStatus, "idle" | "starting" | "live">,
  string
> = {
  denied:
    "Camera permission is off. Allow the camera for this site in the browser's settings, then try again.",
  unavailable: "No camera was found on this device.",
  in_use:
    "The camera is in use by another app. Close that app, then try again.",
  error: "The camera stopped. Try again.",
};

function PanelMessage({ camera }: { camera: Camera }) {
  const { status } = camera;
  if (status === "live") return null;
  return (
    <div
      aria-live="polite"
      className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
    >
      {status === "idle" ? (
        <>
          <CameraIcon aria-hidden="true" className="size-10 opacity-70" />
          <Button type="button" size="lg" onClick={camera.start}>
            Turn on camera
          </Button>
        </>
      ) : status === "starting" ? (
        <>
          <Spinner aria-hidden="true" className="size-8" />
          <p className="text-base">Starting the camera…</p>
        </>
      ) : (
        <>
          {status === "denied" ? (
            <CameraOff aria-hidden="true" className="size-10 opacity-70" />
          ) : (
            <VideoOff aria-hidden="true" className="size-10 opacity-70" />
          )}
          <p className="max-w-sm text-base text-balance">
            {CAMERA_MESSAGES[status]}
          </p>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={camera.start}
          >
            Try again
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The camera: a dark 4:3 panel with the live picture, or the frame taken
 * while it is sent. Mirrored on screen for the front camera only; the
 * photo itself is never mirrored.
 */
export function CaptureCameraPanel({
  camera,
  frozenUrl,
}: {
  camera: Camera;
  /** The frame taken, shown in place of the live picture. */
  frozenUrl: string | null;
}) {
  const { videoRef, status, facing, canSwitch, switchCamera } = camera;
  const live = status === "live";
  const mirrored = facing === "user";
  return (
    <div className="bg-sidebar text-sidebar-foreground relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-2xl lg:max-w-[calc((100dvh_-_9rem)*4/3)]">
      <video
        ref={videoRef}
        aria-label="Camera"
        playsInline
        muted
        autoPlay
        className={cn(
          "absolute inset-0 size-full object-cover",
          !live && "invisible",
          mirrored && "-scale-x-100",
        )}
      />
      {frozenUrl == null ? (
        <PanelMessage camera={camera} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- the frame just taken, a local URL
        <img
          src={frozenUrl}
          alt="The frame taken"
          className={cn(
            "absolute inset-0 size-full object-cover",
            mirrored && "-scale-x-100",
          )}
        />
      )}
      {live && canSwitch && frozenUrl == null ? (
        <Button
          type="button"
          variant="secondary"
          size="icon-lg"
          aria-label="Switch camera"
          className="absolute top-3 right-3 rounded-full opacity-90"
          onClick={switchCamera}
        >
          <SwitchCamera />
        </Button>
      ) : null}
    </div>
  );
}
