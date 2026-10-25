"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  CircleDot,
  CircleX,
  Clock,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { FilterTabs, type FilterTab } from "@repo/ui/components/filter-tabs";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { USERS_PATH, userPath } from "@/lib/users-roles-nav";
import { QueryHttpError } from "@/src/queries/http";
import {
  TEAM_MEMBERS_KEY,
  removeTeamMember,
  resendTeamMemberInvite,
  teamMembersQuery,
  type TeamMember,
  type TeamMemberListFilter,
} from "@/src/queries/team-members";

import { MemberStatusBadge, STATUS_FILTERS } from "./member-status-badge";
import { ShareInviteDialog } from "./share-invite-dialog";
import { TeamMemberRowsSkeleton } from "./team-members-skeletons";

const STATUS_ICONS = {
  all: LayoutGrid,
  active: CircleDot,
  joining_pending: Clock,
  rejected: CircleX,
} satisfies Record<
  (typeof STATUS_FILTERS)[number]["value"],
  FilterTab<string>["icon"]
>;

const STATUS_TABS: FilterTab<TeamMemberListFilter["status"]>[] =
  STATUS_FILTERS.map((filter) => ({
    ...filter,
    icon: STATUS_ICONS[filter.value],
  }));

/**
 * Users & Roles → Users (CM-111, ADR CM-0030): the Company's Team Members,
 * with search, status tabs, their Role and row actions.
 */
export function TeamMembersPage({
  canAdd = true,
}: {
  /** Team Members Create; without it there is no Add User. */
  canAdd?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TeamMemberListFilter["status"]>("all");
  const [cursor, setCursor] = useState<TeamMemberListFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  const [isPending, startTransition] = useTransition();

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Users"
          meta="Your team, how they sign in, and the Role that decides what each one may do."
          actions={
            canAdd ? (
              <Link href={`${USERS_PATH}/new`} className={buttonVariants()}>
                <Plus />
                Add User
              </Link>
            ) : undefined
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="h-9 sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search Users"
              placeholder="Search name, mobile or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                startTransition(() => {
                  setCursor(null);
                });
              }}
            />
          </InputGroup>
          <FilterTabs
            aria-label="Status"
            items={STATUS_TABS}
            value={status}
            onValueChange={(next) => {
              startTransition(() => {
                setStatus(next);
                setCursor(null);
              });
            }}
          />
        </div>
        <Suspense fallback={<TeamMemberRowsSkeleton />}>
          <TeamMemberRows
            filter={{ search: deferredSearch, status, cursor }}
            onPage={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
            className={cn(isPending && "opacity-60 transition-opacity")}
          />
        </Suspense>
      </div>
    </div>
  );
}

function roleLabel(member: TeamMember): string {
  if (member.isOwner) return "Owner";
  return member.role?.name ?? "No Role";
}

function contactLine(member: TeamMember): string {
  return [member.mobile, member.email].filter(Boolean).join(" · ");
}

function TeamMemberRows({
  filter,
  onPage,
  className,
}: {
  filter: TeamMemberListFilter;
  onPage: (cursor: TeamMemberListFilter["cursor"]) => void;
  className?: string;
}) {
  const { data } = useSuspenseQuery(teamMembersQuery(filter));
  const { company } = useActiveCompany();
  const queryClient = useQueryClient();
  const [sharing, setSharing] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY });
  const removal = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: async () => {
      setRemoving(null);
      await refresh();
    },
  });
  const resend = useMutation({
    mutationFn: resendTeamMemberInvite,
    onSuccess: async (member) => {
      await refresh();
      setSharing(member);
    },
  });
  const failure = removal.error ?? resend.error;

  const filtered = filter.search.trim().length > 0 || filter.status !== "all";
  if (data.items.length === 0)
    return (
      <Empty className="bg-card border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Users match" : "No Users yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another name or status."
              : "Add your site engineers, supervisors and accountants. Invite them by email, or set a password so they sign in with their mobile."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && (
          <EmptyContent>
            <Link href={`${USERS_PATH}/new`} className={buttonVariants()}>
              <Plus />
              Add User
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "User" : "Users"}
      </p>
      <div className="bg-card rounded-lg border">
        <div
          aria-hidden="true"
          className="text-muted-foreground bg-muted/40 hidden items-center gap-4 rounded-t-lg border-b px-4 py-2 text-xs font-medium sm:flex"
        >
          <span className="flex-1">User</span>
          <span className="w-40">Role</span>
          <span className="w-8" />
        </div>
        <ul aria-label="Users" className="divide-border divide-y">
          {data.items.map((member) => (
            <li key={member.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={userPath(member.id)}
                    className="truncate font-semibold hover:underline"
                  >
                    {member.name}
                  </Link>
                  <MemberStatusBadge status={member.status} />
                  {member.memberType === "hrms" && (
                    <Badge variant="outline">HRMS</Badge>
                  )}
                  {member.isOwner && <Badge variant="outline">Owner</Badge>}
                </div>
                <p className="text-muted-foreground truncate text-sm">
                  {member.designation.name ?? "No Designation"}
                  {contactLine(member).length > 0 &&
                    ` · ${contactLine(member)}`}
                </p>
                {/* On a phone the Role sits under the details. */}
                <p className="truncate text-sm sm:hidden">
                  <span className="text-muted-foreground">Role: </span>
                  {roleLabel(member)}
                </p>
              </div>
              <p className="hidden w-40 shrink-0 truncate text-sm sm:block">
                {roleLabel(member)}
              </p>
              {member.isOwner ? (
                <span aria-hidden="true" className="size-8 shrink-0" />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${member.name}`}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {member.status === "joining_pending" &&
                      member.invitePath != null &&
                      member.email != null && (
                        <DropdownMenuItem
                          onClick={() => {
                            setSharing(member);
                          }}
                        >
                          Share invite link
                        </DropdownMenuItem>
                      )}
                    {member.status === "rejected" && member.email != null && (
                      <DropdownMenuItem
                        onClick={() => {
                          resend.mutate(member.id);
                        }}
                      >
                        Invite again
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      render={<Link href={userPath(member.id)} />}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        setRemoving(member);
                      }}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      </div>
      <FormAlert
        message={
          failure instanceof QueryHttpError
            ? failure.message
            : failure == null
              ? undefined
              : "Something went wrong. Please try again."
        }
      />
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Next
          </Button>
        </div>
      )}
      {sharing?.invitePath != null && sharing.email != null && (
        <ShareInviteDialog
          open
          onOpenChange={(open) => {
            if (!open) setSharing(null);
          }}
          memberName={sharing.name}
          companyName={company?.name ?? "our Company"}
          email={sharing.email}
          invitePath={sharing.invitePath}
        />
      )}
      <AlertDialog
        open={removing != null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.status === "active"
                ? "They lose access to this Company straight away. Their name stays on entries they made."
                : "Their invitation is cancelled."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removal.isPending}
              onClick={() => {
                if (removing != null) removal.mutate(removing.id);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
