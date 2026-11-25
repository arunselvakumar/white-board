import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { formatPaiseAsRupees } from "@/lib/money";
import {
  childFullName,
  FEE_PAYMENT_METHOD_LABEL,
  feeDateLabel,
  feeReferenceLabel,
} from "@/lib/preschool-fees";
import type { PreschoolReceipt } from "@/src/queries/preschool/fees";

function Detail({ label, value }: { label: string; value: string | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

/** The printable Receipt for one Fee Payment. */
export function FeeReceipt({ receipt }: { receipt: PreschoolReceipt }) {
  const { centre, child } = receipt;
  const address = [
    centre.addressLine,
    centre.city,
    [centre.state, centre.pincode].filter(Boolean).join(" "),
  ]
    .filter((part) => part != null && part !== "")
    .join(", ");
  const referenceLabel = feeReferenceLabel(receipt.method);
  return (
    <article
      aria-label={`Fee Receipt ${receipt.receiptNumber}`}
      className="fee-receipt bg-card mx-auto flex w-full max-w-2xl flex-col gap-5 rounded-xl border p-6 text-sm"
    >
      <header className="flex flex-col items-center gap-1 border-b pb-4 text-center">
        <p className="text-lg font-semibold">{centre.name}</p>
        {address === "" ? null : (
          <p className="text-muted-foreground">{address}</p>
        )}
        {centre.phone == null ? null : (
          <p className="text-muted-foreground">Phone {centre.phone}</p>
        )}
        <h2 className="mt-2 text-base font-semibold tracking-wide uppercase">
          Fee Receipt
        </h2>
      </header>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Detail label="Receipt number" value={receipt.receiptNumber} />
        <Detail label="Date" value={feeDateLabel(receipt.receivedOn)} />
        <Detail label="Child" value={childFullName(child)} />
        <Detail label="Admission number" value={child.admissionNumber} />
        <Detail label="Classroom" value={child.classroomName} />
        <Detail label="Father" value={child.fatherName} />
        <Detail label="Mother" value={child.motherName} />
      </dl>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Towards</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {receipt.lines.map((line) => (
            <TableRow key={line.invoiceId}>
              <TableCell>{line.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPaiseAsRupees(line.amountPaise)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatPaiseAsRupees(receipt.amountPaise)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <p className="font-medium">{receipt.amountInWords}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Detail
          label="Paid by"
          value={FEE_PAYMENT_METHOD_LABEL[receipt.method]}
        />
        {referenceLabel == null ? null : (
          <Detail label={referenceLabel} value={receipt.reference} />
        )}
        <Detail label="Received by" value={receipt.receivedByName} />
        <Detail
          label="Balance due after this payment"
          value={formatPaiseAsRupees(receipt.balanceDuePaise)}
        />
      </dl>
      {receipt.note == null ? null : (
        <p className="text-muted-foreground">Note: {receipt.note}</p>
      )}
      <p className="text-muted-foreground border-t pt-3 text-center text-xs">
        This is a computer-generated receipt.
      </p>
    </article>
  );
}
