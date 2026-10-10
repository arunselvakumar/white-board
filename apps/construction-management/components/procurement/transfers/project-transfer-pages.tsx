"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { projectTransfersPath, transferQuery } from "@/src/queries/material-transfers";

import { TransferDetail } from "./transfer-detail";
import { TransferForm } from "./transfer-form";
import { TransfersList } from "./transfers-list";

/** A Project's Material Transfers tab (CM-507). */
export function ProjectTransfersList({ projectId }: { projectId: string }) {
  return (
    <TransfersList
      location={{ kind: "project", id: projectId }}
      hrefFor={(id) => projectTransfersPath(projectId, id)}
      newHref={`${projectTransfersPath(projectId)}/new`}
    />
  );
}

export function ProjectTransferNew({
  projectId,
  materialIds,
}: {
  projectId: string;
  materialIds: readonly string[];
}) {
  return (
    <div className="w-full space-y-4">
      <h2 className="font-semibold">New Material Transfer</h2>
      <TransferForm
        defaultFrom={{ kind: "project", id: projectId }}
        materialIds={materialIds}
        hrefFor={(id) => projectTransfersPath(projectId, id)}
      />
    </div>
  );
}

export function ProjectTransferDetail({
  projectId,
  transferId,
}: {
  projectId: string;
  transferId: string;
}) {
  return (
    <TransferDetail
      id={transferId}
      backHref={projectTransfersPath(projectId)}
      editHref={`${projectTransfersPath(projectId, transferId)}/edit`}
      afterDeleteHref={projectTransfersPath(projectId)}
    />
  );
}

export function ProjectTransferEdit({
  projectId,
  transferId,
}: {
  projectId: string;
  transferId: string;
}) {
  const { data } = useSuspenseQuery(transferQuery(transferId));
  return (
    <div className="w-full space-y-4">
      <h2 className="font-semibold">Edit {data.number}</h2>
      <TransferForm
        defaultFrom={data.from}
        transfer={data}
        hrefFor={(id) => projectTransfersPath(projectId, id)}
      />
    </div>
  );
}
