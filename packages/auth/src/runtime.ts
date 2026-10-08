/**
 * Whether this process serves real users. A Vercel preview runs with
 * NODE_ENV=production but on its own data, so development conveniences
 * (codes in the logs, the OTP test code) may run there.
 */
export function isLiveProduction(): boolean {
  return (
    process.env["NODE_ENV"] === "production" &&
    process.env["VERCEL_ENV"] !== "preview"
  );
}
