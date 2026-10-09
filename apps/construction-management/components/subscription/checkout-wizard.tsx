"use client";

import { useCompanyUser } from "@repo/auth/construction/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CheckCircle2, CreditCard } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";

import { PageHeader } from "@/components/app-shell/page-header";
import { FieldError } from "@/components/auth/field-error";
import { FormAlert } from "@/components/auth/form-alert";
import { loadRazorpayCheckout } from "@/lib/razorpay-checkout";
import { fieldForCode } from "@/lib/server-errors";
import {
  plansQuery,
  quoteCheckout,
  startCheckout,
  subscriptionQuery,
  verifyCheckout,
  type PlansView,
  type QuoteView,
  type SubscriptionView,
} from "@/src/queries/subscription";
import { GST_STATES } from "@/src/shared-kernel/gst-states";
import { formatMinor } from "@/src/shared-kernel/money";
import { PLAN_GRANTS, type PlanGrant } from "@/src/shared-kernel/plan";
import { isValidGstin } from "@/src/shared-kernel/tax-ids";

import { daysLeftText, longDate } from "./subscription-text";

export type CheckoutKind = "new" | "extend" | "upgrade" | "add_ons";
type StepKey = "plan" | "duration" | "addons" | "buyer" | "review";

const STEPS: Record<CheckoutKind, StepKey[]> = {
  new: ["plan", "duration", "addons", "buyer", "review"],
  upgrade: ["plan", "duration", "addons", "buyer", "review"],
  extend: ["duration", "buyer", "review"],
  add_ons: ["addons", "buyer", "review"],
};

const STEP_TITLES: Record<StepKey, string> = {
  plan: "Plan",
  duration: "Duration",
  addons: "Add-ons",
  buyer: "Buyer details",
  review: "Review and pay",
};

const TITLES: Record<CheckoutKind, string> = {
  new: "Choose a plan",
  upgrade: "Change plan",
  extend: "Extend your plan",
  add_ons: "Buy add-ons",
};

const BACK = { label: "Your Subscription", href: "/app/subscription" };

const STATE_ITEMS = GST_STATES.map((state) => ({
  value: state.code,
  label: state.name,
}));

const schema = z
  .object({
    planCode: z.string().min(1, "Choose a plan"),
    months: z.string().min(1, "Choose a duration"),
    addOns: z.object({
      project: z.string(),
      team_member: z.string(),
      hrms_member: z.string(),
      storage_gb: z.string(),
    }),
    name: z
      .string()
      .trim()
      .min(1, "Enter the billing name")
      .max(120, "Use at most 120 characters"),
    address: z
      .string()
      .trim()
      .min(1, "Enter the billing address")
      .max(500, "Use at most 500 characters"),
    stateCode: z.string().regex(/^\d{2}$/, "Choose the state"),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => value === "" || isValidGstin(value), {
        message: "Enter a valid 15-character GSTIN",
      }),
  })
  .refine(
    (values) =>
      values.gstin === "" || values.gstin.slice(0, 2) === values.stateCode,
    { path: ["gstin"], message: "The GSTIN belongs to a different state" },
  );

type Values = z.infer<typeof schema>;

const SERVER_FIELDS: Record<string, keyof Values> = {
  BILLING_NAME_INVALID: "name",
  BILLING_ADDRESS_INVALID: "address",
  BILLING_STATE_INVALID: "stateCode",
  GSTIN_INVALID: "gstin",
  GSTIN_STATE_MISMATCH: "gstin",
};

/** Which checkout a status allows: a new plan when none is running (none yet, or ended). */
export function resolveKind(
  status: SubscriptionView["status"],
  requested: string | null | undefined,
): CheckoutKind {
  if (status !== "active") return "new";
  if (requested === "upgrade" || requested === "add_ons") return requested;
  return "extend";
}

function money(paise: number, currency = "INR") {
  return formatMinor(paise, currency);
}

function quantities(
  values: Values["addOns"],
): Partial<Record<PlanGrant, number>> {
  const result: Partial<Record<PlanGrant, number>> = {};
  for (const grant of PLAN_GRANTS) {
    const value = Number(values[grant] === "" ? 0 : values[grant]);
    if (value > 0) result[grant] = value;
  }
  return result;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">{children}</div>
    </div>
  );
}

/** The checkout wizard (CM-117): plan → duration → add-ons → buyer → review and pay. */
export function CheckoutWizard({ kind: requested }: { kind?: string | null }) {
  const { data: subscription } = useSuspenseQuery(subscriptionQuery);

  if (!subscription.canManage)
    return (
      <Centered>
        <PageHeader back={BACK} title="Choose a plan" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Only the Owner can buy or change the plan</EmptyTitle>
            <EmptyDescription>
              Ask the Owner of this Company to renew or upgrade.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Centered>
    );

  if (subscription.owner?.paymentsConfigured !== true)
    return (
      <Centered>
        <PageHeader back={BACK} title="Choose a plan" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CreditCard aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Payments are not configured</EmptyTitle>
            <EmptyDescription>
              Online payment is not set up on this server yet, so plans cannot
              be bought here. Your data is not affected.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Centered>
    );

  return (
    <CheckoutForm
      subscription={subscription}
      kind={resolveKind(subscription.status, requested)}
    />
  );
}

function CheckoutForm({
  subscription,
  kind,
}: {
  subscription: SubscriptionView;
  kind: CheckoutKind;
}) {
  const { data: catalogue } = useSuspenseQuery(plansQuery);
  const { user } = useCompanyUser();
  const queryClient = useQueryClient();
  const steps = STEPS[kind];
  const [step, setStep] = useState(0);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [paid, setPaid] = useState<{ invoiceNumber: string | null } | null>(
    null,
  );
  const [paying, setPaying] = useState(false);

  const currentPlan = catalogue.plans.find(
    (plan) => plan.code === subscription.plan?.code,
  );
  const offered =
    kind === "upgrade"
      ? catalogue.plans.filter((plan) => plan.rank >= (currentPlan?.rank ?? 0))
      : catalogue.plans;
  const startPlan =
    kind === "new" ? (offered[0] ?? currentPlan) : (currentPlan ?? offered[0]);
  const billing = subscription.owner?.lastBillingAddress;
  const running = Object.fromEntries(
    subscription.addOns.map((addOn) => [addOn.grant, String(addOn.quantity)]),
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      planCode: startPlan?.code ?? "",
      months: String(startPlan?.durations[0]?.months ?? ""),
      addOns: {
        project: kind === "upgrade" ? (running["project"] ?? "") : "",
        team_member: kind === "upgrade" ? (running["team_member"] ?? "") : "",
        hrms_member: kind === "upgrade" ? (running["hrms_member"] ?? "") : "",
        storage_gb: kind === "upgrade" ? (running["storage_gb"] ?? "") : "",
      },
      name: billing?.name ?? "",
      address: billing?.address ?? "",
      stateCode: billing?.stateCode ?? "",
      gstin: billing?.gstin ?? "",
    },
  });

  const quoting = useMutation({ mutationFn: quoteCheckout });

  const choice = (values: Values) => ({
    kind,
    planCode: kind === "new" || kind === "upgrade" ? values.planCode : null,
    months: kind === "add_ons" ? null : Number(values.months),
    addOns: kind === "extend" ? {} : quantities(values.addOns),
  });

  const checkAddOns = (): boolean => {
    const values = form.getValues("addOns");
    let ok = true;
    for (const addOn of catalogue.addOns) {
      const raw = values[addOn.grant].trim();
      const value = raw === "" ? 0 : Number(raw);
      if (
        !Number.isInteger(value) ||
        (value !== 0 && (value < addOn.minimumQuantity || value > 500))
      ) {
        form.setError(`addOns.${addOn.grant}`, {
          message: `Enter 0 or a whole number from ${String(addOn.minimumQuantity)} to 500`,
        });
        ok = false;
      }
    }
    if (
      ok &&
      kind === "add_ons" &&
      Object.keys(quantities(values)).length === 0
    ) {
      form.setError("root", { message: "Choose at least one add-on." });
      ok = false;
    }
    return ok;
  };

  const goTo = async (next: number) => {
    form.clearErrors("root");
    const current = steps[step];
    if (next > step) {
      if (current === "plan" && !(await form.trigger("planCode"))) return;
      if (current === "duration" && !(await form.trigger("months"))) return;
      if (current === "addons" && !checkAddOns()) return;
      if (
        current === "buyer" &&
        !(await form.trigger(["name", "address", "stateCode", "gstin"]))
      )
        return;
    }
    if (steps[next] === "review") {
      setQuote(null);
      try {
        const values = form.getValues();
        setQuote(
          await quoting.mutateAsync({
            ...choice(values),
            stateCode: values.stateCode,
          }),
        );
      } catch (error) {
        form.setError("root", { message: fieldForCode(error, {}).message });
        return;
      }
    }
    setStep(next);
  };

  const pay = async (values: Values) => {
    form.clearErrors("root");
    setPaying(true);
    try {
      const started = await startCheckout({
        ...choice(values),
        billingAddress: {
          name: values.name,
          address: values.address,
          stateCode: values.stateCode,
          gstin: values.gstin === "" ? null : values.gstin,
        },
      });
      const Razorpay = await loadRazorpayCheckout();
      const checkout = new Razorpay({
        key: started.razorpay.keyId,
        order_id: started.razorpay.orderId,
        amount: started.razorpay.amountPaise,
        currency: started.razorpay.currency,
        name: "Construction Management",
        description: `${TITLES[kind]}: ${started.quote.planName}`,
        prefill: {
          name: values.name,
          ...(user?.email == null ? {} : { email: user.email }),
          ...(user?.phoneNumber == null ? {} : { contact: user.phoneNumber }),
        },
        handler: (response) => {
          void verifyCheckout({
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          })
            .then(async (verified) => {
              setPaid({ invoiceNumber: verified.invoiceNumber });
              await queryClient.invalidateQueries({
                queryKey: ["organization", "subscription"],
              });
            })
            .catch((error: unknown) => {
              form.setError("root", {
                message: fieldForCode(error, {}).message,
              });
            })
            .finally(() => {
              setPaying(false);
            });
        },
        modal: {
          ondismiss: () => {
            setPaying(false);
            form.setError("root", {
              message: "Payment was cancelled. Nothing was charged.",
            });
          },
        },
      });
      checkout.on("payment.failed", (response) => {
        form.setError("root", {
          message:
            response.error.description ??
            "The payment failed. Try again or use another method.",
        });
      });
      checkout.open();
    } catch (error) {
      setPaying(false);
      const { field, message } = fieldForCode(error, SERVER_FIELDS);
      if (field == null) form.setError("root", { message });
      else {
        form.setError(field, { message });
        setStep(steps.indexOf("buyer"));
      }
    }
  };

  if (paid != null)
    return (
      <Centered>
        <div className="mx-auto max-w-md space-y-6 py-10 text-center">
          <CheckCircle2
            aria-hidden="true"
            className="text-primary mx-auto size-12"
          />
          <h1 className="text-2xl font-semibold">Payment received</h1>
          <p className="text-muted-foreground">
            Your plan is updated.
            {paid.invoiceNumber == null
              ? " Your invoice will appear shortly."
              : ` Invoice ${paid.invoiceNumber} is on Your Subscription.`}
          </p>
          <Link href="/app/subscription" className={buttonVariants()}>
            Back to Your Subscription
          </Link>
        </div>
      </Centered>
    );

  const stepKey = steps[step] ?? "review";
  const last = stepKey === "review";
  const errors = form.formState.errors;

  return (
    <Centered>
      <PageHeader
        back={BACK}
        title={TITLES[kind]}
        meta={
          kind === "new"
            ? "Prices are before GST, which is added at checkout."
            : subscription.plan == null
              ? null
              : `${subscription.plan.name} plan · ends on ${longDate.format(new Date(subscription.plan.endsAt))} · ${daysLeftText(subscription.plan.daysLeft)}`
        }
      />
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          Step {step + 1} of {steps.length} · {STEP_TITLES[stepKey]}
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              key={item}
              className={`h-1 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
      </div>

      <form
        noValidate
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (last) void form.handleSubmit(pay)(event);
          else void goTo(step + 1);
        }}
      >
        {stepKey === "plan" && <PlanStep form={form} plans={offered} />}
        {stepKey === "duration" && (
          <DurationStep form={form} catalogue={catalogue} kind={kind} />
        )}
        {stepKey === "addons" && (
          <AddOnsStep
            form={form}
            catalogue={catalogue}
            kind={kind}
            daysLeft={subscription.plan?.daysLeft ?? 0}
          />
        )}
        {stepKey === "buyer" && <BuyerStep form={form} />}
        {stepKey === "review" && quote != null && <ReviewStep quote={quote} />}

        <FormAlert message={errors.root?.message} />

        <div className="flex flex-wrap justify-between gap-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              disabled={paying}
              onClick={() => {
                void goTo(step - 1);
              }}
            >
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={paying || quoting.isPending}>
            {last
              ? paying
                ? "Opening payment…"
                : `Pay ${quote == null ? "" : money(quote.totalPaise, quote.currency)}`
              : "Continue"}
          </Button>
        </div>
      </form>
    </Centered>
  );
}

type StepProps = { form: UseFormReturn<Values> };

function ChoiceCard({
  id,
  value,
  title,
  detail,
}: {
  id: string;
  value: string;
  title: string;
  detail: string;
}) {
  return (
    <Label
      htmlFor={id}
      className="has-data-checked:border-primary has-data-checked:bg-primary/5 hover:border-primary/60 flex cursor-pointer items-start gap-3 rounded-xl border p-4 font-normal"
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="min-w-0 space-y-1">
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{detail}</span>
      </span>
    </Label>
  );
}

function includesText(includes: PlansView["plans"][number]["includes"]) {
  return `${String(includes.project)} Projects · ${String(includes.team_member)} Team Members · ${String(includes.hrms_member)} HRMS Team Members · ${String(includes.storage_gb)} GB storage`;
}

function PlanStep({ form, plans }: StepProps & { plans: PlansView["plans"] }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-lg font-semibold">Choose a plan</legend>
      <Controller
        name="planCode"
        control={form.control}
        render={({ field }) => (
          <RadioGroup
            value={field.value}
            onValueChange={(value) => {
              field.onChange(value);
              const plan = plans.find((item) => item.code === value);
              form.setValue("months", String(plan?.durations[0]?.months ?? ""));
            }}
            aria-label="Plans"
            className="grid gap-3 sm:grid-cols-2"
          >
            {plans.map((plan) => (
              <ChoiceCard
                key={plan.code}
                id={`plan-${plan.code}`}
                value={plan.code}
                title={plan.name}
                detail={includesText(plan.includes)}
              />
            ))}
          </RadioGroup>
        )}
      />
      <FieldError message={form.formState.errors.planCode?.message} />
    </fieldset>
  );
}

function DurationStep({
  form,
  catalogue,
  kind,
}: StepProps & { catalogue: PlansView; kind: CheckoutKind }) {
  const plan = catalogue.plans.find(
    (item) => item.code === form.getValues("planCode"),
  );
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-lg font-semibold">
        {kind === "extend" ? "Add how long?" : "For how long?"}
      </legend>
      <Controller
        name="months"
        control={form.control}
        render={({ field }) => (
          <RadioGroup
            value={field.value}
            onValueChange={field.onChange}
            aria-label="Durations"
            className="grid gap-3 sm:grid-cols-2"
          >
            {(plan?.durations ?? []).map((duration) => (
              <ChoiceCard
                key={duration.months}
                id={`months-${String(duration.months)}`}
                value={String(duration.months)}
                title={`${String(duration.months)} months`}
                detail={`${money(duration.pricePaise, catalogue.currency)} + ${String(catalogue.gstRatePercent)}% GST`}
              />
            ))}
          </RadioGroup>
        )}
      />
      {kind === "extend" ? (
        <p className="text-muted-foreground text-sm">
          The months are added after your current end date. Your add-ons are
          renewed for the same months.
        </p>
      ) : null}
      <FieldError message={form.formState.errors.months?.message} />
    </fieldset>
  );
}

function AddOnsStep({
  form,
  catalogue,
  kind,
  daysLeft,
}: StepProps & { catalogue: PlansView; kind: CheckoutKind; daysLeft: number }) {
  const errors = form.formState.errors.addOns;
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-lg font-semibold">Add-ons</legend>
      <p className="text-muted-foreground text-sm">
        {kind === "add_ons"
          ? `Charged per unit per month, for the ${daysLeftText(daysLeft)} on your plan.`
          : "Optional. Charged per unit per month for every month of the plan."}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {catalogue.addOns.map((addOn) => {
          const id = `add-on-${addOn.grant}`;
          return (
            <div key={addOn.grant} className="space-y-1.5">
              <Label htmlFor={id}>{addOn.name}</Label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={0}
                max={500}
                placeholder="0"
                className="h-10"
                aria-describedby={`${id}-help`}
                {...form.register(`addOns.${addOn.grant}`)}
              />
              <p id={`${id}-help`} className="text-muted-foreground text-xs">
                {money(addOn.pricePerUnitPerMonthPaise, catalogue.currency)} per
                unit per month · minimum {String(addOn.minimumQuantity)}
              </p>
              <FieldError message={errors?.[addOn.grant]?.message} />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function BuyerStep({ form }: StepProps) {
  const errors = form.formState.errors;
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-lg font-semibold">Buyer details</legend>
      <p className="text-muted-foreground text-sm">
        Printed on your tax invoice. Add your GSTIN to claim input tax credit.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="billing-name">Billing name</Label>
          <Input
            id="billing-name"
            className="h-10"
            placeholder="Anugraha Engineers"
            {...form.register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="billing-address">Billing address</Label>
          <Textarea
            id="billing-address"
            rows={3}
            placeholder="Plot 4, Avinashi Road, Coimbatore 641018"
            {...form.register("address")}
          />
          <FieldError message={errors.address?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-state">State</Label>
          <Controller
            name="stateCode"
            control={form.control}
            render={({ field }) => (
              <Select
                items={STATE_ITEMS}
                value={field.value === "" ? null : field.value}
                onValueChange={(value) => {
                  if (value != null) field.onChange(value);
                }}
              >
                <SelectTrigger
                  id="billing-state"
                  size="lg"
                  className="w-full min-w-0"
                >
                  <SelectValue placeholder="Choose the state" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  aria-label="States"
                >
                  {STATE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError message={errors.stateCode?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="billing-gstin">GSTIN (optional)</Label>
          <Input
            id="billing-gstin"
            className="h-10 uppercase"
            placeholder="33AAPFA0939F1ZM"
            maxLength={15}
            {...form.register("gstin")}
          />
          <FieldError message={errors.gstin?.message} />
        </div>
      </div>
    </fieldset>
  );
}

function ReviewStep({ quote }: { quote: QuoteView }) {
  const rows: [string, number][] = [["Sub Total", quote.subTotalPaise]];
  if (quote.lastPlanDiscountPaise > 0)
    rows.push(["Last Plan Discount", -quote.lastPlanDiscountPaise]);
  if (quote.igstPaise > 0) rows.push(["IGST 18%", quote.igstPaise]);
  else {
    rows.push(["CGST 9%", quote.cgstPaise]);
    rows.push(["SGST 9%", quote.sgstPaise]);
  }
  return (
    <section aria-labelledby="review-heading" className="space-y-3">
      <h2 id="review-heading" className="text-lg font-semibold">
        Order summary
      </h2>
      <p className="text-muted-foreground text-sm">
        {quote.planName} plan from {longDate.format(new Date(quote.startsAt))}{" "}
        to {longDate.format(new Date(quote.endsAt))}.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quote.lines.map((line) => (
            <TableRow key={line.item}>
              <TableCell className="whitespace-normal">
                {line.description}
                <span className="text-muted-foreground block text-xs">
                  {line.months == null
                    ? `${String(line.days ?? 0)} days`
                    : `${String(line.months)} months`}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.ratePaise, quote.currency)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.quantity}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(line.amountPaise, quote.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          {rows.map(([label, amount]) => (
            <TableRow key={label}>
              <TableCell colSpan={3}>{label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {money(amount, quote.currency)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell colSpan={3} className="font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {money(quote.totalPaise, quote.currency)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}
