export { CompanyAuthProvider, useCompanyAuthSnapshot } from "./provider";
export {
  useActiveCompany,
  useCompanyAuth,
  useCompanyEmailSignIn,
  useCompanyEmailSignUp,
  useCompanyList,
  useCompanyMobileOtp,
  useCompanyPasswordReset,
  useCompanySignOut,
  useCompanyUser,
} from "./hooks";
export { navigateInApp, type FetchStatus } from "../../react/hooks";
export type { AuthError, AuthResult } from "../../client";
export type { CompanyRole } from "../roles";
export {
  formatMobile,
  isPlaceholderEmail,
  isValidMobile,
  normalizeMobile,
} from "../mobile";
export type {
  CompanyAuthSnapshot,
  CompanyAuthUser,
  CompanySummary,
} from "../types";
