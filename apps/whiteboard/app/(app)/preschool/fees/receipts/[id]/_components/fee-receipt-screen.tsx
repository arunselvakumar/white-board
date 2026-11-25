"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Ban, MessageCircle, Printer } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";

import {
  RoleGate,
  useActiveCentre,
} from "@/app/(app)/preschool/_components/active-centre-provider";
import {
  PageHeader,
  type PageHeaderBack,
} from "@/app/(app)/_components/app-shell/page-header";
import {
  childFullName,
  RECEIPT_PRINT_CSS,
  receiptShareUrl,
} from "@/lib/preschool-fees";
import {
  receiptQueryOptions,
  type PreschoolReceipt,
} from "@/src/queries/preschool/fees";

import { CancelReceiptDialog } from "./cancel-receipt-dialog";
import { FeeReceipt } from "./fee-receipt";

/**
 * The Receipt with Print, WhatsApp share and the way back to the account.
 * `back` and `share` let the family pages reuse it.
 */
export function FeeReceiptView({
  receipt,
  back,
  share = true,
}: {
  receipt: PreschoolReceipt;
  back?: PageHeaderBack;
  share?: boolean;
}) {
  const { me } = useActiveCentre();
  const [cancelling, setCancelling] = useState(false);
  const cancelled = receipt.cancellation != null;
  const canCancel =
    !cancelled && (me.role === "owner" || me.role === "centre_head");
  const shareUrl = receiptShareUrl({
    centreName: receipt.centre.name,
    childName: childFullName(receipt.child),
    receiptNumber: receipt.receiptNumber,
    receivedOn: receipt.receivedOn,
    amountPaise: receipt.amountPaise,
    balanceDuePaise: receipt.balanceDuePaise,
  });
  return (
    <div className="flex w-full flex-col gap-6 p-4 sm:p-6 print:p-0">
      <style>{RECEIPT_PRINT_CSS}</style>
      <div className="print:hidden">
        <PageHeader
          title={`Receipt ${receipt.receiptNumber}`}
          meta={childFullName(receipt.child)}
          watermark="Receipt"
          back={
            back ?? {
              href: `/preschool/fees/children/${receipt.child.id}`,
              label: "fee account",
            }
          }
          actions={
            <>
              {canCancel ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCancelling(true);
                  }}
                >
                  <Ban aria-hidden="true" />
                  Cancel Receipt
                </Button>
              ) : null}
              {share && !cancelled ? (
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline" })}
                >
                  <MessageCircle aria-hidden="true" />
                  Share on WhatsApp
                </a>
              ) : null}
              <Button
                type="button"
                onClick={() => {
                  window.print();
                }}
              >
                <Printer aria-hidden="true" />
                Print
              </Button>
            </>
          }
        />
      </div>
      <FeeReceipt receipt={receipt} />
      {canCancel ? (
        <CancelReceiptDialog
          receipt={receipt}
          open={cancelling}
          onOpenChange={setCancelling}
        />
      ) : null}
    </div>
  );
}

function ReceiptLoader({ paymentId }: { paymentId: string }) {
  const { data } = useSuspenseQuery(receiptQueryOptions(paymentId));
  return <FeeReceiptView receipt={data} />;
}

export function FeeReceiptScreen({ paymentId }: { paymentId: string }) {
  return (
    <RoleGate roles={["owner", "centre_head"]}>
      <ReceiptLoader paymentId={paymentId} />
    </RoleGate>
  );
}
