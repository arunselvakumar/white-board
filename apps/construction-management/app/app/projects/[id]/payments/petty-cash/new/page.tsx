import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { VoucherNew } from "@/components/finance/petty-cash/petty-cash-pages";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import {
  VOUCHER_TYPES,
  type VoucherType,
} from "@/src/finance/domain/petty-cash";

export const metadata: Metadata = { title: "New voucher" };

type Query = { account?: string | string[]; type?: string | string[] };

const one = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** Write a petty-cash voucher (CM-703): `?account=<id>&type=payment`. */
export default async function VoucherNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (!(await viewerCan("finance.petty_cash", "create", { projectId: id })))
    return <ProjectNoAccess what="writing petty-cash vouchers" />;
  const account = one(query.account);
  const type = one(query.type);
  return (
    <VoucherNew
      projectId={id}
      {...(account != null && /^[0-9a-f-]{36}$/i.test(account)
        ? { accountId: account }
        : {})}
      {...(type != null && (VOUCHER_TYPES as readonly string[]).includes(type)
        ? { type: type as VoucherType }
        : {})}
    />
  );
}
