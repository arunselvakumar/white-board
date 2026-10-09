import { configure } from "storybook/test";

// Story tests check behaviour, not motion. Popups (menus, dialogs,
// autocompletes) animate in and out: while a menu closes it ignores clicks
// (`pointer-events: none`), and while a popup opens it is still transparent.
// On a busy CI runner a play function lands in that window at random, so
// the browser that runs story tests skips every animation and transition.
const noMotion = document.createElement("style");
noMotion.textContent =
  "*, *::before, *::after { animation: none !important; transition: none !important; }";
document.head.append(noMotion);

// CI runs both apps' story tests at once on a small runner; a screen can take
// longer than Testing Library's default 1 s to appear.
configure({ asyncUtilTimeout: 5000 });
