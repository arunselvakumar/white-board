import { preconnect } from "react-dom";

/**
 * Satoshi (Indian Type Foundry) as one variable font, weights 300–900.
 * Its licence lets us load it from Fontshare's servers but not commit the
 * font files to this public repository (ADR-0042).
 */
const SATOSHI_STYLESHEET =
  "https://api.fontshare.com/v2/css?f[]=satoshi@1&display=swap";

/**
 * Loads Satoshi. Render it once in the root layout and put the
 * `typeface-satoshi` class on `<html>` so `font-sans` uses it.
 */
function SatoshiStylesheet() {
  preconnect("https://cdn.fontshare.com", { crossOrigin: "anonymous" });
  return <link rel="stylesheet" href={SATOSHI_STYLESHEET} precedence="font" />;
}

export { SatoshiStylesheet };
