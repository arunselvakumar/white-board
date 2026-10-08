"use client";

import { useActiveCompany } from "@repo/auth/construction/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState, Suspense } from "react";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
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

/** Team Members under Masters (CM-111): search, status chips, row actions. */
export function TeamMembersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TeamMemberListFilter["status"]>("all");
  const [cursor, setCursor] = useState<TeamMemberListFilter["cursor"]>(null);
  const deferredSearch = useDeferredValue(search);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Team Members"
          meta="Invite your team and decide what each one may do."
          actions={
            <Link
              href="/app/masters/team-members/new"
              className={buttonVariants()}
            >
              <Plus />
              Add Team Member
            </Link>
          }
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <InputGroup className="h-9 sm:max-w-xs">
            <InputGroupAddon>
              <Search aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search Team Members"
              placeholder="Search name, mobile or email"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setCursor(null);
              }}
            />
          </InputGroup>
          <ToggleGroup
            aria-label="Status"
            value={[status]}
            onValueChange={(value: string[]) => {
              const next = value[0] as
                TeamMemberListFilter["status"] | undefined;
              if (next == null) return;
              setStatus(next);
              setCursor(null);
            }}
            variant="outline"
            size="sm"
          >
            {STATUS_FILTERS.map((filter) => (
              <ToggleGroupItem key={filter.value} value={filter.value}>
                {filter.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <Suspense fallback={<ListSkeleton />}>
          <TeamMemberRows
            filter={{ search: deferredSearch, status, cursor }}
            onPage={setCursor}
          />
        </Suspense>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

function contactLine(member: TeamMember): string {
  return [member.mobile, member.email].filter(Boolean).join(" · ");
}

function TeamMemberRows({
  filter,
  onPage,
}: {
  filter: TeamMemberListFilter;
  onPage: (cursor: TeamMemberListFilter["cursor"]) => void;
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
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Users />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No Team Members match" : "No Team Members yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another name or status."
              : "Add your site engineers, supervisors and accountants. They join by signing in with their email."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && (
          <EmptyContent>
            <Link
              href="/app/masters/team-members/new"
              className={buttonVariants()}
            >
              <Plus />
              Add Team Member
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "Team Member" : "Team Members"}
      </p>
      <ul className="divide-border divide-y rounded-lg border">
        {data.items.map((member) => (
          <li key={member.id} className="flex items-center gap-4 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/masters/team-members/${member.id}`}
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
                {contactLine(member).length > 0 && ` · ${contactLine(member)}`}
              </p>
            </div>
            {!member.isOwner && (
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
                    render={
                      <Link href={`/app/masters/team-members/${member.id}`} />
                    }
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
