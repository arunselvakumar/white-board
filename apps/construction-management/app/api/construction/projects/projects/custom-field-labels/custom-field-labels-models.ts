import { z } from "zod";

/** Labels for the custom-field name picker (CM-413). */
export const ListConstructionProjectsCustomFieldLabelsResponseModel = z.object({
  items: z
    .array(z.string())
    .describe(
      "Labels used on the Company's live Projects, most used first, at most 50.",
    ),
});

export type ListConstructionProjectsCustomFieldLabelsResponseModel = z.infer<
  typeof ListConstructionProjectsCustomFieldLabelsResponseModel
>;
