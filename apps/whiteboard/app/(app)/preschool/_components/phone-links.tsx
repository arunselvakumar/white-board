import { Phone } from "lucide-react";

/** "98400 12345" for a stored 10-digit number; anything else as stored. */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone)
    ? `${phone.slice(0, 5)} ${phone.slice(5)}`
    : phone;
}

/**
 * A phone number as a `tel:` link with a WhatsApp link beside it. WhatsApp
 * is offered only for a 10-digit Indian mobile number.
 */
export function PhoneLinks({
  phone,
  label,
}: {
  phone: string;
  /** Whose number it is, for screen readers: "Ravi Kumar". */
  label?: string;
}) {
  const mobile = /^\d{10}$/.test(phone);
  const who = label == null ? "" : ` ${label}`;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <a
        href={`tel:${mobile ? `+91${phone}` : phone}`}
        className="text-foreground inline-flex items-center gap-1 tabular-nums underline-offset-4 hover:underline"
        aria-label={`Call${who} on ${formatPhone(phone)}`}
      >
        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
        {formatPhone(phone)}
      </a>
      {mobile ? (
        <a
          href={`https://wa.me/91${phone}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300"
          aria-label={`WhatsApp${who}`}
        >
          WhatsApp
        </a>
      ) : null}
    </span>
  );
}
