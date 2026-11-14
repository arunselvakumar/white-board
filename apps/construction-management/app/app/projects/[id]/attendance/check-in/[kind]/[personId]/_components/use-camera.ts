"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  base64OfDataUrl,
  CameraCaptureError,
  cameraFailureOf,
  encodeWithin,
  facingOf,
  facingOfLabel,
  fitWithin,
  type Facing,
} from "./camera-frame";

export type CameraStatus =
  "idle" | "starting" | "live" | "denied" | "unavailable" | "in_use" | "error";

export type CapturedPhoto = {
  /** The JPEG as base64, without a `data:` prefix. */
  base64: string;
  /** For showing the photo taken; released when the camera unmounts. */
  previewUrl: string;
};

export type Camera = {
  /** Put on the `<video>`; it must stay mounted while the camera is used. */
  videoRef: RefObject<HTMLVideoElement | null>;
  status: CameraStatus;
  /** Which way the live camera faces; null until it is live. */
  facing: Facing | null;
  /** The device has more than one camera. */
  canSwitch: boolean;
  start: () => void;
  stop: () => void;
  switchCamera: () => void;
  /** The current frame as a JPEG of at most 1 MB, never mirrored. */
  capture: () => Promise<CapturedPhoto>;
};

const SIZE = { width: { ideal: 1280 }, height: { ideal: 960 } };

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

/** Undefined outside a secure context (plain http) and in old browsers. */
function mediaDevices(): MediaDevices | undefined {
  return typeof navigator !== "undefined" && "mediaDevices" in navigator
    ? navigator.mediaDevices
    : undefined;
}

async function videoInputs(media: MediaDevices): Promise<MediaDeviceInfo[]> {
  try {
    return (await media.enumerateDevices()).filter(
      (device) => device.kind === "videoinput",
    );
  } catch {
    return [];
  }
}

function drawJpeg(
  video: HTMLVideoElement,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context == null)
    return Promise.reject(
      new CameraCaptureError("This browser cannot take the photo."),
    );
  // The raw frame: the preview's mirroring is CSS only.
  context.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob == null)
          reject(new CameraCaptureError("The photo could not be taken."));
        else resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function base64Of(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string")
        resolve(base64OfDataUrl(reader.result));
      else reject(new CameraCaptureError("The photo could not be read."));
    };
    reader.onerror = () => {
      reject(new CameraCaptureError("The photo could not be read."));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * The device camera for a check-in photo (ADR CM-0043 §6): the rear camera
 * first, any camera when there is none. Every track is stopped on `stop()`,
 * on unmount, when the page is left and while the tab is hidden; a camera
 * that was live starts again when the tab is back. When the browser has
 * already been allowed the camera, it starts on its own.
 */
export function useCamera(): Camera {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  // Each open bumps this, so a late `getUserMedia` answer for a screen
  // already left (or a camera already switched) is stopped, not shown.
  const generation = useRef(0);
  const wanted = useRef<Facing>("environment");
  const resume = useRef(false);
  const previews = useRef<string[]>([]);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [facing, setFacing] = useState<Facing | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);

  const release = useCallback(() => {
    const current = stream.current;
    stream.current = null;
    stopTracks(current);
    const video = videoRef.current;
    if (video != null) video.srcObject = null;
  }, []);

  const open = useCallback(
    async (video: MediaTrackConstraints, want: Facing) => {
      generation.current += 1;
      const run = generation.current;
      release();
      setStatus("starting");
      const media = mediaDevices();
      if (media == null) {
        setStatus("unavailable");
        return;
      }
      let next: MediaStream;
      try {
        next = await media
          .getUserMedia({ video, audio: false })
          .catch((error: unknown) => {
            // Any camera at all, when the one asked for is not there.
            if (cameraFailureOf(error) !== "unavailable") throw error;
            return media.getUserMedia({ video: true, audio: false });
          });
      } catch (error) {
        if (run === generation.current) setStatus(cameraFailureOf(error));
        return;
      }
      if (run !== generation.current) {
        stopTracks(next);
        return;
      }
      // The tab was hidden while the camera opened: release it until it is back.
      if (document.visibilityState === "hidden") {
        stopTracks(next);
        resume.current = true;
        setStatus("idle");
        return;
      }
      stream.current = next;
      const track = next.getVideoTracks()[0];
      const actual = facingOf(
        track?.getSettings().facingMode,
        track?.label,
        want,
      );
      wanted.current = actual;
      setFacing(actual);
      track?.addEventListener("ended", () => {
        if (stream.current !== next) return;
        release();
        setStatus("error");
      });
      const element = videoRef.current;
      if (element != null) {
        element.srcObject = next;
        // Muted and inline, so autoplay is allowed; `play()` only fails
        // when a newer stream replaced this one.
        await element.play().catch(() => undefined);
      }
      if (run !== generation.current) return;
      setStatus("live");
      const inputs = await videoInputs(media);
      if (run === generation.current) setCanSwitch(inputs.length > 1);
    },
    [release],
  );

  const start = useCallback(() => {
    void open(
      { facingMode: { ideal: wanted.current }, ...SIZE },
      wanted.current,
    );
  }, [open]);

  const stop = useCallback(() => {
    generation.current += 1;
    resume.current = false;
    release();
    setStatus("idle");
  }, [release]);

  const switchCamera = useCallback(() => {
    const media = mediaDevices();
    if (media == null) return;
    const want: Facing = wanted.current === "user" ? "environment" : "user";
    const currentId = stream.current
      ?.getVideoTracks()[0]
      ?.getSettings().deviceId;
    void videoInputs(media).then((inputs) => {
      const others = inputs.filter((input) => input.deviceId !== currentId);
      // A phone has several rear lenses: prefer one labelled as facing the
      // other way, then any other camera, then ask by facing.
      const target =
        others.find((input) => facingOfLabel(input.label) === want) ??
        others[0];
      return open(
        target == null || target.deviceId === ""
          ? { facingMode: { ideal: want }, ...SIZE }
          : { deviceId: { exact: target.deviceId }, ...SIZE },
        want,
      );
    });
  }, [open]);

  const capture = useCallback(async (): Promise<CapturedPhoto> => {
    const video = videoRef.current;
    if (video == null || stream.current == null || video.videoWidth === 0)
      throw new CameraCaptureError(
        "The camera is not ready yet. Wait for the picture, then try again.",
      );
    const size = fitWithin(video.videoWidth, video.videoHeight);
    const blob = await encodeWithin((quality, scale) =>
      drawJpeg(
        video,
        Math.max(1, Math.round(size.width * scale)),
        Math.max(1, Math.round(size.height * scale)),
        quality,
      ),
    );
    const base64 = await base64Of(blob);
    const previewUrl = URL.createObjectURL(blob);
    previews.current.push(previewUrl);
    return { base64, previewUrl };
  }, []);

  // Already allowed: no tap needed to see the picture.
  useEffect(() => {
    let cancelled = false;
    const permissions =
      typeof navigator !== "undefined" && "permissions" in navigator
        ? navigator.permissions
        : undefined;
    permissions
      ?.query({ name: "camera" })
      .then((permission) => {
        if (!cancelled && permission.state === "granted") start();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [start]);

  // The tab hidden: release the camera; back: start it again if it was on.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (stream.current == null) return;
        resume.current = true;
        generation.current += 1;
        release();
        setStatus("idle");
      } else if (resume.current) {
        resume.current = false;
        start();
      }
    };
    const onPageHide = () => {
      generation.current += 1;
      release();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [release, start]);

  // Leaving the screen stops every track and frees the photos taken.
  useEffect(() => {
    const taken = previews.current;
    return () => {
      generation.current += 1;
      release();
      taken.forEach((url) => {
        URL.revokeObjectURL(url);
      });
    };
  }, [release]);

  return {
    videoRef,
    status,
    facing,
    canSwitch,
    start,
    stop,
    switchCamera,
    capture,
  };
}

/**
 * The camera the capture screen uses: the real one, or a stand-in a story
 * provides (Storybook cannot open a camera).
 */
export const CameraContext = createContext<() => Camera>(useCamera);

export function useCheckInCamera(): Camera {
  const useProvidedCamera = use(CameraContext);
  return useProvidedCamera();
}
