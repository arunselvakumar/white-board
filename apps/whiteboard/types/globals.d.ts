import type { InstitutionType } from "../lib/institution-type";

export {};

declare global {
  // Clerk merges this interface; a type alias would not.
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging
  interface OrganizationPublicMetadata {
    institutionType?: InstitutionType;
    institutionTypeOther?: string;
  }
}
