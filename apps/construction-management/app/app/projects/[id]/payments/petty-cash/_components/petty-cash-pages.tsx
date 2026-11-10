"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { SiteRecordHeader } from "@/components/site-work/site-record-header";
import {
  pettyCashVoucherQuery,
  type VoucherType,
} from "@/src/queries/finance-petty-cash";

import { pettyCashPath } from "./petty-cash-parts";
import { VoucherForm } from "./voucher-form";

/** New voucher (CM-703): `?account=<id>&type=receipt` start it. */
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
          href: pettyCashPath(
            projectId,
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

/** Edit a voucher (CM-703). */
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
          href: pettyCashPath(projectId, `/${voucherId}`),
        }}
        title={`Edit ${data.number}`}
      />
      <VoucherForm projectId={projectId} voucher={data} />
    </div>
  );
}
