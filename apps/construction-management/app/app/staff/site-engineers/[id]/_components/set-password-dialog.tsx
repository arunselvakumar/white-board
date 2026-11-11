"use client";

import { zodResolver } from "@hookform/resolvers/zod";
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
  useSetSiteEngineerPassword,
  type SiteEngineer,
  type SiteEngineerPasswordOutcome,
} from "@/src/queries/site-engineers";

import {
  signInWays,
  temporaryPassword,
} from "@/app/app/staff/office-staff/_components/sign-in-options";

const schema = z.object({ password: temporaryPassword });
type Values = z.infer<typeof schema>;

/**
 * Set password on Edit Site Engineer (ADR CM-0030 §7): a Temporary Password
 * they replace the next time they sign in. Offered only while their account
 * belongs to this Company alone (`canSetPassword`).
 */
export function SetPasswordDialog({
  engineer,
  open,
  onOpenChange,
  onDone,
}: {
  engineer: SiteEngineer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the save, with what happened. */
  onDone: (outcome: SiteEngineerPasswordOutcome) => void;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "" },
  });
  const save = useSetSiteEngineerPassword(engineer.id);

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
                const outcome = await save.mutateAsync(values.password);
                form.reset();
                onDone(outcome);
              } catch (error) {
                const { field, message } = fieldForCode(error, {
                  PASSWORD_INVALID: "password" as const,
                  PASSWORD_TOO_SHORT: "password" as const,
                  PASSWORD_TOO_LONG: "password" as const,
                });
                form.setError(field ?? "root", { message });
              }
            })(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>Set password</DialogTitle>
            <DialogDescription>
              {engineer.name} signs in with {signInWays(engineer)} and this
              password, and must change it the next time they sign in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="engineer-new-password" required>
              New password
            </Label>
            <PasswordField
              id="engineer-new-password"
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
