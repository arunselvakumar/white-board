import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionOrganizationBillingAddressResponseModel,
  CreateConstructionOrganizationBillingAddressRequestModel,
  ListConstructionOrganizationBillingAddressesResponseModel,
  UpdateConstructionOrganizationBillingAddressRequestModel,
} from "@/app/api/construction/organization/settings/billing-addresses/billing-address-models";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/settings/billing-addresses";

export type BillingAddressItem =
  ConstructionOrganizationBillingAddressResponseModel;

/** Every live billing address, the default first (a Company has a handful). */
export const billingAddressesQuery = queryOptions({
  queryKey: ["organization", "settings", "billing-addresses"],
  queryFn: () =>
    apiJson<ListConstructionOrganizationBillingAddressesResponseModel>(BASE),
});

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

const item = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export function createBillingAddress(
  input: CreateConstructionOrganizationBillingAddressRequestModel,
): Promise<BillingAddressItem> {
  return postJson(BASE, input);
}

export function updateBillingAddress(
  id: string,
  input: UpdateConstructionOrganizationBillingAddressRequestModel,
): Promise<BillingAddressItem> {
  return postJson(`${item(id)}/update`, input);
}

export function makeDefaultBillingAddress(
  id: string,
): Promise<BillingAddressItem> {
  return postJson(`${item(id)}/make-default`);
}

export function deleteBillingAddress(id: string): Promise<void> {
  return postJson(`${item(id)}/delete`);
}
