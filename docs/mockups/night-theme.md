# Night theme mockup (issue 324, step 1)

Picture first: this is the mockup for the opt-in "Night" look, based on the Claude Console colours. The app does not
know Night yet. Nothing changes for anyone. Step 2 (the build) starts only after the owner records a pick on issue 324.

- `night-theme.css`: the proposed token block, `html[data-theme-mode="night"]`. Step 2 moves it into
  `src/app/globals.css`, after `.dark`. `:root` and `.dark` do not change.
- `e2e/night-mockup.spec.ts`: pastes the block into the sample-data demo and photographs Today, Week and Invoices in
  Dark (before) and Night (after), plus a sketch of the Account "Appearance" card (Light, Dark, Night).

Make the pictures (they go to `docs/mockups/night-theme/`):

```
NIGHT_MOCKUP=1 npx playwright test e2e/night-mockup.spec.ts --project=desktop
```

```
NIGHT_MOCKUP=1 npx playwright test e2e/night-mockup.spec.ts --project=phone
```

## The palette as tokens

| Token | Night | Note |
| --- | --- | --- |
| `--background` | #151515 | page |
| `--sidebar` | #0B0B0B | side menu, More drawer |
| `--card`, `--popover`, `--secondary`, `--muted`, `--sidebar-accent` | #212121 | white 5% over the page |
| `--accent` (hover, pressed) | #2C2C2C | white 10% |
| `--border`, `--input`, `--sidebar-border` | #2C2C2C | white 10% |
| `--foreground` and the text tokens | #F0EFEC | |
| `--secondary-foreground` | #C3C2B7 | secondary text |
| `--muted-foreground` | #9A9892 | lighter than the Console's #898781 so it passes 4.5:1 on cards and hover rows |
| `--amber`, `--ring`, `--sidebar-ring` | #6DA7EC | accent, links, focus |
| `--destructive` | #EC7E7E | error |
| `--chart-1..5` | cream #F0EEE6, blue #6DA7EC, clay #F09978, sage #BCD1CA, grey #9A9892 | |
| `--primary` / `--primary-foreground` | #F0EFEC / #151515 | light-on-dark buttons, as in Dark |
| `--radius` | 8px | 8px controls, 12px cards (`rounded-xl`) |
| `--shadow-sheet` | none | no glow, no gradient |

Not used as a text colour: #5F5E5A (disabled or decorative only). White on the soft blue is only about 2.4:1, so blue is
never a fill under words. Dark's success greens stay. The warning amber #DB9300 replaces a warning colour only where the
app already has one.
