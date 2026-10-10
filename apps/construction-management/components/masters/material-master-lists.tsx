"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, FolderTree, Package, Ruler } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";

import { formatMinor } from "@/src/shared-kernel/money";
import {
  categoryOptionsQuery,
  categoryPath,
  type MaterialItem,
} from "@/src/queries/material-masters";

import {
  MaterialCategoryDialog,
  MeasurementUnitDialog,
  TermsConditionDialog,
} from "./material-master-dialogs";
import { PagedMasterListScreen } from "./paged-master-list";

export const ITEM_TYPE_LABELS: Record<MaterialItem["itemType"], string> = {
  consumable: "Consumable",
  non_consumable: "Non-consumable",
  asset: "Asset",
};

/** Masters → Measurement Units (CM-501). */
export function MeasurementUnitsList() {
  return (
    <PagedMasterListScreen
      screen={{
        list: "measurement-units",
        singular: "Measurement Unit",
        plural: "Measurement Units",
        description: "Units Materials are counted in: Bag, kg, cum, sqft…",
        icon: Ruler,
        emptyDescription:
          "Add the units you count material in, like Bag or cum.",
        deleteDescription:
          "It will no longer be offered anywhere. A unit a Material is counted in cannot be deleted; disable it instead.",
        searchLabel: "Search Measurement Units",
        name: (item) => item.name,
        isSeed: (item) => item.isSeed,
        editLabel: "Rename",
        dialog: (props) => <MeasurementUnitDialog {...props} />,
      }}
    />
  );
}

/** Masters → Material Categories (CM-501). */
export function MaterialCategoriesList() {
  return (
    <PagedMasterListScreen
      screen={{
        list: "material-categories",
        singular: "Material Category",
        plural: "Material Categories",
        description:
          "Groups of Materials, one level deep: Civil Work Materials › Cement.",
        icon: FolderTree,
        emptyDescription:
          "Add the groups you buy material in, like Civil Work Materials or Plumbing Material.",
        deleteDescription:
          "It will no longer be offered anywhere. A category with Materials or sub-categories cannot be deleted; disable it instead.",
        searchLabel: "Search Material Categories",
        name: (item) => item.name,
        details: (item) =>
          item.parentName != null ? (
            <p className="text-muted-foreground truncate text-sm">
              Under {item.parentName}
            </p>
          ) : item.childCount > 0 ? (
            <p className="text-muted-foreground text-sm">
              {item.childCount}{" "}
              {item.childCount === 1 ? "sub-category" : "sub-categories"}
            </p>
          ) : null,
        isSeed: (item) => item.isSeed,
        editLabel: "Edit",
        dialog: (props) => <MaterialCategoryDialog {...props} />,
      }}
    />
  );
}

/** Masters → Terms & Conditions (CM-501, menu `masters.terms_conditions`). */
export function TermsConditionsList() {
  return (
    <PagedMasterListScreen
      screen={{
        list: "terms-conditions",
        singular: "Terms & Conditions",
        plural: "Terms & Conditions",
        description: "Reusable terms you pick on Purchase Orders.",
        icon: FileText,
        emptyDescription:
          "Add the terms you print on Purchase Orders, like delivery, payment or warranty.",
        deleteDescription:
          "It will no longer be offered on Purchase Orders. POs already raised keep their copy.",
        searchLabel: "Search Terms & Conditions",
        name: (item) => item.title,
        details: (item) => (
          <p className="text-muted-foreground line-clamp-2 text-sm whitespace-pre-line">
            {item.body}
          </p>
        ),
        editLabel: "Edit",
        dialog: (props) => <TermsConditionDialog {...props} />,
      }}
    />
  );
}

const ALL = "all";

function materialDetails(item: MaterialItem): string {
  const parts = [
    item.uomName,
    item.categoryName,
    ITEM_TYPE_LABELS[item.itemType],
    item.unitRate == null
      ? null
      : `${formatMinor(item.unitRate)} / ${item.uomName}`,
    item.gstRate == null ? null : `GST ${Number(item.gstRate).toString()}%`,
    item.hsnCode == null ? null : `HSN ${item.hsnCode}`,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Masters → Materials (CM-501): filters by category and Item Type. */
export function MaterialsList() {
  const [categoryId, setCategoryId] = useState(ALL);
  const [itemType, setItemType] = useState(ALL);
  const { data: categories = [] } = useQuery(categoryOptionsQuery());
  const categoryItems = [
    { value: ALL, label: "All categories" },
    ...categories.map((category) => ({
      value: category.id,
      label: categoryPath(category),
    })),
  ];
  const typeItems = [
    { value: ALL, label: "All types" },
    ...Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ];
  return (
    <PagedMasterListScreen
      extra={{
        categoryId: categoryId === ALL ? undefined : categoryId,
        itemType: itemType === ALL ? undefined : itemType,
      }}
      filters={
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select
            items={categoryItems}
            value={categoryId}
            onValueChange={(value) => {
              if (value != null) setCategoryId(value);
            }}
          >
            <SelectTrigger
              aria-label="Material Category"
              className="w-full min-w-0 sm:w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {categoryItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={typeItems}
            value={itemType}
            onValueChange={(value) => {
              if (value != null) setItemType(value);
            }}
          >
            <SelectTrigger
              aria-label="Item Type"
              className="w-full min-w-0 sm:w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {typeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      screen={{
        list: "materials",
        singular: "Material",
        plural: "Materials",
        description:
          "What you buy and stock: unit, category, rate, GST, HSN and minimum stock.",
        icon: Package,
        emptyDescription:
          "Add the materials you buy, like Cement OPC 53 or TMT 12 mm.",
        deleteDescription:
          "It will no longer be offered anywhere. A Material on a Purchase Request, Purchase Order, Goods Receipt, transfer or with stock cannot be deleted; disable it instead.",
        searchLabel: "Search name, specification or HSN",
        name: (item) => item.name,
        details: (item) => (
          <p className="text-muted-foreground truncate text-sm">
            {item.specification == null ? "" : `${item.specification} · `}
            {materialDetails(item)}
          </p>
        ),
        editLabel: "Edit",
        pages: {
          newHref: "/app/masters/materials/new",
          editHref: (id) => `/app/masters/materials/${id}`,
        },
      }}
    />
  );
}
