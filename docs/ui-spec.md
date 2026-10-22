# UseHourly UI spec

> **2026-10-22: the ink-and-paper redesign.** The look is a cool paper page, white sheets, ink text and ONE amber accent (the hour hand), in Instrument Sans with Bricolage Grotesque for headings and JetBrains Mono for numbers. The navigation is a pill of tabs in the top bar (the left menu is an option). Today is built around a day dial; amounts of time use the `TimeRuler` slider; a project is picked from one large row plus pills. Where this note and an older line below disagree, this note wins. Details and file names: the "ink-and-paper redesign" section of `CLAUDE.md`. Return point: git tag `pre-redesign-2026-10-22`.

The one place that says how the app looks and why. **When you change a pattern, change it here in the same pull
request.** Rules marked **[checked]** fail the build or the browser tests if broken; the others are held by review.
Look at the real thing first: the pages are the reference, this file is the explanation.

## Principles
1. **Quiet by default.** A neutral page, white cards, grey text. Colour is rare so it means something.
2. **One way to do each thing.** The same card, the same empty state, the same notice, everywhere.
3. **UX is the product.** Logging a day takes seconds; every screen is judged on how few actions a job takes **[checked: action budgets in the first-day test]**.
4. **Works for everyone:** keyboard, screen reader, phone, offline, dark mode.

## Colour legend (the one list; change it here first)
Yellow is small on purpose. Colour is for dials, the main button, "now", and money. Everything else is neutral. The named colours live in `src/lib/palette.ts`; screens use them from there or use theme tokens (`bg-amber`, `text-foreground`, `var(--muted)`). **A file may not gain hard-coded hex colours: `scripts/check-colours.mjs` (part of `npm run ci`) fails, and `scripts/colour-baseline.json` may only ever go down.** To add a colour: add it to `palette.ts` AND to this table, in the same pull request.

| Colour | Where | Means |
|---|---|---|
| **Amber** `PALETTE.accent` | the one solid button (Log time, New client...), today (week bar, Month day, Today pill), the open Account tab, the latest month on the Year chart, focus | "act here" or "now" |
| **Brand blend** (amber, coral, pink, violet) `PALETTE.brandBlend` | Today's day dial, the goal meters, Today's timesheet line, the Month "This month" bar, the home page | time and progress |
| **Dark to light** (ultramarine, violet, pink, lilac) `PALETTE.monthDial` | the Clients month dial only | this month's share |
| **Teal** `PALETTE.money.paid` | Invoices: paid ring, bar, Paid pill | money received |
| **Violet** `PALETTE.money.waiting` | Invoices: waiting part of the bar, Unpaid pill | money expected |
| **Coral** `PALETTE.money.late` | Invoices: late, the overdue row stripe | money overdue |
| **Soft grey** `PALETTE.soft` | every other bar and line (week bars, Month day lines, By project bars, Year bars) | "has time", nothing more |
| **Project colour** (the user's own) | a small dot beside a project or client name, never a bar | which project |
| **Green** (`success`) | check icons and the word Paid | done, confirmed |
| **Red** (`destructive`) | delete, stop, errors | remove, problem |

Rules: **no rainbow of weekdays**, no per-tab colours, no coloured stat-tile tops or rings, and nothing is yellow because it "needs to stand out". Check a new screen by asking "could this be grey?". Money colours are used for money only.

## Colour (older notes, still valid where the legend is silent)
- **Accent (the one amber, the hour hand; there are no colour presets since 2026-10-22):** only for **the one main button** (`variant="primary"`), **the current page** (tab underline, side-menu bar) and focus. Other presets (Sunshine, Mint, Coral, Sky, Lilac, Azure, Cream, Mono) change the accent only; Azure also sets cool-grey surfaces.
- **One solid button per screen** **[checked: `auditPage`]**. Everything else is the soft tint (`default`) or an outline.
- **Status colours carry meaning only:** green = done, paid, confirmed; red = remove, stop, problem; yellow = warning. Icons are neutral grey otherwise; the status colours are applied to icons by class in `globals.css`. A check icon on a dark or accent surface sets its own colour.
- **Green** (Bright Optimistic Green `#50B83C`, 2026-10-20) is only for good news. It is too pale for words on white (2.5:1), so `bg-success-bright` / `text-success-bright` and the check icons use it for icons, bars and fills, while `text-success` is the same hue darker (7:1) and `bg-success-soft` the pale tint behind it.
- **Contrast:** WCAG AA (4.5:1) for text in light and dark, both layouts **[checked: `THEME_AUDIT=1 npx playwright test e2e/theme-audit.spec.ts`, also with `THEME_AUDIT_NAV=left`]**. Text on a tinted band uses `text-foreground/75`, never `text-muted-foreground` on the darker bands, and never `text-primary` for small text.

## Surfaces: three levels (headers are a light tint of the text colour over the card colour, 4 to 5%, since 2026-10-21; they were white for a day and a tile's header then looked like its body)
| Level | What | Header shade |
|---|---|---|
| Page | the page background: a quiet neutral off-white | none |
| 1. Page card | `PageShell`: one main card per dashboard page | white (`bg-card`) header, the same title size on every page, `clamp(1.375rem, 6.5vw, 2.25rem)` with a 40px line so it is as tall as the 40px controls beside it and grows to fill the free space, icon tile with a thin border; a short description (a date) can sit on the title's line with `inlineDescription` |
| 2. Card | cards directly inside it (`HeaderCard`, `SectionCard`, entry cards, client cards, invoice cards) | `bg-band-2` (the same shade as band-1) |
| 3. Tile | a borderless block inside a card (a project tile) | `bg-band-3` (5%), body white with a hairline ring (`ring-1 ring-foreground/10`, not a border, so the nesting check ignores it) |

- `--band-1/2/3` are mixed from the theme's own text and page colours (`globals.css`), so dark mode follows. **Never use `bg-muted/40` for a header band** **[checked: `check-rules`]**.
- **Cards go one level deep** **[checked: `auditPage` fails a bordered, rounded box nested 3 deep]**. A card never holds another framed card: inside a card use plain sections, borderless tiles, spacing or a heading.
- **No lines for separating things** on card pages: tint and spacing do it (`border-t`, `divide-y` are for tables and a card's own header only). The page card's header has one line under it.
- Cards: `rounded-xl border bg-card` (white). Tiles: `rounded-lg`, no border. Buttons, fields, tabs and pills are not cards.
- **Header text:** the page card's header has the title, one line of explanation in `text-foreground/75 text-sm` (hidden on phones unless it carries information), and **an icon tile before the title** (`PageShell nav="..."`: the same icon as the page's menu entry, in a white rounded tile).
- **Icons are for the page card only.** Cards inside it have no icon (an icon on every inner card is too much of a good thing). Their header is **one line: the title and its note side by side** (`CardTitle`: "By quarter · Handy for quarterly estimated tax payments."), the note wrapping under the title on a phone.

## Components (use these, do not re-draw them)
- `PageShell` (`components/page-shell.tsx`): the page card; title, one line, the page's main controls.
- `HeaderCard` (`components/header-card.tsx`): card with a `band-2` header and a padded body; optional form.
- `SectionCard`: the Account page's sections.
- `EmptyState` (`components/empty-state.tsx`): the dashed "nothing here yet" card **[checked: `check-rules` forbids hand-made dashed paragraphs]**. An empty list that can be filled becomes an **actionable dashed card with a +** that turns into the form in place (Clients "Add a project" for a client with no project yet, Team "Invite someone"). Once a list has items, a small + in the header is enough: no big dashed card beside real ones (Clients), unless it would otherwise leave a gap in a grid row (Team).
- **Row and card actions:** the **one or two actions people use all the time stay visible as buttons** (Edit, + add a project); **rare or risky ones go in a ··· menu** (horizontal dots, "More actions", the items written as words, Delete and Archive in red). Dots everywhere would make every common action two clicks and hide what a page can do, so never put the main action in the menu. Clients: + visible, Billing details and Archive client in ···; project tiles: Edit visible, Archive in ···. Entry cards (Today, Week): Edit visible; `EntryMenu` in `today/_components/entry-menu.tsx` holds Move to another day and Delete. Tests open the menu with `entryAction` / `openEntryMenu` (`e2e/helpers.ts`), which first wait for the card to be confirmed by the server; a ··· menu on a client or project is opened with `menuAction(page, "More actions for <name>", "<item>")`. `MoreMenu` (`components/more-menu.tsx`) is the generic component.
- **Folding (2026-10-22):** a section that is long or secondary folds behind a chevron (`components/collapsible-section.tsx`): the whole header is the button (`aria-expanded`), a folded card still shows its title and a short summary (a total), and the choice is remembered on this device per section id (`hourly:foldedSections`). Used on the Year summary sections so far (ticket #185 lists the rest). Never fold the page's main job (the add form, the day's entries). Sections start open unless they are long.
- **Cards group, rows list (2026-10-22):** a card is for one thing with its own header and actions (a client, a day). Many things of the same kind (projects, entries, invoices, people) are **rows in one table or list**, never a card each. **Creating a new item of a page is a + button in the page header** (Clients: New client, Invoices: New invoice, Team: Invite someone); a page whose main form is the page itself (Today) has none.
- `Notice` (`components/notice.tsx`): a short message set apart; `tone="danger"` for failures **[checked]**.
- Stat cards: only on Insights (four across). Clients and Invoices show their numbers as one line of words; the Year summary shows them as ONE "Your year" card of label-and-figure lines (work on the left, money on the right).
- **Controls look pressable, labels do not.** A control (button, chip you can click, field) is white with a border. Information is flat: the hours (`HoursChip`) are plain text with a small clock, and status pills are a light tint with no outline, so nobody taps them expecting something to happen.
- **Entry cards** read as ONE row (colour dot, project · client, the description under it, the hours, Edit, ···), about half the height they were on a wide screen (on a phone the project and its client take two short lines, then the description); the tinted header only appears while the entry is being edited.
- Chips and pills: `rounded-full`, no shadow; a selected project is a white card with a dark outline and a tick.
- **A summary is not a card:** the Week page's "This week" is a frameless darker strip with a big figure, then the projects that made it up. Day tiles carry a dot per client that has time that day, none when empty.
- Icon buttons: 40px in headers (`h-10`), 32px inside a card header, tooltip on wide screens, a labelled row on phones (`IconAction`).
- `GuideLink` (`?`): beside any setting that is easy to misunderstand; it opens the matching guide topic **[checked: the topic must exist]**.

## Navigation
- **Phones:** a bottom tab bar (Today, Week, Month, Invoices, Clients, Account where there is room, More).
- **Wide screens:** the tab strip under the top bar (default) or a side menu down the left (gear, Navigation); the choice is per browser. The side menu keeps the pages in spaced groups (no headings), and marks the current page with an accent bar. Navigation has **no borders**; it is separated by background only.
- The top bar, top right: **? Guide**, the settings gear (it holds the Light, Dark and System choice) and your name; a signed-out visitor keeps a quick theme switch because they have no gear.
- **The guide** is its own frame (`/help`): a contents list down the left (a folded "Browse all topics" on a phone), Guide and FAQ buttons that stay pressed on the current page, and no app menu, so there is never a second left menu.
- Every page's name is the same in the menu, the heading and the browser title **[checked]**.

## Best practices (the why behind the rules)
These are the general UI/UX habits every screen is judged against, by a person and by the independent UI review (a fresh reviewer is given this file and screenshots of every page; run it after each look-and-layout release). Where a rule is already measurable it says **[checked]**; the rest is judged in review. When a rule here and an older rule above disagree, the older, more specific one wins and this file is fixed.

### Hierarchy and focus
- **One job per screen, one main action.** The eye should land on the thing the person came to do (Today: the time box and "Log time"). One solid button per screen **[checked]**; everything else is quieter (soft tint, outline, text).
- **Visual weight follows importance:** size, boldness, contrast and position say what matters most; if everything is bold, nothing is. Max two type weights per card (regular and semibold).
- **Show less until it is needed** (progressive disclosure): rare actions go behind ···, advanced options behind "More options", details open in place. Delete no feature; move it.
- **Group by meaning (proximity):** things that belong together sit close (a label and its field, a card's title and its actions); unrelated groups get more space. Space and tint separate groups before lines do.
- **Recognition over recall:** show the options (chips, toggles, a visible list) instead of asking people to remember or type. Defaults are the common choice (the last project, today's date).
- **Do not explain the obvious**; explain the confusing once, in a `GuideLink`, not in paragraphs on the screen.

### Layout, alignment and position
- **One column**, content centred at `max-w-5xl`; a phone runs the card edge to edge. Never two competing columns of equal weight.
- **Align to a shared left edge** (titles, labels, fields, card text start on the same x) and to a shared baseline in a row (a title and its date, a label and its value). Right-align numbers and money so digits line up (`tabular-nums`).
- **Where things go (consistent places, so nobody hunts):** page title and the page's main control top left/right of the page card header; a card's actions pinned to the right of its header; the main submit button at the end of its form, full width on a phone; Previous/Next at the end of a list; filters above the list they filter; destructive actions away from the main one.
- **Reading order = visual order = tab order.** No layout that reads differently from how it is focused.
- **Lists that grow are paginated or collapsed** (Invoices and "What you worked on": 3 per page on a phone, 10 wide, `lib/paginate.ts`; Clients: rows that open), never an endless scroll of heavy cards.
- **Every card has a tinted header band** with its title, like its neighbours **[checked: `auditPage` fails a card that has a heading but no band]**. A deliberate exception says why with `data-headerless="..."` (the Week total strip, a white "light" header, the welcome question, a tinted information card).
- **Sticky only what earns it:** the running-timer banner and the bottom tab bar; nothing else covers content.

### Spacing and sizing (use the scale, do not invent numbers)
- Spacing scale **4, 8, 12, 16** (`p-1`, `p-2`, `p-3`, `p-4`) inside and between things; 24 (`gap-6`) only between big page sections; half steps only for tiny badges. Related things 8, groups 16, sections 24.
- **Rhythm:** the same gap between siblings of the same kind (cards in a list `gap-3`, fields in a form `gap-2` to `gap-3`); a card's padding is `p-3` on a phone, `p-4` from `sm` up.
- **Touch targets: 44px minimum on a phone, 40px in a page header, 32px inside a card header; at least 8px between two targets.** A link inside a sentence is exempt. Under 24px is flagged **[checked]**. A small icon gets a bigger invisible hit area.
- **Radius** `xl` cards, `lg` tiles and fields, full pills; never mix several radii in one card.
- **Line length** 45 to 75 characters for running text; long text is wrapped in a narrower box, not stretched across the page.
- **Type scale (Tailwind):** page title `clamp(1.375rem, 6.5vw, 2.25rem)`, card title `text-base` semibold, body `text-sm` (14px) for dense UI, `text-base` for reading text and fields on a phone (16px stops iOS zooming into a field) **[checked: selects and inputs are 16px under 768px]**, small print `text-xs` only for secondary hints, never for anything needed to act. Line height about 1.4 to 1.5.
- **Icons** 16 to 20px beside text (`size-4` to `size-5`), 24px alone in a tile; stroke weight consistent (lucide); an icon never carries meaning alone (a label or tooltip says it).

### Phones and thumbs
- **Primary navigation at the bottom** (thumb zone), page content scrolls above it; destructive or rare controls are not in the easiest-to-hit corner.
- **Forms put the field being typed in above the keyboard** (dialogs sit at the top) **[checked: `phone-dialogs.spec.ts`]**; the right keyboard for the data (`inputMode="decimal"` for rates, `type="url"`, `email`).
- **No hover-only information** (tooltips do not exist on touch: a phone shows the words; `IconAction`). No double-tap or long-press as the only way to do something. Gestures (swipes) are shortcuts; a button always does the same.
- **No sideways page scroll** **[checked]**; wide tables scroll inside their own box. Respect the safe areas (`env(safe-area-inset-*)`).
- Test every change at 360px, 412px and a 1280px desktop.

### Forms and input
- **A visible label above each field**, not only a placeholder (placeholders vanish and fail contrast) **[checked: every control has a name]**. Required fields are obvious; optional ones say "(optional)".
- **Ask for the least**; sensible defaults; accept messy input and normalise it (`1.5`, `1:30`, `90m` all work).
- **Validate where the person is looking:** an error sits next to its field in plain words that say how to fix it ("Pick a project first", not "Invalid input"); keep what they typed; never clear a form on error.
- **Enter submits**, Escape cancels, focus goes to the first field on open and back to the trigger on close. The submit button names the result ("Log time", "Create invoice"), never "Submit" or "OK".
- A form opens **in place of the thing it edits** (not a pop-up) unless it is tiny or a chooser (project picker, avatar cropper).

### Feedback and states
- **Every action answers within about 100 ms** (a pressed state, an optimistic change); anything over 1 s shows progress; over 10 s says what is happening and offers cancel.
- **Loading:** skeletons shaped like the content, not spinners; no layout jump when the data arrives.
- **Empty:** says what this is and the one next step (a dashed card with +); a filtered-to-nothing list says "No invoices match that search", not "No invoices yet".
- **Errors:** plain words, what happened and what to do, never a code or the provider's own text; recoverable where possible (Undo, Try again). Network trouble says "No connection. That needs you to be online."
- **Success is quiet:** a toast or the change itself (the entry appears); no modal "Success!".
- **Destructive actions** name what goes ("Delete invoice INV-2026-004 and its links?"), are never the default button, sit away from the main action, and offer Undo where they can. Prefer Undo over "Are you sure?" for cheap-to-reverse actions.
- Disabled controls say why (a hint or a tooltip), or are hidden when they cannot apply.

### Navigation and wayfinding
- The current place is always marked (bar and tint on the menu item, the page title matches the menu word **[checked]**). Same words everywhere for the same thing.
- **Two taps to anything common** (Today, Week, Month, Invoices, Clients are in the tab bar); rare pages live under More. No dead ends: every empty or error screen has a way forward.
- Links look like links (underline) inside text; buttons look like buttons; nothing that is only informative looks pressable (see "Controls look pressable, labels do not").

### Colour, contrast and theming
- **Contrast** 4.5:1 for text, 3:1 for large text and for the edge of a control, in light and dark **[checked: theme audit]**. Never colour alone: status also has an icon or word (green check + "Paid", red icon + "Unpaid").
- Colour is meaningful and rationed: neutral by default, the accent for the main action and the current place, green only for good news, red only for removal and problems, yellow for warnings. Use theme tokens, never raw hex, so every preset and dark mode follows.
- Both light and dark are designed, not inverted; images and logos have a transparent or neutral background.

### Motion
- Motion explains a change (a form opening, a day sliding) and is **under 200 ms**, ease-out; nothing loops or moves for decoration except the landing tour, which stops on hover, focus, hidden tabs and Pause. Respect `prefers-reduced-motion` **[checked on the tour]**.

### Accessibility
- Everything works with the keyboard alone, with a visible focus ring; the focus order follows the reading order; dialogs trap and return focus **[checked in part]**.
- Names, roles and states are real: toggles use `aria-pressed`, openers `aria-expanded`, a list is a list, headings go in order with one `h1` per page **[checked]**. Live changes (a page count, a toast) are announced politely.
- Do not rely on gestures, hover or colour; text can zoom to 200% without breaking the layout.

### Microcopy
- Plain, short, active, in the person's terms ("Log time", "Make a link"). Sentence case. Numbers and dates in the person's own format. No blame ("You must…"), no jargon, no exclamation marks except a first welcome.
- A button says what it does; a title says what the thing is; a hint says what to do, once.

### Before a UI change is approved (checklist)
1. Is there one obvious main action, and is it the only solid button? 2. Does it use the existing components and the spacing scale (no one-off numbers)? 3. Is everything aligned, and are repeated things identical? 4. Are touch targets 44px on a phone and the layout fine at 360px, 412px and 1280px? 5. Every state: loading, empty, error, success, disabled, long text, many items? 6. Keyboard, focus, names, contrast, dark mode and the other theme presets? 7. Does it still work with no hover and no gesture? 8. Is the same thing drawn the same way as on the other pages? 9. Did the spec change, and is it updated in the same pull request? 10. Was the independent UI review run for a look-and-layout release?

## Layout and spacing
- Spacing on a 4px scale in steps of 4, 8, 12, 16 (`p-1`, `p-2`, `p-3`, `p-4`); half steps only for tiny badges.
- The dashboard content is one column, `max-w-5xl`, centred; on a phone the page card runs edge to edge.
- Controls are 44px or more on phones; a tap target under 24px is flagged **[checked: advice in the report]**.
- Radius: cards `xl`, tiles and inputs `lg`, pills full.

## Forms and states
- Every `<form>` declares `method="post"` **[checked]**. Every control has a visible or accessible name **[checked]**. Inputs are white.
- Destructive actions that cannot be undone ask first, **inside the card they belong to** (`InlineConfirm`: it names what will go, the safe choice comes first and is focused, Escape cancels): deleting an entry, deleting an invoice. Reversible ones do not ask: archiving a client or project happens at once and the toast offers Undo.
- Loading: skeletons, not spinners. Errors: `Notice tone="danger"` or a toast; network errors say "No connection. That needs you to be online."
- Offline: a banner; adding time still works; everything else says it needs a connection.

## Words
Plain, short, no jargon, no blame. Name things the way the menu does ("Clients", "Year summary"). Prefer "Log time" to "Submit". The obvious is not explained; the confusing goes in the guide.

## Per page (what to expect)
- **Today:** the add form card (three quick-time chips; until a time is typed the Add button is a clear outline and a line says what to do, then it turns solid; the timer is a small "Haven't done it yet? Start timer" link under it, never a rival button), the day's entry cards (or the dashed empty state), then the calendar card. The day's and the week's totals are one line under the title, not cards. A connected calendar's card (with meetings to log) sits right under the add form; not connected, it waits at the foot with two short sentences.
- **Month:** the month's total is a figure in the header line; today is a filled day number; hours in cells and the weekly totals are readable (not small grey); "This month" stays fully readable when you are already on it; "Add to several days" comes after the filter and Share & export, not first. Picking a day opens it as one card under the calendar (title: the date; the entries and the add form inside; a Close button), not a pop-up.
- **Week / Month:** toolbar (project filter, Share & export, date arrows; the export and share forms open as a card under the toolbar, not a pop-up), the day strip or calendar card, the Week summary strip (right under the day strip on Week), on Week one card for the picked day (header: entry count, total, non-billable button; the entries; the add form inside it), and "What you worked on": one card (header: title, count, search) holding day headings with an entry tile each. **That card is not shown at all when the period has no entries.** The Week page's address carries the picked day (`?date=`), so a refresh returns to it.
- **Invoices (table, 2026-10-22):** ONE "Your invoices" card: a header with one line of totals ("2 invoices · $2,347.50 invoiced · $1,155.00 unpaid · $1,192.50 paid", one line per currency, no stat tiles), then the search box and a Filters button (the fields start folded) right above the list, then a **table** with a column header on wide screens (Invoice and its work summary, Status, Period, Total, actions). An invoice is a row, not a card. **New invoice is an icon-only + in the page header**, like every other page. On a phone a row is three short lines plus the labelled action buttons. The two main actions stay visible (Mark paid / Edit payment, Send) and open their panel under the row; PDF and Delete are in the ··· menu. A page has pages of 3 (phone) or 10.
- **Clients (rows, 2026-10-22):** one **card per client** (header: logo if it has one, name, summary, the visible + to add a project and a ··· menu with Billing details and Archive client) holding its projects as **table rows** (name, rate, this month, all time, then a visible Edit pencil and a ··· menu with Archive project; a column header on wide screens; two lines on a phone). A project is never a card inside the client card. No stat cards: the numbers are one line under the title ("3 clients · 4 projects · 31:45 logged this month"); the search box appears from six clients up. **New client is a + in the page header** (it opens the form above the list; a dashed card appears only when there are no clients). **Archived clients and projects live on their own page** (`/dashboard/clients/archived`, opened from the header ··· menu "More actions for Clients"), not at the foot of the list. The dashed "Add a project" tile shows only for a client with no project yet.
- **Year summary:** stat cards, then one card per table. "By month" shows only months with activity (a button shows all 12); an empty figure is always a dash; on a phone each period is two lines (name and what it earned, the rest in one muted line).
- **Team (rows, 2026-10-22):** one "Your team" card holding a **row per person** (name, email, a "Logs time for" line of client chips, a status ICON beside the buttons (hourglass = waiting to accept, check = joined, crossed mail = expired; the words are its tooltip), a visible pencil that opens the client toggles in the row, and a ··· menu with Send again and Remove from team; removing asks inside the row). **Invite someone is a + in the page header** (it opens the invitation form above the list; the big dashed invite button shows only while nobody is invited). The counts are one line under the title (no count cards). No swipe row on a phone: the rows stack.
- **Account (tabs, 2026-10-22):** one page card with TABS, one section open at a time: Your account, Invoices, Your data, AI assistants (`account-tabs.tsx`; the open tab is in the address, `#data`, so a link or reload keeps it; arrow keys move along the tabs). Wide screens: underline tabs. Phones: four tiles in one row, an icon over a short label, so nothing scrolls sideways or hides. **Forms: one field width** (`max-w-md`, 28rem) and one look: every drop-down is a `NativeSelect` (`components/ui/native-select.tsx`, same height, border and text as `Input`), never a hand-styled `<select>`; a button goes under its field, except a short pair like Expires + Make token that share a row. The donation is not a tab: one slim "UseHourly is free… Support" line under the tabs (`SupportHourly variant="line"`).
- **Public pages** (sign-in, calculator, guide): the same cards and notices on the neutral page; the sign-in forms sit in one card.

## How consistency is kept
- `npm run ci` (includes `scripts/check-rules.mjs` for the code-level rules above) and `npm run e2e` (every page gets `auditPage`: labels, form method, no sideways scroll, one heading, accessibility, card nesting, one solid button) must pass.
- After touching a colour or a shared component: run the contrast audit (both layouts).
- A new page or component starts by copying the nearest existing one, and adds itself to this file if it is a new pattern.
