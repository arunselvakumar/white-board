/**
 * A 10-digit Indian mobile number from what was typed: spaces, dashes, a
 * leading 0 or +91 are dropped. Null when it is not one.
 */
export function indianMobileNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/**
 * A WhatsApp chat with a polite fee reminder filled in. Nothing is sent: the
 * link opens the chat and the Centre presses send. Null when the phone is not
 * an Indian mobile number.
 * @param dueText the amount as it should read, such as "₹12,500"
 */
export function whatsappReminderUrl(input: {
  phone: string;
  childName: string;
  dueText: string;
  centreName: string;
}): string | null {
  const mobile = indianMobileNumber(input.phone);
  if (mobile == null) return null;
  const text =
    `Dear Parent, this is a gentle reminder from ${input.centreName} that ` +
    `${input.dueText} is due towards ${input.childName}'s fees. ` +
    `Kindly pay at your earliest convenience. Thank you.`;
  return `https://wa.me/91${mobile}?text=${encodeURIComponent(text)}`;
}
