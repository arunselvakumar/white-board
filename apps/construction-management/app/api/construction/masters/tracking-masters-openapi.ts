import { StatusCodes } from "http-status-codes";

import type {
  OpenApiComponents,
  OpenApiOperation,
} from "@/app/api/_lib/openapi";

import {
  ConstructionMastersIssueCategoryResponseModel,
  CreateConstructionMastersIssueCategoryRequestModel,
  ListConstructionMastersIssueCategoriesResponseModel,
  UpdateConstructionMastersIssueCategoryRequestModel,
} from "./issue-categories/issue-category-models";
import { WRITE, masterOperations } from "./masters-openapi";
import {
  ConstructionMastersTagResponseModel,
  CreateConstructionMastersTagRequestModel,
  ListConstructionMastersTagsResponseModel,
  UpdateConstructionMastersTagRequestModel,
} from "./tags/tag-models";

const BASE = "/api/construction/masters";

/** Issue Categories' and Tags' models (CM-801). */
export const trackingMastersOpenApiComponents: OpenApiComponents = {
  ConstructionMastersIssueCategoryResponseModel,
  ListConstructionMastersIssueCategoriesResponseModel,
  CreateConstructionMastersIssueCategoryRequestModel,
  UpdateConstructionMastersIssueCategoryRequestModel,
  ConstructionMastersTagResponseModel,
  ListConstructionMastersTagsResponseModel,
  CreateConstructionMastersTagRequestModel,
  UpdateConstructionMastersTagRequestModel,
};

const issueCategories = masterOperations({
  path: `${BASE}/issue-categories`,
  label: "Issue Category",
  plural: "Issue Categories",
  menu: "masters.issue_categories",
  inUse: "Seeds too. 409 ISSUE_CATEGORY_IN_USE while a live issue names it.",
  list: ListConstructionMastersIssueCategoriesResponseModel,
  item: ConstructionMastersIssueCategoryResponseModel,
  create: CreateConstructionMastersIssueCategoryRequestModel,
  update: UpdateConstructionMastersIssueCategoryRequestModel,
});

/** Tags are never disabled: no disable / enable; an inline `ensure`. */
const tags = masterOperations({
  path: `${BASE}/tags`,
  label: "Tag",
  plural: "Tags",
  menu: "masters.tags",
  inUse: "409 TAG_IN_USE while a live task carries it.",
  list: ListConstructionMastersTagsResponseModel,
  item: ConstructionMastersTagResponseModel,
  create: CreateConstructionMastersTagRequestModel,
  update: UpdateConstructionMastersTagRequestModel,
}).filter(
  (operation) =>
    !operation.path.endsWith("/disable") && !operation.path.endsWith("/enable"),
);

/** Issue Categories and Tags (CM-801, ADR CM-0019 §1). */
export const trackingMastersOpenApiOperations: OpenApiOperation[] = [
  ...issueCategories,
  ...tags,
  {
    method: "post",
    path: `${BASE}/tags/ensure`,
    summary:
      "The Task form's inline tag create (menu `masters.tags`, create): the live Tag of this name ignoring case (200), or a new one (201)",
    tags: ["Construction · Masters"],
    body: CreateConstructionMastersTagRequestModel,
    successStatus: StatusCodes.CREATED,
    successDescription: "The Tag (200 when it already existed)",
    successSchema: ConstructionMastersTagResponseModel,
    errors: [...WRITE],
  },
];
