# UI component library options for Pocket Buddy

Research date: 2026-11-14

## Recommendation

Adopt **Radix Primitives incrementally as the behavior layer**, while keeping Pocket Buddy's existing CSS classes and visual design. Start with the highest-risk custom interactions: dialog, select/combobox, popover/calendar, and dropdown menu. Keep the existing `Button`, `Card`, and form wrappers as the app's design-system components, and style Radix parts through the current CSS variables and classes.

This is the closest match to the goal of reducing custom accessibility and interaction code without importing a different visual language. Radix is explicitly unstyled, can be styled with any CSS solution, exposes state through data attributes, and documents React 19 compatibility. ([Radix introduction](https://www.radix-ui.com/primitives/docs/overview/introduction), [styling](https://www.radix-ui.com/primitives/docs/guides/styling), [release notes](https://www.radix-ui.com/primitives/docs/overview/releases))

If the priority is the smallest package count and a newer unified API, **Base UI** is also a strong candidate: it is unstyled, supports plain CSS and React 17+, and ships its components from one tree-shakeable package. Its stable 1.0 release is comparatively recent (December 2025), so for this established app Radix is the lower-risk starting point based on the evidence reviewed. ([Base UI overview](https://base-ui.com/react/overview/about), [quick start](https://base-ui.com/react/overview/quick-start), [release history](https://base-ui.com/react/overview/releases))

## What the project has today

- The web app uses Next.js 15.5, React 19.1, and `lucide-react`; it has no component framework or Tailwind dependency in `apps/web/package.json`.
- UI is currently composed in `apps/web/app/pocket-buddy-app.tsx` and styled in `apps/web/app/globals.css`. Existing wrappers include `Button`, `Card`, `Field`, and a custom `SelectInput`; dialogs and popovers are also implemented in the app.
- The design direction calls for dark liquid-glass surfaces, custom colors and spacing, and app-wide bespoke date/month pickers and dropdowns. A preset theme would require substantial override work to retain this look. (See `docs/design-direction.md`.)

## Options

| Option | Fit for current design | Practical tradeoff |
| --- | --- | --- |
| **Radix Primitives** | Excellent. Unstyled primitives work with the current plain CSS and allow fine-grained classes and state selectors. | Supplies behavior and accessibility, not a ready-made visual design; keep/extend local wrappers and CSS. Supports incremental adoption and documents React 19 compatibility. ([overview](https://www.radix-ui.com/primitives/docs/overview/introduction), [styling](https://www.radix-ui.com/primitives/docs/guides/styling), [releases](https://www.radix-ui.com/primitives/docs/overview/releases)) |
| **Base UI** | Excellent. Unstyled, framework-neutral styling, CSS classes and state data attributes. | Similar amount of local styling to Radix; single package and React 17+ support are convenient, but v1.0 is newer. ([about](https://base-ui.com/react/overview/about), [styling](https://base-ui.com/react/handbook/styling), [releases](https://base-ui.com/react/overview/releases)) |
| **shadcn/ui** | Moderate. Its components are customizable and support theme variables, but its standard setup is built around Tailwind. | It adds copied source components, not just a runtime component package; current project would need Tailwind setup or manual adaptation. It is a good choice if adopting Tailwind and accepting a component styling baseline is also desired. Its official React 19 guide identifies Next.js 15 and notes npm peer-dependency resolution can require a flag. ([installation](https://ui.shadcn.com/docs/installation/next), [React 19](https://ui.shadcn.com/docs/react-19), [theming](https://ui.shadcn.com/docs/theming)) |
| **Headless UI** | Good. Unstyled components can be custom styled. | Official positioning is integration with Tailwind CSS; using it here without Tailwind is possible but less aligned with the existing CSS-first setup. ([Headless UI](https://headlessui.com/)) |
| **MUI** | Moderate to low for visual preservation. It has strong theme customization and CSS variable support. | It is a complete styled design system, so matching the bespoke liquid-glass appearance means overriding component defaults broadly. It makes more sense if Pocket Buddy wants to move toward Material UI's built-in component presentation. ([theming](https://mui.com/material-ui/customization/theming/), [CSS variables](https://mui.com/material-ui/customization/css-theme-variables/overview/)) |

## Suggested adoption boundary

Use one primitive library consistently for complex controls; do not replace all presentational markup just to use a library. Keep brand-specific surfaces, typography, card composition, color and spacing in existing CSS tokens and shared wrappers. Let the primitive library own keyboard handling, focus management, ARIA semantics, dismissal, and popup positioning where supported. For unusual product-specific controls (such as the amount input), retain the current app-owned implementation unless a primitive directly fits.

This boundary preserves the current visual system while reducing the bespoke interaction logic. It also avoids a Tailwind migration whose main benefit would otherwise be prebuilt styled components that do not match this design.
