# UseHourly UI spec

The one place that says how the app looks and why. **When you change a pattern, change it here in the same pull
request.** Rules marked **[checked]** fail the build or the browser tests if broken; the others are held by review.
Look at the real thing first: the pages are the reference, this file is the explanation.

## Principles
1. **Quiet by default.** A neutral page, white cards, grey text. Colour is rare so it means something.
2. **One way to do each thing.** The same card, the same empty state, the same notice, everywhere.
3. **UX is the product.** Logging a day takes seconds; every screen is judged on how few actions a job takes **[checked: action budgets in the first-day test]**.
4. **Works for everyone:** keyboard, screen reader, phone, offline, dark mode.

## Colour
- **Accent (near-black "Neutral"; amber "Sunshine" is an optional preset):** only for **the one main button** (`variant="primary"`), **the current page** (tab underline, side-menu bar) and focus. Other presets (Sunshine, Mint, Coral, Sky, Lilac, Azure, Cream, Mono) change the accent only; Azure also sets cool-grey surfaces.
- **One solid button per screen** **[checked: `auditPage`]**. Everything else is the soft tint (`default`) or an outline.
- **Status colours carry meaning only:** green = done, paid, confirmed; red = remove, stop, problem; yellow = warning. Icons are neutral grey otherwise; the status colours are applied to icons by class in `globals.css`. A check icon on a dark or accent surface sets its own colour.
- **Green** (Bright Optimistic Green `#50B83C`, 2026-10-20) is only for good news. It is too pale for words on white (2.5:1), so `bg-success-bright` / `text-success-bright` and the check icons use it for icons, bars and fills, while `text-success` is the same hue darker (7:1) and `bg-success-soft` the pale tint behind it.
- **Contrast:** WCAG AA (4.5:1) for text in every preset, light and dark, both layouts **[checked: `THEME_AUDIT=1 npx playwright test e2e/theme-audit.spec.ts`, also with `THEME_AUDIT_NAV=left`]**. Text on a tinted band uses `text-foreground/75`, never `text-muted-foreground` on the darker bands, and never `text-primary` for small text.

## Surfaces: three levels (all headers are white since 2026-10-20: `--band-1/2/3` are the card colour)
| Level | What | Header shade |
|---|---|---|
| Page | the page background: a quiet neutral off-white | none |
| 1. Page card | `PageShell`: one main card per dashboard page | white (`bg-card`) header, the same title size on every page, `clamp(1.375rem, 6.5vw, 2.25rem)` with a 40px line so it is as tall as the 40px controls beside it and grows to fill the free space, icon tile with a thin border; a short description (a date) can sit on the title's line with `inlineDescription` |
| 2. Card | cards directly inside it (`HeaderCard`, `SectionCard`, entry cards, client cards, invoice cards) | `bg-band-2` (the same shade as band-1) |
| 3. Tile | a borderless block inside a card (a project tile) | `bg-band-3` (1.5%, a notch lighter), body white with a hairline ring (`ring-1 ring-foreground/10`, not a border, so the nesting check ignores it) |

- `--band-1/2/3` are mixed from the theme's own text and page colours (`globals.css`), so presets and dark mode follow. **Never use `bg-muted/40` for a header band** **[checked: `check-rules`]**.
- **Cards go one level deep** **[checked: `auditPage` fails a bordered, rounded box nested 3 deep]**. A card never holds another framed card: inside a card use plain sections, borderless tiles, spacing or a heading.
- **No lines for separating things** on card pages: tint and spacing do it (`border-t`, `divide-y` are for tables and a card's own header only). The page card's header has one line under it.
- Cards: `rounded-xl border bg-card` (white). Tiles: `rounded-lg`, no border. Buttons, fields, tabs and pills are not cards.
- **Header text:** the page card's header has the title, one line of explanation in `text-foreground/75 text-sm` (hidden on phones unless it carries information), and **an icon tile before the title** (`PageShell nav="..."`: the same icon as the page's menu entry, in a white rounded tile).
- **Icons are for the page card only.** Cards inside it have no icon (an icon on every inner card is too much of a good thing). Their header is **one line: the title and its note side by side** (`CardTitle`: "By quarter · Handy for quarterly estimated tax payments."), the note wrapping under the title on a phone.

## Components (use these, do not re-draw them)
- `PageShell` (`components/page-shell.tsx`): the page card; title, one line, the page's main controls.
- `HeaderCard` (`components/header-card.tsx`): card with a `band-2` header and a padded body; optional form.
- `SectionCard`: the Account page's sections.
- `EmptyState` (`components/empty-state.tsx`): the dashed "nothing here yet" card **[checked: `check-rules` forbids hand-made dashed paragraphs]**. An empty list that can be filled becomes an **actionable dashed card with a +** that turns into the form in place (Clients "Add a project", Team "Invite someone").
- `Notice` (`components/notice.tsx`): a short message set apart; `tone="danger"` for failures **[checked]**.
- Stat cards: a `dl` of small white cards (label above, figure below), three across on Clients, Invoices and Year summary, four on Insights.
- **Controls look pressable, labels do not.** A control (button, chip you can click, field) is white with a border. Information is flat: the hours (`HoursChip`) are plain text with a small clock, and status pills are a light tint with no outline, so nobody taps them expecting something to happen.
- Chips and pills: `rounded-full`, no shadow; a selected project is a white card with a dark outline and a tick.
- **A summary is not a card:** the Week page's "This week" is a frameless darker strip with a big figure, then the projects that made it up. Day tiles carry a dot per client that has time that day, none when empty.
- Icon buttons: 40px in headers (`h-10`), 32px inside a card header, tooltip on wide screens, a labelled row on phones (`IconAction`).
- `GuideLink` (`?`): beside any setting that is easy to misunderstand; it opens the matching guide topic **[checked: the topic must exist]**.

## Navigation
- **Phones:** a bottom tab bar (Today, Week, Month, Invoices, Clients, Account where there is room, More).
- **Wide screens:** the tab strip under the top bar (default) or a side menu down the left (gear, Navigation); the choice is per browser. The side menu groups pages by function (Track, Bill, Manage, Settings), marks the current page with an accent bar, and folds to icons (button or double-click). Navigation has **no borders**; it is separated by background only.
- The top bar, top right: **? Guide**, the settings gear, the theme switch.
- **The guide** is its own frame (`/help`): a contents list down the left (a folded "Browse all topics" on a phone), Guide and FAQ buttons that stay pressed on the current page, and no app menu, so there is never a second left menu.
- Every page's name is the same in the menu, the heading and the browser title **[checked]**.

## Layout and spacing
- Spacing on a 4px scale in steps of 4, 8, 12, 16 (`p-1`, `p-2`, `p-3`, `p-4`); half steps only for tiny badges.
- The dashboard content is one column, `max-w-5xl`, centred; on a phone the page card runs edge to edge.
- Controls are 44px or more on phones; a tap target under 24px is flagged **[checked: advice in the report]**.
- Radius: cards `xl`, tiles and inputs `lg`, pills full.

## Forms and states
- Every `<form>` declares `method="post"` **[checked]**. Every control has a visible or accessible name **[checked]**. Inputs are white.
- Destructive actions ask first and **name what they will remove** (`DeleteEntryDialog`, the archive and delete-invoice dialogs); archiving offers Undo.
- Loading: skeletons, not spinners. Errors: `Notice tone="danger"` or a toast; network errors say "No connection. That needs you to be online."
- Offline: a banner; adding time still works; everything else says it needs a connection.

## Words
Plain, short, no jargon, no blame. Name things the way the menu does ("Clients & Projects", "Year summary"). Prefer "Add to the day" to "Submit". The obvious is not explained; the confusing goes in the guide.

## Per page (what to expect)
- **Today:** the add form card, two total cards, the day's entry cards (or the dashed empty state).
- **Week / Month:** toolbar (project filter, Share & export, date arrows), the day strip or calendar card, the Week summary strip, and "What you worked on": one card (header: title, count, search) holding day headings with an entry tile each. **That card is not shown at all when the period has no entries.** The Week page's address carries the picked day (`?date=`), so a refresh returns to it.
- **Invoices:** total cards, filters in one card, an invoice card per invoice with four icon buttons.
- **Clients & Projects:** stat cards, search, then one **card per client** (header: logo, name, summary, buttons) holding **project tiles** (header row: name and buttons), ending in the dashed "Add a project" tile.
- **Year summary:** stat cards, then one card per table.
- **Team:** count cards, one card per person, ending in the dashed "Invite someone" card.
- **Account:** one page card with section cards.
- **Public pages** (sign-in, calculator, guide): the same cards and notices on the neutral page; the sign-in forms sit in one card.

## How consistency is kept
- `npm run ci` (includes `scripts/check-rules.mjs` for the code-level rules above) and `npm run e2e` (every page gets `auditPage`: labels, form method, no sideways scroll, one heading, accessibility, card nesting, one solid button) must pass.
- After touching a colour, a preset or a shared component: run the contrast audit (both layouts).
- A new page or component starts by copying the nearest existing one, and adds itself to this file if it is a new pattern.
