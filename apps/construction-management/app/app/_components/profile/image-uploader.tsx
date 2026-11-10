"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  IMAGE_CONTENT_TYPES,
  IMAGE_LIMITS,
  type ImageKind,
} from "@/src/shared-kernel/files/image-file";

const MB = 1024 * 1024;

/** The same checks the server makes, so a wrong file fails before upload. */
export function imageFileProblem(file: File, kind: ImageKind): string | null {
  if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(file.type))
    return "Choose a PNG, JPEG or WebP image.";
  const max = IMAGE_LIMITS[kind];
  if (file.size > max)
    return `The file must be at most ${String(Math.round(max / MB))} MB.`;
  return null;
}

/**
 * Preview, upload, replace and remove for one image (Company logo, My
 * Profile photo). The file goes to our own route, never straight to storage.
 */
export function ImageUploader({
  kind,
  noun,
  imageUrl,
  fallback,
  shape,
  hint,
  disabled = false,
  onUpload,
  onRemove,
}: {
  kind: ImageKind;
  /** "logo", "photo": used in button names. */
  noun: string;
  imageUrl: string | null;
  fallback: ReactNode;
  shape: "square" | "circle";
  hint: string;
  disabled?: boolean;
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const hasImage = imageUrl != null;

  const run = async (
    action: "upload" | "remove",
    work: () => Promise<unknown>,
  ) => {
    setError(null);
    setBusy(action);
    try {
      await work();
    } catch (caught) {
      setError(fieldForCode(caught, {}).message);
    } finally {
      setBusy(null);
    }
  };

  const choose = (file: File | undefined) => {
    if (file == null) return;
    const problem = imageFileProblem(file, kind);
    if (problem != null) {
      setError(problem);
      return;
    }
    void run("upload", () => onUpload(file));
  };

  const rounded = shape === "circle" ? "" : "rounded-xl after:rounded-xl";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Avatar className={`size-20 ${rounded}`}>
        {hasImage && (
          <AvatarImage
            src={imageUrl}
            alt={`Your ${noun}`}
            className={
              shape === "circle" ? "" : "rounded-xl bg-white object-contain p-1"
            }
          />
        )}
        <AvatarFallback
          className={`bg-primary/10 text-primary text-lg font-semibold ${rounded}`}
        >
          {fallback}
        </AvatarFallback>
      </Avatar>
      {/* `relative`: the hidden file input stays inside, not off the page. */}
      <div className="relative min-w-0 flex-1 space-y-2">
        <Input
          ref={input}
          type="file"
          accept={IMAGE_CONTENT_TYPES.join(",")}
          aria-label={`Choose ${noun} file`}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy != null}
            onClick={() => input.current?.click()}
          >
            <ImageUp />
            {busy === "upload"
              ? "Uploading…"
              : hasImage
                ? `Replace ${noun}`
                : `Upload ${noun}`}
          </Button>
          {hasImage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || busy != null}
              onClick={() => {
                void run("remove", onRemove);
              }}
            >
              <Trash2 />
              {busy === "remove" ? "Removing…" : `Remove ${noun}`}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{hint}</p>
        <FormAlert message={error ?? undefined} />
      </div>
    </div>
  );
}
