"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Hourglass,
  IndianRupee,
  Landmark,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";

import {
  contractsDashboardQuery,
  type ContractsDashboard,
} from "@/src/queries/contracts-dashboard";
import { clientBillsPath } from "@/src/queries/contracts-client-bills";
import { contractorBillsPath } from "@/src/queries/contracts-contractor-bills";
import { workOrdersPath } from "@/src/queries/contracts-work-orders";

import { Fact, Rupees, Section, denied } from "./dashboard-parts";
import { SectionSkeleton } from "./dashboard-skeletons";

type Side = NonNullable<ContractsDashboard["client"]>;

const none = <span className="text-muted-foreground font-normal">—</span>;

function Money({ paise }: { paise: number | null }) {
  return paise == null ? none : <Rupees paise={paise} />;
}

/** "Billed to date ₹13,500 of ₹55,000 BOQ · 24.5 %", with a bar. */
function BilledAgainstBoq({
  billed,
  boq,
}: {
  billed: number | null;
  boq: number | null;
}) {
  const share =
    billed != null && boq != null && boq > 0 ? (billed / boq) * 100 : null;
  return (
    <div className="min-w-0 space-y-2">
      <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
        <span className="text-muted-foreground">Billed to date</span>
        <span className="text-lg tabular-nums">
          <Money paise={billed} />
        </span>
        <span className="text-muted-foreground">of</span>
        <span className="tabular-nums">
          <Money paise={boq} />
        </span>
        <span className="text-muted-foreground">BOQ</span>
        {share == null ? null : (
          <span className="tabular-nums">· {share.toFixed(1)} %</span>
        )}
      </p>
      {share == null ? null : (
        <div className="bg-muted h-2 w-full rounded-full" aria-hidden="true">
          <div
            className="bg-primary h-2 rounded-full"
            style={{ width: `${String(Math.min(100, share))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function SideFacts({
  label,
  side,
  due,
  href,
}: {
  label: string;
  side: Side;
  due: string;
  href: string;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        <Link
          href={href}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Bills
        </Link>
      </h3>
      <dl aria-label={label} className="grid grid-cols-2 gap-2">
        <Fact label="Billed to date" icon={ReceiptText}>
          <Money paise={side.billedToDate} />
        </Fact>
        <Fact label={due} icon={IndianRupee}>
          <Money paise={side.outstanding} />
        </Fact>
        <Fact label="Retention held" icon={Landmark}>
          <Money paise={side.retentionHeld} />
        </Fact>
        <Fact label="Pending approval" icon={Hourglass}>
          {side.pendingApproval}
        </Fact>
      </dl>
    </div>
  );
}

/** The Contracts section's body once loaded. */
export function ContractsSectionBody({
  projectId,
  contracts,
}: {
  projectId: string;
  contracts: ContractsDashboard;
}) {
  const { boq, client, contractor, workOrders } = contracts;
  if (boq == null && client == null && contractor == null && workOrders == null)
    return (
      <p className="text-muted-foreground text-sm">
        Contracts need the BOQ, Work Order or Bills permission on this Project.
      </p>
    );
  const money =
    client?.billedToDate != null ||
    contractor?.billedToDate != null ||
    boq?.value != null;
  return (
    <div className="min-w-0 space-y-5">
      {boq != null || client != null ? (
        <BilledAgainstBoq
          billed={client?.billedToDate ?? null}
          boq={boq?.value ?? null}
        />
      ) : null}
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        {client == null ? null : (
          <SideFacts
            label="Client"
            side={client}
            due="Receivable"
            href={clientBillsPath(projectId)}
          />
        )}
        {contractor == null ? null : (
          <SideFacts
            label="Contractors"
            side={contractor}
            due="Payable"
            href={contractorBillsPath(projectId)}
          />
        )}
      </div>
      {workOrders == null ? null : (
        <dl
          aria-label="Work Orders"
          className="grid grid-cols-2 gap-2 lg:grid-cols-4"
        >
          <Fact label="Open Work Orders" icon={ClipboardList}>
            <Link href={workOrdersPath(projectId)} className="hover:underline">
              {workOrders.open}
            </Link>
          </Fact>
        </dl>
      )}
      {money ? null : (
        <p className="text-muted-foreground text-xs">
          Amounts need the Financial permission.
        </p>
      )}
    </div>
  );
}

/**
 * Contracts (CM-1111): billed to date against the BOQ, what is receivable
 * from the Client and payable to Contractors, retention held both ways,
 * bills pending approval and open Work Orders. A snapshot as on today:
 * the dashboard duration does not change it.
 */
export function ContractsSection({ projectId }: { projectId: string }) {
  const { data, isPending, error } = useQuery(
    contractsDashboardQuery(projectId),
  );
  return (
    <Section id="dashboard-contracts" title="Contracts">
      <p className="text-muted-foreground -mt-2 text-xs">
        As on today; the duration above does not apply.
      </p>
      {isPending ? (
        <SectionSkeleton
          label="Loading Contracts"
          facts={[
            { label: "Billed to date", icon: ReceiptText },
            { label: "Receivable", icon: IndianRupee },
            { label: "Payable", icon: IndianRupee },
            { label: "Retention held", icon: Landmark },
          ]}
        />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Contracts need the Dashboard permission on this Project."
            : "Contracts could not be loaded."}
        </p>
      ) : (
        <ContractsSectionBody projectId={projectId} contracts={data} />
      )}
    </Section>
  );
}
