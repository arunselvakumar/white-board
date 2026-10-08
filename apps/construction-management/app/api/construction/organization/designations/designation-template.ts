import { z } from "zod";

import {
  FLAGS,
  MENUS,
  MENU_CATEGORIES,
  fromMask,
  type PermissionGrants,
} from "@/src/shared-kernel/access";

const CATEGORY_LABELS = new Map<string, string>(
  MENU_CATEGORIES.map((category) => [category.key, category.label]),
);

const FlagsModel = z.array(z.enum(FLAGS));

/**
 * A Permission Template as `{ "<menu key>": ["create", "read", …] }` (ADR
 * CM-0003). Every menu of the catalogue is listed with the flags it
 * supports; an unknown menu key or flag is a 400 `VALIDATION_ERROR`. A flag
 * the menu does not support is accepted and dropped by `PermissionSet`, so
 * the stored template only ever holds cells the API checks. An empty
 * template (or `null`) means "no template".
 */
export const designationTemplateModel = z
  .strictObject(
    Object.fromEntries(
      MENUS.map((menu) => [
        menu.key,
        FlagsModel.optional().describe(
          `${menu.label} (${CATEGORY_LABELS.get(menu.category) ?? menu.category}). Supported: ${fromMask(menu.supported).join(", ")}.`,
        ),
      ]),
    ),
  )
  .describe(
    "Permission Template: menu key → flags. Unknown menu keys or flags are rejected; flags a menu does not support are dropped.",
  ) as unknown as z.ZodType<PermissionGrants>;
