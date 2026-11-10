import { Skeleton } from "@repo/ui/components/skeleton";
import { SkeletonGroup, SkeletonText } from "@repo/ui/components/skeleton-kit";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { byCategory } from "@/lib/permission-matrix";
import { FLAGS, FLAG_LABELS, MENUS, hasFlag } from "@/src/shared-kernel/access";

/*
 * The Permission Matrix while the grants load (ADR-0047). Menus, categories
 * and flags are known in code, so they render for real; only the ticks are
 * bars.
 */

const stickyCell = "bg-card sticky left-0 z-10 w-56 min-w-56 pl-4";

export function PermissionMatrixSkeleton({
  label = "Loading permissions",
}: {
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className="block min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-full rounded-lg sm:max-w-xs" />
        <SkeletonText width="9rem" />
      </div>
      {byCategory(MENUS).map((category) => (
        <section
          key={category.key}
          className="bg-card overflow-hidden rounded-xl border"
        >
          <div className="bg-muted/40 flex flex-wrap items-center gap-3 px-4 py-1.5">
            <span className="flex h-8 items-center gap-2 pl-6 font-semibold">
              {category.label}
              <Skeleton className="h-5 w-7 rounded-full" />
            </span>
          </div>
          <Table className="min-w-[76rem] table-fixed border-t">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(stickyCell, "text-xs")}>
                  Menu
                </TableHead>
                {FLAGS.map((flag) => (
                  <TableHead
                    key={flag}
                    className="h-auto w-20 px-1 py-2 text-center align-top text-xs"
                  >
                    <span className="leading-tight whitespace-normal">
                      {FLAG_LABELS[flag]}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {category.menus.map((menu) => (
                <TableRow key={menu.key} className="hover:bg-transparent">
                  <TableHead
                    scope="row"
                    className={cn(stickyCell, "font-normal whitespace-normal")}
                  >
                    {menu.label}
                  </TableHead>
                  {FLAGS.map((flag) => (
                    <TableCell key={flag} className="w-20 text-center">
                      {hasFlag(menu.supported, flag) ? (
                        <Skeleton className="mx-auto size-4 rounded-[4px]" />
                      ) : null}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ))}
    </SkeletonGroup>
  );
}
