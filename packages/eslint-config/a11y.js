import pluginJsxA11y from "eslint-plugin-jsx-a11y";

const recommended = pluginJsxA11y.flatConfigs.recommended;

/**
 * Accessibility rules for JSX, shared by the Next.js and React library configs.
 *
 * @type {import("eslint").Linter.Config}
 */
export const a11yConfig = {
  ...recommended,
  files: ["**/*.{jsx,tsx}"],
  rules: {
    ...recommended.rules,
    // Our components take a `role` prop that is a Whiteboard Role
    // (`<FamilyHomeScreen role="parent" />`), not an ARIA role.
    "jsx-a11y/aria-role": ["error", { ignoreNonDOM: true }],
    // A wide table scrolls inside a labelled `role="region"` with
    // `tabIndex={0}`, so keyboard users can scroll it (axe
    // `scrollable-region-focusable`).
    "jsx-a11y/no-noninteractive-tabindex": [
      "error",
      { tags: [], roles: ["tabpanel", "region"], allowExpressionValues: true },
    ],
    // `<Label htmlFor>` or a control nested inside the label both count.
    "jsx-a11y/label-has-associated-control": [
      "error",
      {
        assert: "either",
        depth: 3,
        labelComponents: ["Label", "FieldLabel"],
        controlComponents: [
          "Input",
          "Textarea",
          "Checkbox",
          "Switch",
          "RadioGroupItem",
          "NativeSelect",
          "Slider",
        ],
      },
    ],
  },
};
