"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { centralStoreHref } from "@/components/procurement/stores/central-store-parts";
import { transferQuery } from "@/src/queries/material-transfers";

import { TransferDetail } from "./transfer-detail";
import { TransferForm } from "./transfer-form";

/** A Material Transfer from a Central Store (CM-507, CM-508). */
export function StoreTransferNew({ storeId }: { storeId: string }) {
  return (
    <div className="w-full space-y-4">
      <h2 className="font-semibold">New Material Transfer</h2>
      <TransferForm
        defaultFrom={{ kind: "store", id: storeId }}
        materialIds={[]}
        hrefFor={(id) => centralStoreHref.transfer(storeId, id)}
      />
    </div>
  );
}

export function StoreTransferDetail({
  storeId,
  transferId,
}: {
  storeId: string;
  transferId: string;
}) {
  return (
    <TransferDetail
      id={transferId}
      backHref={centralStoreHref.store(storeId)}
      editHref={`${centralStoreHref.transfer(storeId, transferId)}/edit`}
      afterDeleteHref={centralStoreHref.store(storeId)}
    />
  );
}

export function StoreTransferEdit({
  storeId,
  transferId,
}: {
  storeId: string;
  transferId: string;
}) {
  const { data } = useSuspenseQuery(transferQuery(transferId));
  return (
    <div className="w-full space-y-4">
      <h2 className="font-semibold">Edit {data.number}</h2>
      <TransferForm
        defaultFrom={data.from}
        transfer={data}
        hrefFor={(id) => centralStoreHref.transfer(storeId, id)}
      />
    </div>
  );
}
