import { can, type Flag, type MemberAccess } from "@/src/shared-kernel/access";
import type { ApprovalStatus } from "@/src/shared-kernel/approval";

/** Every Petty Cash right is on this menu (CM-0017 §14). */
export const PETTY_CASH_MENU = "finance.petty_cash" as const;

/**
 * Whether the member sees every petty-cash account and voucher (CM-0017
 * §9): the Owner, or Petty Cash View all. Without it a member sees only
 * the account they hold. It is also what lets a member move money through
 * someone else's account (`AccountActor.anyPettyCash`).
 */
export function seesEveryPettyCashAccount(access: MemberAccess): boolean {
  return can(access, PETTY_CASH_MENU, "view_all");
}

/** Whether the member may see this account (and its vouchers). */
export function seesPettyCashAccount(
  access: MemberAccess,
  account: { holderUserId: string | null },
): boolean {
  return (
    account.holderUserId === access.userId || seesEveryPettyCashAccount(access)
  );
}

/** Petty Cash `flag`, on the voucher's Project when it names one. */
export function canOnVoucher(
  access: MemberAccess,
  voucher: { projectId: string | null },
  flag: Flag,
): boolean {
  return can(
    access,
    PETTY_CASH_MENU,
    flag,
    voucher.projectId == null ? {} : { projectId: voucher.projectId },
  );
}

/**
 * Whether a member who sees the account also sees this voucher: a voucher
 * on a Project needs Read on that Project (the menu is project-scoped).
 */
export function seesVoucher(
  access: MemberAccess,
  voucher: { projectId: string | null },
): boolean {
  return canOnVoucher(access, voucher, "read");
}

export type VoucherActions = {
  edit: boolean;
  delete: boolean;
  approve: boolean;
  reject: boolean;
};

/**
 * What the viewer may do with a voucher (CM-0017 §4); screens hide the
 * rest, commands check again. Pending: edit, approve, reject, delete.
 * Rejected: edit (resubmits) and delete. Approved: edit (reverses its
 * entries and returns it to pending) and delete (reverses).
 */
export function voucherActions(
  access: MemberAccess,
  voucher: { projectId: string | null; approvalStatus: ApprovalStatus },
): VoucherActions {
  const pending = voucher.approvalStatus === "pending";
  return {
    edit: canOnVoucher(access, voucher, "update"),
    delete: canOnVoucher(access, voucher, "delete"),
    approve: pending && canOnVoucher(access, voucher, "approve"),
    reject: pending && canOnVoucher(access, voucher, "reject"),
  };
}
