import { BabyIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { ageInMonths, formatAge } from "@/src/preschool/domain/dates";
import type { PreschoolClassroomDetail } from "@/src/queries/preschool/classrooms";

const HEAD = "text-xs tracking-wide uppercase";

/** The Children with an active Admission in a Classroom. No fee data. */
export function RosterTable({
  roster,
  today,
}: {
  roster: PreschoolClassroomDetail["roster"];
  /** YYYY-MM-DD in India; ages are on this day. */
  today: string;
}) {
  if (roster.length === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={BabyIcon}
        tone="violet"
        title="No Children in this Classroom yet"
        description="Children join a Classroom when they are admitted."
        actions={
          <Button
            variant="outline"
            render={<Link href="/preschool/children" />}
          >
            Open Children
          </Button>
        }
      />
    );
  return (
    <div className="overflow-hidden rounded-xl border">
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            <TableHead className={`pl-4 ${HEAD}`}>Child</TableHead>
            <TableHead className={HEAD}>Admission no.</TableHead>
            <TableHead className={HEAD}>Age</TableHead>
            <TableHead className={`pr-4 ${HEAD}`}>Parent phone</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roster.map((child) => {
            const name = [child.firstName, child.lastName]
              .filter((part) => part != null && part !== "")
              .join(" ");
            return (
              <TableRow key={child.childId}>
                <TableCell className="pl-4 font-medium">
                  <Link
                    href={`/preschool/children/${child.childId}`}
                    className="hover:text-primary focus-visible:ring-ring/50 rounded-sm outline-none focus-visible:ring-3"
                  >
                    {name}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">
                  {child.admissionNumber}
                </TableCell>
                <TableCell>
                  {formatAge(ageInMonths(child.dateOfBirth, today))}
                </TableCell>
                <TableCell className="pr-4 tabular-nums">
                  {child.fatherPhone ?? child.motherPhone ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
