# Design direction

Pocket Buddy should feel playful, fun, and current. Avoid austere minimalism and formal, luxury-style elegance. Keep the tone friendly and confident without making the product feel childish.

## Visuals

- Use the dark liquid-glass foundation with lively aqua, lime, violet, coral, and purple accents.
- Give screens personality through filled icons, layered color, and varied shapes. Avoid repeating the same generic card layout everywhere.
- For category-related records, derive the displayed icon and its color from the assigned category. Use the shared default icon and color when a record is uncategorized or its category is unavailable; use the default icon if the category has no available icon.
- Keep the selected Color split Bifold mark beside the wordmark, without a background tile.
- Preserve clear contrast and hierarchy. Balances, transaction amounts, and primary actions must remain easy to find.
- Center the shared main content container with a maximum width of 1,120 px, including its horizontal padding. On smaller screens, let it use the available page width. Avoid narrower arbitrary limits that leave large empty areas beside the main task.
- Keep related forms and review cards aligned to the same content grid and spacing rhythm.
- Do not label fields as “optional”. Mark required fields with a light-green asterisk (`*`) beside the label; keep optional fields unmarked. The marker is a visual cue and must agree with the control’s required validation.
- Multiline text fields grow to fit their content as the user types; do not expose manual resize handles or force a fixed height.
- Right-align action rows at the bottom of cards, with the primary button last (on the right), keeping them visually connected to the form or content above. Do not add a divider line above action rows; allow buttons to wrap or fill the available width on narrow screens.

## Components and interaction

- Give each modal one clear purpose, a concise title, and actions that describe their outcome. Remove redundant kicker labels and repeated headings.
- Center modals in the viewport. When using the shared transform-based positioning with Mantine, use a fade transition so the transition does not override the centering transform; verify positioning at desktop and mobile widths.
- For tall modal content, keep the title and close control visible while the content scrolls. Separate the header with a subtle bottom border and let it blend with the modal surface.
- On narrow screens, keep modal actions readable and easy to tap; allow action buttons to wrap or stack without clipping.
- Use plain-language action labels that explain what the user gets or what will happen. Disable an action when there is nothing eligible for it to act on. Disable a form’s save or primary action whenever required fields are missing or any form value fails validation; enable it as soon as the form is valid. Explain validation problems beside the relevant fields.
- In review flows, make ready, incomplete, and skipped items visually distinct. Keep editable draft fields consistent with the app's other forms.
- Place guidance beside the task it explains when space allows. On narrow screens, use a compact hint that opens a focused modal instead of pushing the main task down the page.
- For uploads, make the empty drop area clearly interactive. After a file is selected, prioritize a useful preview and provide a separate, explicit control to replace it.
- Use click-to-expand previews when a small thumbnail cannot show the image clearly, especially for tall receipts. Label the affordance so users know they can open it.
- When a list row opens one detail view, make the whole row clickable and keyboard focusable. Keep separate actions, such as delete or pause, as independent controls.
- Keep list-row content aligned to the card inset, while extending its hover and focus surface across the full row to the card edges. Use the centered aqua gradient that fades to transparent at both ends.
- Hovering or keyboard-focusing any row action must activate the full row gradient, including edit, delete, restore, pause/resume, detail, and review actions. Keep the action independently operable and use one gradient surface per row.
- Keep table action controls muted at rest. On hover, use the shared hover style for delete controls and a white icon for edit controls. Hovering or focusing an action also activates the row hover surface.
- Use the shared custom picker for every date and month field. Support direct year and month selection, open on the current selection, fill the calendar with selectable adjacent-month dates, and keep the popover visible within the viewport.
- Use a calendar icon for date fields. Keep dashboard month navigation compact, with matching previous/next chevrons and a clickable month label that opens the shared month picker.
- Use the shared custom dropdown for every select field and filter; do not expose browser-native select menus. Match the app's field height, spacing, typography, glass surface, accent, focus, disabled, and selected states.
- Center dropdown menus and date/month picker popovers beneath their trigger when space allows; adjust their position as needed to keep them within the viewport.
- Keep short option lists as a simple custom menu. Add search only when a list is long or user-managed enough that it materially improves selection, such as categories. Keep dropdowns keyboard operable, expose their name and selected state, support Escape and outside-click dismissal, and keep menus within the viewport.

## Detail pages

- Use a single primary record URL for viewing and editing; name the page “details”. Use a separate view or editing flow only when the task requires it.
- Make the full list row open the detail page and remove redundant detail or edit buttons. Keep independent actions separate and keyboard accessible.
- Place an accessible left-arrow back button beside and aligned with the page title. Back controls return to the previous in-app page, preserving the user’s navigation context; when there is no previous in-app page, use the relevant list or parent page as a fallback. Use green for its hover state and a visible keyboard focus indicator; reserve destructive colors for destructive actions.
- Let the main content fill the available width. Avoid repeating the page title inside the card and remove generic tips or unrelated promotions. Keep guidance that explains a consequential behavior near the relevant task.
- Keep save and applicable record actions on the detail page. Ask for confirmation before destructive actions and explain recovery when available.

## List pages

### Structure and data display

- Use a consistent sequence: useful summaries, a list card beginning with search and filters, data rows, pagination, then secondary links below the card. Do not add a heading above the filter toolbar inside the list card.
- Share list controls and behavior across transactions, budgets, recurring schedules, categories, and Recently deleted. Choose rows, progress displays, hierarchies, or tables according to the data; preserve useful differences in presentation.
- Align the toolbar, rows, and pagination with the same card inset. The card supplies the outer padding; pagination must not add another bottom or side inset.
- On mobile, give essential names, amounts, and actions room to remain readable. Remove redundant detail buttons when the row already provides the same navigation.
- At the bottom-navigation mobile breakpoint, hide delete controls on list rows and show a static right chevron on rows that open details. Deletion remains available on the detail page; keep the chevron non-interactive and the row keyboard accessible.

### Search and filter toolbar

- At every screen size, use one compact toolbar row: search, Filter icon button, Reset icon button. Search fills the available space.
- Keep filter fields and sorting inside the Filter modal at every screen size; do not switch to inline fields on desktop.
- Keep the gaps small and equal between search, Filter, and Reset. The compact toolbar currently uses a 4px gap.
- Use the same shared components and field styling as forms, including typography, height, borders, backgrounds, and focus states. Avoid separate compact styles that make date text smaller than neighboring inputs.
- Size short filter fields to accommodate their longest option label and the dropdown arrow. Let long menu labels wrap within the viewport rather than clipping them; recheck toolbar fit after changing labels or widths.
- Keep the search icon and a clear-search control when text is present. Filter fields have no decorative leading icons; retain dropdown arrows and calendar icons on the right.
- Keep Reset enabled at all times. It clears search and all applied filters and returns pagination to the first page. Its icon turns white on hover using the Edit control's transition.
- Show the active filter count in a small light-green circular badge at the Filter button's top-right, tucked close to the icon. Hide it when no filters are active and exclude search from the count. The current badge is 13px with 4px top/right offsets; also expose the count in the button's accessible name.

### Filter modal

- Present the relevant filter fields and Sort by in the Filter modal on every screen size. Open with the applied values, edit a draft, and commit only through Apply filters. Cancel, close, and Escape discard unapplied changes.
- Keep Reset beside the toolbar's Filter button rather than inside the modal.
- Validate date ranges before applying and explain an invalid range beside the fields.
- Use the shared Mantine modal pattern, apply surface styles through its content slot, and preserve the project's dialog focus and scrolling requirements. Check that dropdowns and calendars remain operable within the modal.

### Sorting

- Offer relevant sort fields and both directions in one shared dropdown, using plain labels such as “Date: newest first”, “Amount: highest first”, or “Name: A–Z”.
- Put Sort by after the filters inside the modal at every screen size; Apply and Cancel include draft sorting changes.
- Sort the complete filtered dataset before slicing it into pages. Changing sort returns to page one. Preserve stable ordering for equal values and keep category children attached to their parent, sorting siblings in the selected direction.
- Default transactions to newest date, budgets to highest spending percentage, recurring schedules to soonest next date, categories to A–Z, and Recently deleted to latest deletion date.
- Reset restores the default sort along with clearing search and filters. The active-filter badge excludes sorting. CSV export uses the full filtered dataset in its selected order.

### Pagination and secondary actions

- Paginate filtered results, show the visible range and total, and provide numbered pages plus previous/next controls. Keep result counts visible for a single nonempty page.
- Return to the first page when search or filters change. Clamp the current page when records are removed so a valid page remains visible.
- Place the result count left and navigation right when they fit in one row. When stacked, center both the count and navigation.
- Keep category children with their parent when paginating groups. Search must find child names as well as parent names.
- Put secondary actions below the card with lightweight text-and-icon styling. On transactions, place Export CSV immediately to the right of Recently deleted with matching styling; keep export out of the filter toolbar and modal.
- Export the complete filtered result set, including records beyond the current page.
- Distinguish an empty dataset from no matching results, and provide a useful next step where available.

### List state in URLs

- Persist applied search, filters, sort, and the current page in query parameters for every list page. Opening a detail page and using browser Back must restore the same list state and records; reloads and copied links must restore it too.
- Use readable parameter names such as `q`, `type`, `category`, `from`, `to`, `period`, `status`, `frequency`, `group`, `sort`, and `page`. Page numbers in URLs start at 1. Omit empty and default values when updating the URL.
- Keep modal draft values local until Apply filters. Cancel, close, and Escape must leave the URL unchanged.
- Replace the current history entry while typing or clearing search. Add a history entry for applied filter, sort, reset, and pagination changes; batch changes from one action into one entry. Preserve browser Back/Forward behavior.
- Search, filter, and sort changes remove the page parameter and return to page one. Reset clears applied list state and restores default ordering.
- Validate query values against supported options, valid calendar dates, and safe positive page numbers. Fall back safely for unsupported values and clamp the displayed page to available results.
- Verify direct links, reload, detail-and-back navigation, Back/Forward, modal draft isolation, and invalid parameters on desktop and mobile.

### Verification

- Check desktop, intermediate, and mobile widths for compact toolbar fit, equal gaps, aligned card insets, centered stacked pagination, readable rows, and page overflow.
- Verify behavior as well as appearance: search and combined filters, modal Apply/Cancel and keyboard focus, reset, pagination records and counts, empty states, and the page's navigation and record actions.
- Use isolated browser data for edits and destructive actions. Verify exported contents against the active filters, and report the limits of browser emulation or demo-only persistence.

## Accessibility and responsive behavior

- Use a common field design across the project: text, email, password, numeric and amount inputs, textareas, search, dropdowns, date pickers, and month pickers share typography, border radius, surface, border color, and interaction states in forms, list toolbars, and modals. Use shared components and style tokens rather than isolated variants. Keep single-line field heights aligned when displayed together; allow task-specific content such as larger amounts or growing textareas without changing the surrounding field treatment.
- After selecting a dropdown option with mouse or touch, close the menu and clear focus so the field returns to its resting border. Keyboard selection retains focus and the shared active border so the user can continue navigating. A selected value alone must not make a field appear focused.

- Across the project, all editable fields share one active border color, using the shared `--field-active-border` token (`rgba(150,232,189,.56)`). Apply it consistently to text, password, email, numeric and amount inputs, textareas, dropdowns, search, date pickers, and month pickers in forms, toolbars, and modals.
- Show one active border, without an additional outline or focus shadow. Composite fields draw this border on their outer container; inner inputs stay borderless. Keep picker triggers active while their popover is open. Preserve visible keyboard focus for fields and retain the separate focus treatment for buttons, links, and calendar options.


- Every interactive control must be keyboard operable, have a visible focus state, and expose an accessible name and state.
- For whole currency amounts, show digit grouping as the user types; grouping separators are automatic, and the caret stays with the same digit when formatting changes. Hide numeric steppers, and keep a composite amount control to one visible border with one focus state.
- When a form collects a cash amount, place its amount field before the other data fields.
- Keep text and controls legible against their backgrounds. Do not rely on color alone to communicate validity, selection, or status.
- Dialogs must move focus into the dialog when opened, keep keyboard focus inside while open, close with Escape when safe, and return focus to the control that opened them.
- At narrow widths, reflow multi-column forms and summaries into a clear reading order. Keep essential content visible and let long content scroll within its intended region.
- Respect reduced-motion preferences and preserve all state information when motion is removed.

## Feedback and consistency

- Show validation next to the field that needs attention and explain how to fix it. Preserve entered values when validation fails.
- Give loading, success, and failure states clear, timely feedback. Prevent duplicate submissions while an action is in progress.
- Confirm destructive or hard-to-reverse actions with plain language that names the consequence; do not add confirmation steps to routine reversible actions.
- Reuse shared components and interaction patterns when they serve the same purpose. Use a distinct layout when it makes a screen's task clearer, while retaining the same typography, spacing, and control behavior.

## Content resilience

- Design for realistic extremes: long descriptions and merchant names, large amounts, missing optional values, and lists with many items.
- Prevent long content from overlapping controls or forcing page-wide horizontal scrolling. Wrap text where it helps; truncate only when the full value remains available on demand.
- Keep amounts readable at large values and use tabular figures for alignment. Avoid fixed widths that clip currency values.
- Give empty states a concise explanation and a clear next step when one exists. Distinguish an empty result from loading or failure.
- Represent unavailable optional data consistently; do not show placeholders that look like real transaction values.

## Typography

- Use Plus Jakarta Sans and readable sizes: body copy at least 14px, supporting labels at least 12px.
- Avoid tiny uppercase labels and dense metadata. Use tabular figures for money amounts.

## Copy

- Write short, direct, human copy. A little wit is welcome when it fits the moment.
- Each string must label information, guide an action, explain a real consequence, or add purposeful personality.
- Remove slogans, generic encouragement, repeated headings, obvious arithmetic, and explanations the screen does not need.

## Motion

- Give enabled primary buttons a stationary, soft highlight that fades in on hover; apply hover feedback only on devices with a fine hover-capable pointer.
- Add motion only when it communicates state, gives useful feedback, or adds rare, appropriate delight.
- Keep interactions quick and interruptible; avoid constant decorative movement and excessive motion on frequent actions.
- Respect reduced-motion preferences.
