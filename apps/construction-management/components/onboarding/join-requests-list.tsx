"use client";

import { navigateInApp } from "@repo/auth/construction/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { MailOpen } from "lucide-react";
import { Button } from "@repo/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@repo/ui/components/item";

import { FormAlert } from "@/components/auth/form-alert";
import { QueryHttpError } from "@/src/queries/http";
import {
  acceptJoinRequest,
  joinRequestsQuery,
  rejectJoinRequest,
} from "@/src/queries/join-requests";

/** Pending Join Requests for the signed-in User (CM-109). */
export function JoinRequestsList() {
  const { data } = useSuspenseQuery(joinRequestsQuery);
  const queryClient = useQueryClient();
  const acceptance = useMutation({
    mutationFn: acceptJoinRequest,
    onSuccess: () => {
      navigateInApp("/app/projects");
    },
  });
  const rejection = useMutation({
    mutationFn: rejectJoinRequest,
    onSuccess: () => queryClient.invalidateQueries(joinRequestsQuery),
  });
  const busy = acceptance.isPending || rejection.isPending;
  const failure = acceptance.error ?? rejection.error;

  if (data.items.length === 0) return null;

  return (
    <section aria-labelledby="join-requests" className="space-y-3">
      <h2
        id="join-requests"
        className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase"
      >
        Join Requests
      </h2>
      <ItemGroup className="gap-2">
        {data.items.map((request) => (
          <Item key={request.id} variant="outline" role="listitem">
            <ItemMedia variant="icon">
              <MailOpen />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{request.companyName}</ItemTitle>
              <ItemDescription>
                Invited you as {request.memberName}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`Decline ${request.companyName}`}
                onClick={() => {
                  rejection.mutate(request.id);
                }}
              >
                Decline
              </Button>
              <Button
                size="sm"
                disabled={busy}
                aria-label={`Accept ${request.companyName}`}
                onClick={() => {
                  acceptance.mutate(request.id);
                }}
              >
                Accept
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
      <FormAlert
        message={
          failure == null
            ? undefined
            : failure instanceof QueryHttpError
              ? failure.message
              : "Something went wrong. Please try again."
        }
      />
    </section>
  );
}
