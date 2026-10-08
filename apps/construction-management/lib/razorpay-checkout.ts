/**
 * Razorpay Checkout in the browser (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/).
 * The script is loaded only by the checkout page, on Pay.
 */
export const RAZORPAY_CHECKOUT_SRC =
  "https://checkout.razorpay.com/v1/checkout.js";

export type RazorpaySuccess = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
};

export type RazorpayInstance = {
  open(): void;
  on(
    event: "payment.failed",
    callback: (response: { error: { description?: string } }) => void,
  ): void;
};

export type RazorpayConstructor = new (
  options: RazorpayOptions,
) => RazorpayInstance;

type RazorpayWindow = { Razorpay?: RazorpayConstructor };

/** Where checkout.js puts its constructor (stories put a fake there). */
export function razorpayWindow(): RazorpayWindow {
  return window as unknown as RazorpayWindow;
}

let loading: Promise<RazorpayConstructor> | null = null;

export function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  const existing = razorpayWindow().Razorpay;
  if (existing != null) return Promise.resolve(existing);
  loading ??= new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      const loaded = razorpayWindow().Razorpay;
      if (loaded != null) resolve(loaded);
      else reject(new Error("Razorpay Checkout did not load."));
    };
    script.onerror = () => {
      loading = null;
      reject(new Error("Razorpay Checkout did not load."));
    };
    document.body.appendChild(script);
  });
  return loading;
}
