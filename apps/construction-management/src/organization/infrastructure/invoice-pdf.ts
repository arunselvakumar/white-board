import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import { gstStateName } from "@/src/shared-kernel/gst-states";
import { formatMinor } from "@/src/shared-kernel/money";

import { GST_RATE_PERCENT } from "../domain/checkout";
import type { SubscriptionOrder } from "../domain/subscription-order";

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.4, 0.4, 0.45);

/** Standard PDF fonts are WinAnsi: no ₹ and no Indian scripts. */
function printable(value: string): string {
  return value
    .replace(/\u20b9/g, "Rs. ")
    .replace(/\s/g, " ")
    .replace(/[^\x20-\x7e]/g, "?");
}

function rupees(paise: number, currency: string): string {
  return printable(formatMinor(paise, currency));
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

function state(code: string): string {
  return `${gstStateName(code) ?? "Unknown"} (${code})`;
}

class Writer {
  y = A4.height - MARGIN;

  constructor(
    private readonly page: PDFPage,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {}

  text(
    value: string,
    options: {
      x?: number;
      size?: number;
      bold?: boolean;
      muted?: boolean;
      right?: number;
    } = {},
  ) {
    const size = options.size ?? 10;
    const font = options.bold === true ? this.bold : this.regular;
    const content = printable(value);
    const x =
      options.right == null
        ? (options.x ?? MARGIN)
        : options.right - font.widthOfTextAtSize(content, size);
    this.page.drawText(content, {
      x,
      y: this.y,
      size,
      font,
      color: options.muted === true ? MUTED : INK,
    });
  }

  lines(
    values: string[],
    options: { x?: number; size?: number; muted?: boolean } = {},
  ) {
    for (const value of values.flatMap((item) => item.split("\n"))) {
      this.text(value, options);
      this.down((options.size ?? 10) + 4);
    }
  }

  down(by: number) {
    this.y -= by;
  }

  rule() {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: MUTED,
    });
  }
}

/** The tax invoice for a paid subscription order (CM-117). */
export async function renderInvoicePdf(
  order: SubscriptionOrder,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Tax invoice ${order.invoiceNumber ?? order.id}`);
  pdf.setCreator("Construction Management");
  const page = pdf.addPage([A4.width, A4.height]);
  const w = new Writer(
    page,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
  );
  const right = A4.width - MARGIN;
  const { quote, billing, seller } = order;
  const money = (paise: number) => rupees(paise, quote.currency);

  w.text("Tax invoice", { size: 18, bold: true });
  w.text(order.invoiceNumber ?? "", { right, size: 12, bold: true });
  w.down(16);
  w.text(
    `Date: ${order.paidAt == null ? "" : dateFormat.format(order.paidAt)}`,
    { right, muted: true },
  );
  w.down(24);

  const top = w.y;
  w.text("From", { bold: true });
  w.down(14);
  w.lines([
    seller.name,
    seller.address,
    `State: ${state(seller.stateCode)}`,
    `GSTIN: ${seller.gstin ?? "not registered"}`,
  ]);
  const afterSeller = w.y;
  w.y = top;
  const billX = A4.width / 2;
  w.text("Bill to", { x: billX, bold: true });
  w.down(14);
  w.lines(
    [
      billing.name,
      billing.address,
      `State: ${state(billing.stateCode)}`,
      `GSTIN: ${billing.gstin ?? "not given"}`,
    ],
    { x: billX },
  );
  w.y = Math.min(afterSeller, w.y) - 8;
  w.lines(
    [
      `Place of supply: ${state(billing.stateCode)}`,
      `Order: ${order.id}   Payment: ${order.gatewayPaymentId ?? ""}`,
    ],
    { muted: true },
  );
  w.down(10);

  const columns = { sac: 300, rate: 400, qty: 450, amount: right };
  w.rule();
  w.down(14);
  w.text("Description", { bold: true });
  w.text("SAC", { x: columns.sac, bold: true });
  w.text("Rate", { right: columns.rate + 30, bold: true });
  w.text("Qty", { right: columns.qty + 20, bold: true });
  w.text("Amount", { right: columns.amount, bold: true });
  w.down(8);
  w.rule();
  w.down(14);
  for (const line of quote.lines) {
    const period =
      line.months == null
        ? `${String(line.days ?? 0)} days`
        : `${String(line.months)} months`;
    w.text(`${line.description} (${period})`);
    w.text(seller.sacCode, { x: columns.sac });
    w.text(money(line.rate), { right: columns.rate + 30 });
    w.text(String(line.quantity), { right: columns.qty + 20 });
    w.text(money(line.amount), { right: columns.amount });
    w.down(16);
  }
  w.rule();
  w.down(16);

  const totals: [string, number][] = [["Sub Total", quote.subTotal]];
  if (quote.lastPlanDiscount > 0)
    totals.push(["Last Plan Discount", -quote.lastPlanDiscount]);
  totals.push(["Taxable value", quote.taxableAmount]);
  if (quote.tax.igst > 0)
    totals.push([`IGST ${String(GST_RATE_PERCENT)}%`, quote.tax.igst]);
  else {
    totals.push([`CGST ${String(GST_RATE_PERCENT / 2)}%`, quote.tax.cgst]);
    totals.push([`SGST ${String(GST_RATE_PERCENT / 2)}%`, quote.tax.sgst]);
  }
  for (const [label, amount] of totals) {
    w.text(label, { x: columns.qty - 100 });
    w.text(money(amount), { right });
    w.down(16);
  }
  w.text("Total", { x: columns.qty - 100, bold: true, size: 12 });
  w.text(money(quote.total), { right, bold: true, size: 12 });
  w.down(36);
  w.lines(
    [
      "Paid online through Razorpay. This is a computer-generated invoice and needs no signature.",
    ],
    { muted: true, size: 9 },
  );

  return pdf.save();
}
