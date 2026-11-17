"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/app/app/projects/[id]/_components/site-work/site-record-header";
import {
  pettyCashVoucherQuery,
  type VoucherType,
} from "@/src/queries/finance-petty-cash";

import { VoucherForm } from "./voucher-form";
import { pageHref } from "@/lib/page-href";

/** New voucher: `?account=<id>&type=receipt` start it. */
export function VoucherNew({
  projectId,
  accountId,
  type,
}: {
  projectId: string;
  accountId?: string;
  type?: VoucherType;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{
          label: "Petty Cash",
          href: pageHref(
            "/app/projects/[id]/payments/petty-cash",
            { id: projectId },
            accountId == null
              ? ""
              : `?account=${encodeURIComponent(accountId)}`,
          ),
        }}
        title="New voucher"
      />
      <VoucherForm
        projectId={projectId}
        {...(accountId == null ? {} : { accountId })}
        {...(type == null ? {} : { type })}
      />
    </div>
  );
}

export function VoucherEdit({
  projectId,
  voucherId,
}: {
  projectId: string;
  voucherId: string;
}) {
  const { data } = useSuspenseQuery(pettyCashVoucherQuery(voucherId));
  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <SiteRecordHeader
        back={{
          label: data.number,
          href: pageHref("/app/projects/[id]/payments/petty-cash/[voucherId]", {
            id: projectId,
            voucherId,
          }),
        }}
        title={`Edit ${data.number}`}
      />
      <VoucherForm projectId={projectId} voucher={data} />
    </div>
  );
}
