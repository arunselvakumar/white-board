"use client";

import { useQuery } from "@tanstack/react-query";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { SelectControlSkeleton } from "@/components/finance/finance-skeletons";
import type { CounterpartyKindModel } from "@/app/api/construction/finance/lookup-models";
import { counterpartyOptionsQuery } from "@/src/queries/finance-lookups";

/**
 * A Paid To / Received From label (ADR CM-0017 §5): a picked party of a
 * kind, or a typed name (`kind` null). It never moves a party's balance.
 */
export type CounterpartyValue = {
  kind: CounterpartyKindModel | null;
  id: string | null;
  name: string;
};

export const EMPTY_COUNTERPARTY: CounterpartyValue = {
  kind: null,
  id: null,
  name: "",
};

const TYPED = "__typed__";

export const COUNTERPARTY_KIND_LABELS: Record<CounterpartyKindModel, string> = {
  contractor: "Contractor",
  supplier: "Supplier",
  other_party: "Other Party",
  labour: "Labour",
  vendor: "Vendor",
  team_member: "Team Member",
};

const KIND_ITEMS = [
  { value: TYPED, label: "Type a name" },
  ...Object.entries(COUNTERPARTY_KIND_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

function PartySelect({
  id,
  kind,
  projectId,
  value,
  onChange,
  invalid,
  required,
}: {
  id: string;
  kind: CounterpartyKindModel;
  projectId: string | null;
  value: CounterpartyValue;
  onChange: (value: CounterpartyValue) => void;
  invalid: boolean;
  required: boolean;
}) {
  const query = useQuery(counterpartyOptionsQuery(kind, projectId));
  if (query.isPending) return <SelectControlSkeleton label="Loading parties" />;
  const parties = query.data?.items ?? [];
  const items = parties.map((party) => ({
    value: party.id,
    label: party.name,
  }));
  return (
    <Select
      items={items}
      value={value.id}
      onValueChange={(next) => {
        const party = parties.find((item) => item.id === next);
        if (party != null) onChange({ kind, id: party.id, name: party.name });
      }}
      disabled={parties.length === 0}
    >
      <SelectTrigger
        id={id}
        className="w-full min-w-0"
        aria-invalid={invalid}
        aria-required={required}
      >
        <SelectValue
          placeholder={
            parties.length === 0
              ? `No ${COUNTERPARTY_KIND_LABELS[kind]} here yet`
              : `Choose a ${COUNTERPARTY_KIND_LABELS[kind]}`
          }
        />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label={`${COUNTERPARTY_KIND_LABELS[kind]}s`}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Kind first ("Type a name", Contractor, Supplier, …), then the party of
 * that kind on the Project, or a name. Give the label `htmlFor={id}`; the
 * kind select is `${id}-kind`.
 */
export function CounterpartyField({
  id,
  value,
  onChange,
  projectId,
  invalid = false,
  required = false,
  kinds,
}: {
  id: string;
  value: CounterpartyValue;
  onChange: (value: CounterpartyValue) => void;
  projectId: string | null;
  invalid?: boolean;
  /** Sets `aria-required` on the name or party control. */
  required?: boolean;
  /** Limit the kinds offered (all by default). */
  kinds?: readonly CounterpartyKindModel[];
}) {
  const kindItems = KIND_ITEMS.filter(
    (item) =>
      item.value === TYPED ||
      kinds == null ||
      kinds.includes(item.value as CounterpartyKindModel),
  );
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
      <Select
        items={kindItems}
        value={value.kind ?? TYPED}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          onChange(
            next === TYPED
              ? {
                  kind: null,
                  id: null,
                  name: value.kind == null ? value.name : "",
                }
              : { kind: next as CounterpartyKindModel, id: null, name: "" },
          );
        }}
      >
        <SelectTrigger
          id={`${id}-kind`}
          className="w-full min-w-0"
          aria-label="Party kind"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          aria-label="Party kinds"
        >
          {kindItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.kind == null ? (
        <Input
          id={id}
          value={value.name}
          maxLength={200}
          placeholder="Name"
          aria-invalid={invalid}
          aria-required={required}
          onChange={(event) => {
            onChange({ kind: null, id: null, name: event.target.value });
          }}
        />
      ) : (
        <PartySelect
          id={id}
          kind={value.kind}
          projectId={projectId}
          value={value}
          onChange={onChange}
          invalid={invalid}
          required={required}
        />
      )}
    </div>
  );
}
