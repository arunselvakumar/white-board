"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

type ToastMessage = { id: number; text: string; tone: "error" | "info" };

const SHOW_MS = 6000;

/**
 * A short message pinned above the bottom of the screen, such as a change
 * that was undone because the server refused it. The page renders `toast`.
 */
export function useStatusToast() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const show = useCallback(
    (text: string, tone: ToastMessage["tone"] = "error") => {
      setMessage({ id: Date.now(), text, tone });
    },
    [],
  );

  useEffect(() => {
    if (message == null) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
    }, SHOW_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  const toast = (
    <div
      role={message?.tone === "error" ? "alert" : "status"}
      className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex justify-center print:hidden"
    >
      {message == null ? null : (
        <div
          key={message.id}
          className={cn(
            "bg-popover text-popover-foreground pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg",
            message.tone === "error" && "border-destructive/40",
          )}
        >
          <p className="flex-1">{message.text}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-my-1 -mr-2 size-8"
            aria-label="Dismiss"
            onClick={() => {
              setMessage(null);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );

  return { show, toast };
}
