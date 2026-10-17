"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Filter,
  MoreHorizontal,
  Plus,
  Signpost,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { FormAlert } from "@/components/auth/form-alert";
import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
} from "@/components/masters/master-list-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  salesSettingsQuery,
  useSalesListCommand,
  type FunnelStage,
  type SalesPickListItem,
} from "@/src/queries/sales-settings";
import {
  SALES_LIST_WORDS,
  type SalesListKind,
  type SalesPickList,
} from "@/src/sales/domain/sales-lists";

import { SalesListDialog } from "./sales-list-dialog";

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

type Editing = {
  list: SalesListKind;
  item: { id: string; name: string; updatedAt: string } | null;
};

type Deleting = { list: SalesListKind; id: string; name: string };

const DELETE_WORDS: Record<SalesListKind, string> = {
  funnel_stage:
    "It leaves the funnel. Closed inquiries keep its name. A stage with open inquiries cannot be deleted; move them first.",
  lead_source:
    "It leaves the inquiry form. A Lead Source inquiries use cannot be deleted; disable it instead.",
  lost_reason:
    "It is no longer offered when closing as Lost. A Lost Reason inquiries use cannot be deleted; disable it instead.",
};

function Section({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 id={id} className="flex items-center gap-2 font-semibold">
            <Icon aria-hidden="true" className="text-muted-foreground size-4" />
            {title}
          </h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The Funnel Stages in order, with up/down buttons that keep focus. */
function StageList({
  stages,
  canManage,
  busyId,
  onMove,
  onRename,
  onDelete,
}: {
  stages: readonly FunnelStage[];
  canManage: boolean;
  busyId: string | null;
  onMove: (stage: FunnelStage, direction: "up" | "down") => void;
  onRename: (stage: FunnelStage) => void;
  onDelete: (stage: FunnelStage) => void;
}) {
  return (
    <ol
      aria-label="Funnel Stages"
      className="bg-card divide-y rounded-xl border"
    >
      {stages.map((stage, index) => {
        const deletable = stage.openCount === 0 && stages.length > 1;
        return (
          <li key={stage.id} className="flex items-center gap-2 px-4 py-3">
            <span
              aria-hidden="true"
              className="text-muted-foreground w-5 shrink-0 text-sm tabular-nums"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-medium">{stage.name}</p>
              <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm">
                {stage.isSeed ? (
                  <Badge variant="secondary">Default</Badge>
                ) : null}
                <span>
                  {stage.openCount === 0
                    ? "No open inquiries"
                    : plural(stage.openCount, "open inquiry", "open inquiries")}
                </span>
              </div>
            </div>
            {canManage ? (
              <>
                <Button
                  data-move={`${stage.id}:up`}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${stage.name} up`}
                  disabled={index === 0 || busyId != null}
                  onClick={() => {
                    onMove(stage, "up");
                  }}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  data-move={`${stage.id}:down`}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${stage.name} down`}
                  disabled={index === stages.length - 1 || busyId != null}
                  onClick={() => {
                    onMove(stage, "down");
                  }}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={busyId === stage.id}
                        aria-label={`Actions for ${stage.name}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      onClick={() => {
                        onRename(stage);
                      }}
                    >
                      Rename
                    </DropdownMenuItem>
                    {deletable ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            onDelete(stage);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function PickList({
  list,
  items,
  canManage,
  busyId,
  addButton,
  onRename,
  onToggle,
  onDelete,
}: {
  list: SalesPickList;
  items: readonly SalesPickListItem[];
  canManage: boolean;
  busyId: string | null;
  addButton: ReactNode;
  onRename: (item: SalesPickListItem) => void;
  onToggle: (item: SalesPickListItem) => void;
  onDelete: (item: SalesPickListItem) => void;
}) {
  const { label } = SALES_LIST_WORDS[list];
  if (items.length === 0)
    return (
      <MasterEmpty
        icon={list === "lead_source" ? Signpost : Ban}
        title={`No ${label}s`}
        description={
          list === "lead_source"
            ? "Add where your inquiries come from, like Walk-in or Website."
            : "Add why inquiries are lost, like Budget or Location."
        }
        action={addButton}
      />
    );
  const used = (item: SalesPickListItem) =>
    item.usedCount === 0 ? null : (
      <p className="text-muted-foreground truncate text-sm">
        {`Used on ${plural(item.usedCount, "inquiry", "inquiries")}`}
      </p>
    );
  return (
    <ul aria-label={`${label}s`} className="bg-card divide-y rounded-xl border">
      {items.map((item) =>
        canManage ? (
          <MasterRow
            key={item.id}
            name={item.name}
            details={used(item)}
            isSeed={item.isSeed}
            disabled={!item.isActive}
            busy={busyId === item.id}
            editLabel="Rename"
            onEdit={() => {
              onRename(item);
            }}
            onToggle={() => {
              onToggle(item);
            }}
            {...(item.usedCount > 0
              ? {}
              : {
                  onDelete: () => {
                    onDelete(item);
                  },
                })}
          />
        ) : (
          <li key={item.id} className="min-w-0 space-y-1 px-4 py-3">
            <p
              className={
                item.isActive
                  ? "truncate font-medium"
                  : "text-muted-foreground truncate font-medium"
              }
            >
              {item.name}
            </p>
            {used(item)}
            {item.isSeed || !item.isActive ? (
              <div className="flex flex-wrap gap-1.5">
                {item.isSeed ? (
                  <Badge variant="secondary">Default</Badge>
                ) : null}
                {item.isActive ? null : (
                  <Badge variant="outline">Disabled</Badge>
                )}
              </div>
            ) : null}
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * Inquiries → Settings (CM-1002, ADR CM-0022 §2): the Project's Funnel
 * Stages in funnel order (moved with up/down buttons that keep focus),
 * Lead Sources and Lost Reasons. With Inquiry Update a member adds,
 * renames, disables or enables (sources and reasons) and deletes rows
 * nothing uses; others see the lists only.
 */
export function SalesSettingsPage({ projectId }: { projectId: string }) {
  const { data } = useSuspenseQuery(salesSettingsQuery(projectId));
  const command = useSalesListCommand(projectId);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();
  const root = useRef<HTMLDivElement>(null);
  /** `<stageId>:<up|down>` of the arrow to focus once the move lands. */
  const pendingFocus = useRef<string | null>(null);
  const busyId =
    command.isPending && "id" in command.variables
      ? command.variables.id
      : null;

  useEffect(() => {
    const focus = pendingFocus.current;
    if (focus == null || command.isPending) return;
    pendingFocus.current = null;
    const [id, direction] = focus.split(":");
    const find = (key: string) =>
      root.current?.querySelector<HTMLButtonElement>(`[data-move="${key}"]`);
    const target = find(focus);
    const other = find(`${id ?? ""}:${direction === "up" ? "down" : "up"}`);
    (target?.disabled === true ? other : target)?.focus();
  }, [data, command.isPending]);

  const add = (list: SalesListKind) =>
    data.canManage ? (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          setEditing({ list, item: null });
        }}
      >
        <Plus aria-hidden="true" />
        Add {SALES_LIST_WORDS[list].label}
      </Button>
    ) : null;

  const askDelete = (
    list: SalesListKind,
    row: { id: string; name: string },
  ) => {
    setDeleteError(undefined);
    setDeleting({ list, id: row.id, name: row.name });
  };

  return (
    <div ref={root} className="w-full p-6">
      <div className="w-full max-w-4xl space-y-8">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Inquiry settings</h2>
          <p className="text-muted-foreground text-sm">
            {data.canManage
              ? "The lists this Project's inquiries use. Changes apply to new picks; old inquiries keep what they had."
              : "The lists this Project's inquiries use. Ask someone with Inquiry update to change them."}
          </p>
        </div>
        <FormAlert message={listError} />

        <Section
          id="sales-settings-stages"
          icon={Filter}
          title="Funnel Stages"
          description="The steps an open inquiry moves through, top to bottom. New inquiries start at the first."
          action={add("funnel_stage")}
        >
          <StageList
            stages={data.funnelStages}
            canManage={data.canManage}
            busyId={busyId}
            onMove={(stage, direction) => {
              setListError(undefined);
              pendingFocus.current = `${stage.id}:${direction}`;
              command.mutate(
                { kind: "move", id: stage.id, direction },
                {
                  onError: (error) => {
                    setListError(errorMessage(error));
                  },
                },
              );
            }}
            onRename={(stage) => {
              setEditing({ list: "funnel_stage", item: stage });
            }}
            onDelete={(stage) => {
              askDelete("funnel_stage", stage);
            }}
          />
        </Section>

        {(["lead_source", "lost_reason"] as const).map((list) => (
          <Section
            key={list}
            id={`sales-settings-${list}`}
            icon={list === "lead_source" ? Signpost : Ban}
            title={`${SALES_LIST_WORDS[list].label}s`}
            description={
              list === "lead_source"
                ? "Where inquiries come from. Disabled ones leave the inquiry form; old inquiries keep them."
                : "Why inquiries are lost. Disabled ones are no longer offered; old inquiries keep them."
            }
            action={add(list)}
          >
            <PickList
              list={list}
              items={
                list === "lead_source" ? data.leadSources : data.lostReasons
              }
              canManage={data.canManage}
              busyId={busyId}
              addButton={add(list)}
              onRename={(item) => {
                setEditing({ list, item });
              }}
              onToggle={(item) => {
                setListError(undefined);
                command.mutate(
                  {
                    kind: item.isActive ? "disable" : "enable",
                    list,
                    id: item.id,
                  },
                  {
                    onError: (error) => {
                      setListError(errorMessage(error));
                    },
                  },
                );
              }}
              onDelete={(item) => {
                askDelete(list, item);
              }}
            />
          </Section>
        ))}
      </div>

      {editing != null ? (
        <SalesListDialog
          projectId={projectId}
          list={editing.list}
          item={editing.item}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={deleting?.name ?? null}
        description={deleting == null ? "" : DELETE_WORDS[deleting.list]}
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setDeleting(null);
        }}
        onConfirm={() => {
          if (deleting == null) return;
          command.mutate(
            { kind: "delete", list: deleting.list, id: deleting.id },
            {
              onSuccess: () => {
                setDeleting(null);
              },
              onError: (error) => {
                setDeleteError(errorMessage(error));
              },
            },
          );
        }}
      />
    </div>
  );
}
