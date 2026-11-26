"use client";

import { Camera as CameraIcon, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";

import { CameraCaptureError } from "./camera-frame";
import { CaptureCameraPanel } from "./capture-camera-panel";
import { useCamera, type CapturedPhoto } from "./use-camera";

function messageOf(error: unknown): string {
  return error instanceof CameraCaptureError
    ? error.message
    : fieldForCode(error, {}).message;
}

/**
 * Mounted only while the dialog is open, so the camera is on only then:
 * closing the dialog unmounts it, which stops every track.
 */
function TakePhoto({
  noun,
  onTaken,
  onDone,
}: {
  noun: string;
  onTaken: (file: File) => Promise<unknown>;
  onDone: () => void;
}) {
  const camera = useCamera();
  const [taken, setTaken] = useState<CapturedPhoto | null>(null);
  const [busy, setBusy] = useState<"capture" | "save" | null>(null);
  const [error, setError] = useState<string | undefined>();
  const { status, start } = camera;

  // Asked for by tapping Take photo: no second tap to turn the camera on.
  useEffect(() => {
    if (status === "idle") start();
    // Once, on open; a failed camera keeps its own Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capture = async () => {
    setError(undefined);
    setBusy("capture");
    try {
      setTaken(await camera.capture());
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (taken == null) return;
    setError(undefined);
    setBusy("save");
    try {
      await onTaken(
        new File([taken.blob], `${noun}.jpg`, { type: "image/jpeg" }),
      );
      onDone();
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(null);
    }
  };

  return (
    <>
      <CaptureCameraPanel
        camera={camera}
        frozenUrl={taken?.previewUrl ?? null}
      />
      <FormAlert message={error} />
      <DialogFooter>
        {taken == null ? (
          <>
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={status !== "live" || busy != null}
              onClick={() => {
                void capture();
              }}
            >
              <CameraIcon />
              {busy === "capture" ? "Taking…" : `Take ${noun}`}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy != null}
              onClick={() => {
                setTaken(null);
                setError(undefined);
              }}
            >
              <RotateCcw />
              Retake
            </Button>
            <Button
              type="button"
              disabled={busy != null}
              onClick={() => {
                void save();
              }}
            >
              {busy === "save" ? "Saving…" : `Use ${noun}`}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

/**
 * Take a photo with the device camera instead of choosing a file: the
 * phone's rear camera, or the laptop's webcam. The photo is a JPEG of at
 * most 1 MB, handed to `onTaken` like a chosen file.
 */
export function TakePhotoDialog({
  open,
  onOpenChange,
  noun,
  onTaken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "photo": used in the title and buttons. */
  noun: string;
  onTaken: (file: File) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Take {noun}</DialogTitle>
          <DialogDescription>
            Frame the face in good light, then take the {noun}. Switch camera
            turns to the other camera.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <TakePhoto
            noun={noun}
            onTaken={onTaken}
            onDone={() => {
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
