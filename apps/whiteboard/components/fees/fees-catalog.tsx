"use client";

import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { formatPaiseAsRupees } from "@/lib/money";

export type FeeDueRow = {
  id: string;
  studentName: string;
  batchName: string;
  remainingDuesPaise: number;
};

export function FeesCatalog({
  dues,
  onCollect,
  onOpenStudents,
}: {
  dues: FeeDueRow[];
  onCollect: (id: string) => void;
  onOpenStudents: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <h1 className="text-2xl tracking-tight">Fees</h1>
      {dues.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyDescription>
              Remaining dues will show here after an Enrollment has a Fee Plan.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" onClick={onOpenStudents}>
              Open Students
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>Remaining dues</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dues.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.studentName}</TableCell>
                <TableCell>{row.batchName}</TableCell>
                <TableCell>
                  {formatPaiseAsRupees(row.remainingDuesPaise)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onCollect(row.id);
                    }}
                  >
                    Collect
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
