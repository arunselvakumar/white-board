"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";

import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  DASHBOARD_SECTION_KEYS,
  isDashboardSectionKey,
} from "@/src/projects/domain/dashboard-sections";
import {
  useSaveDashboardLayout,
  type DashboardSection,
} from "@/src/queries/project-dashboard";

import { SectionIcon } from "./dashboard-parts";

function byDefault(sections: readonly DashboardSection[]) {
  const index = (key: string) =>
    (DASHBOARD_SECTION_KEYS as readonly string[]).indexOf(key);
  return [...sections]
    .sort((a, b) => index(a.key) - index(b.key))
    .map((section) => ({ ...section, visible: true }));
}

/**
 * Manage Dashboard (CM-412): tick the sections to show and move them up or
 * down (keyboard friendly), or reset. Saved for the member on every
 * Project. A section whose module is hidden on this Project (Hide / Show
 * Modules) cannot be ticked and says why (CM-902); its tick is kept for
 * the member's other Projects.
 */
export function ManageDashboardDialog({
  sections: initial,
  onClose,
}: {
  sections: DashboardSection[];
  onClose: () => void;
}) {
  const save = useSaveDashboardLayout();
  const [sections, setSections] = useState(initial);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  const pendingFocus = useRef<string | null>(null);

  // Keep the keyboard on the moved section; at an end, on its other button.
  useEffect(() => {
    const focus = pendingFocus.current;
    if (focus == null) return;
    pendingFocus.current = null;
    const [key, direction] = focus.split(":");
    const target = buttons.current.get(focus);
    const other = buttons.current.get(
      `${key ?? ""}:${direction === "up" ? "down" : "up"}`,
    );
    (target?.disabled === true ? other : target)?.focus();
  }, [sections]);

  const move = (index: number, by: -1 | 1) => {
    const next = [...sections];
    const [item] = next.splice(index, 1);
    if (item == null) return;
    next.splice(index + by, 0, item);
    setSections(next);
    setReset(false);
    pendingFocus.current = `${item.key}:${by < 0 ? "up" : "down"}`;
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage dashboard</DialogTitle>
          <DialogDescription>
            Choose the sections you see and their order. This is yours and
            applies on every Project.
          </DialogDescription>
        </DialogHeader>
        <ol
          aria-label="Sections in order"
          className="bg-card max-h-[55vh] divide-y overflow-y-auto rounded-xl border"
        >
          {sections.map((section, index) => {
            const hiddenHere = section.hiddenOnProject;
            const reasonId = `manage-dashboard-${section.key}-reason`;
            return (
              <li
                key={section.key}
                className="flex items-center gap-2 px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <label
                    className={cn(
                      "flex min-w-0 items-center gap-2",
                      hiddenHere ? "cursor-not-allowed" : "cursor-pointer",
                    )}
                  >
                    <Checkbox
                      checked={section.visible && !hiddenHere}
                      disabled={hiddenHere}
                      aria-describedby={hiddenHere ? reasonId : undefined}
                      onCheckedChange={(checked) => {
                        setReset(false);
                        setSections((current) =>
                          current.map((item) =>
                            item.key === section.key
                              ? { ...item, visible: checked }
                              : item,
                          ),
                        );
                      }}
                    />
                    {isDashboardSectionKey(section.key) ? (
                      <SectionIcon
                        sectionKey={section.key}
                        className={cn(
                          "size-6 rounded-md [&_svg]:size-3.5",
                          hiddenHere && "opacity-50",
                        )}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "min-w-0 truncate text-sm font-medium",
                        hiddenHere && "text-muted-foreground",
                      )}
                    >
                      {section.label}
                    </span>
                  </label>
                  {hiddenHere ? (
                    <span
                      id={reasonId}
                      className="text-muted-foreground pl-6 text-xs"
                    >
                      Hidden on this Project
                    </span>
                  ) : null}
                </div>
                {section.milestone == null ? null : (
                  <Badge variant="outline">{section.milestone}</Badge>
                )}
                <Button
                  ref={(node) => {
                    buttons.current.set(`${section.key}:up`, node);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${section.label} up`}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  ref={(node) => {
                    buttons.current.set(`${section.key}:down`, node);
                  }}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${section.label} down`}
                  disabled={index === sections.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
              </li>
            );
          })}
        </ol>
        <FormAlert message={error} />
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSections(byDefault(sections));
              setReset(true);
            }}
          >
            Reset to default
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                setError(undefined);
                save.mutate(
                  reset
                    ? []
                    : sections.map(({ key, visible }) => ({ key, visible })),
                  {
                    onSuccess: onClose,
                    onError: (failure) => {
                      setError(fieldForCode(failure, {}).message);
                    },
                  },
                );
              }}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
