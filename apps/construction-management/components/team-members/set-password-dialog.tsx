"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Label } from "@repo/ui/components/label";

import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { fieldForCode } from "@/lib/server-errors";
import {
  TEAM_MEMBERS_KEY,
  setTeamMemberPassword,
  teamMemberQuery,
  type PasswordOutcome,
  type TeamMember,
} from "@/src/queries/team-members";

import { signInWays, temporaryPassword } from "./sign-in-options";

const schema = z.object({ password: temporaryPassword });
type Values = z.infer<typeof schema>;

/**
 * Set a new password on Edit User (ADR CM-0029 §7): a Temporary Password
 * they replace the next time they sign in. Allowed only while the account
 * belongs to this Company alone (`canSetPassword`).
 */
export function SetPasswordDialog({
  member,
  open,
  onOpenChange,
  onDone,
}: {
  member: TeamMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the save, with what happened. */
  onDone: (outcome: TeamMember & PasswordOutcome) => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });
  const save = useMutation({
    mutationFn: (values: Values) =>
      setTeamMemberPassword(member.id, values.password),
    onSuccess: async (updated) => {
      queryClient.setQueryData(teamMemberQuery(member.id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: TEAM_MEMBERS_KEY });
    },
  });
  const hasAccount = member.userId != null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          save.reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            void form.handleSubmit(async (values) => {
              try {
                const outcome = await save.mutateAsync(values);
                form.reset();
                onDone(outcome);
              } catch (error) {
                const { field, message } = fieldForCode(error, {
                  PASSWORD_TOO_SHORT: "password" as const,
                  PASSWORD_TOO_LONG: "password" as const,
                });
                form.setError(field ?? "root", { message });
              }
            })(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              {member.name} signs in with {signInWays(member)} and this
              password, and must change it the next time they sign in.
              {hasAccount ? " They are signed out of every device now." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="new-member-password" required>
              New password
            </Label>
            <PasswordField
              id="new-member-password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              aria-required
              aria-invalid={form.formState.errors.password != null}
              {...form.register("password")}
            />
            <FieldError message={form.formState.errors.password?.message} />
          </div>
          <FormAlert message={form.formState.errors.root?.message} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
