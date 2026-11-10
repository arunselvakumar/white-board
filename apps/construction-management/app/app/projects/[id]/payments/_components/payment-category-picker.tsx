"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { SelectControlSkeleton } from "@/components/finance/finance-skeletons";
import { paymentCategoryOptionsQuery } from "@/src/queries/finance-lookups";

const NONE = "__none__";

/**
 * Payment Category for a money form (ADR CM-0017). With `optional` the list
 * starts with "No category"; the value is then `""`.
 */
export function PaymentCategoryPicker({
  id,
  value,
  onChange,
  optional = false,
  invalid = false,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (categoryId: string) => void;
  optional?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const query = useQuery(paymentCategoryOptionsQuery());
  if (query.isPending)
    return <SelectControlSkeleton label="Loading Payment Categories" />;
  const categories = query.data?.items ?? [];
  const items = [
    ...(optional ? [{ value: NONE, label: "No category" }] : []),
    ...categories.map((item) => ({ value: item.id, label: item.name })),
  ];
  return (
    <Select
      items={items}
      value={value === "" ? (optional ? NONE : null) : value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next === NONE ? "" : next);
      }}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        className="w-full min-w-0"
        aria-invalid={invalid}
        aria-required={!optional}
      >
        <SelectValue placeholder="Choose a category" />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label="Payment Categories"
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
