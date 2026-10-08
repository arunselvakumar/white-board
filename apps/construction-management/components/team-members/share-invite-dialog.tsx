"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";

/**
 * The invite link for a Joining Pending Team Member (CM-111), to paste into
 * WhatsApp or SMS. Opening it lets them sign in with the invited number.
 */
export function ShareInviteDialog({
  open,
  onOpenChange,
  memberName,
  companyName,
  invitePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  companyName: string;
  invitePath: string;
}) {
  const [copied, setCopied] = useState(false);
  const link =
    typeof window === "undefined"
      ? invitePath
      : new URL(invitePath, window.location.origin).toString();
  const message = `${memberName}, join ${companyName} on Construction Management: ${link}`;
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setCopied(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share invite link</DialogTitle>
          <DialogDescription>
            Send this to {memberName}. They sign in with the mobile number or
            email you added and accept the Join Request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="invite-link">Invite link</Label>
          <Input id="invite-link" readOnly value={link} className="h-10" />
        </div>
        <DialogFooter>
          {canShare && (
            <Button
              variant="outline"
              onClick={() => {
                void navigator.share({ text: message }).catch(() => undefined);
              }}
            >
              <Share2 />
              Share
            </Button>
          )}
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(message).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
