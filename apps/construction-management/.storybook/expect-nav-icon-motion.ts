import { expect } from "storybook/test";

/**
 * The Lucide icon names (`house` for `.lucide-house`) that the page's
 * stylesheets name in a rule: `@repo/ui`'s sidebar-icon-motion.css gives
 * each nav icon its own hover motion (#114) by that class.
 */
function iconsNamedInStylesheets(doc: Document): Set<string> {
  const names = new Set<string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule) {
        for (const match of rule.selectorText.matchAll(/\.lucide-([\w-]+)/g)) {
          if (match[1] != null) names.add(match[1]);
        }
      }
      if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of doc.styleSheets) {
    // A stylesheet from another origin (a web font's) cannot be read.
    if (
      sheet.href != null &&
      new URL(sheet.href).origin !== doc.location.origin
    )
      continue;
    visit(sheet.cssRules);
  }
  return names;
}

/**
 * Every menu button under `root` leads with an icon that has a hover
 * motion of its own, not just the default lift that any other icon gets.
 * Story tests run without motion, so this checks the rules rather than the
 * animation.
 */
export async function expectNavIconMotion(root: HTMLElement): Promise<void> {
  const named = iconsNamedInStylesheets(root.ownerDocument);
  const icons = [
    ...root.querySelectorAll<SVGSVGElement>("[data-sidebar=menu-button] > svg"),
  ];
  await expect(icons.length).toBeGreaterThan(0);
  for (const icon of icons) {
    const names = [...icon.classList]
      .filter((name) => name.startsWith("lucide-"))
      .map((name) => name.slice("lucide-".length));
    await expect(
      names.some((name) => named.has(name)),
      `${names.join(" / ")} has no hover motion`,
    ).toBe(true);
  }
}
