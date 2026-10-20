# EventFlow design directions

The design spec for the public landing page and the logged-in app. **Chosen direction: After Hours, with a fully dark app** (decided 20 October 2026). Research and sources are in `RESEARCH.md`. Nothing here has been built yet.

Contents:
0. Decisions
1. Shared foundations
2. After Hours: the spec
3. Routing: how `/` coexists with the app
4. Landing page plan, section by section
5. Screenshots and demo loops from seeded data only
6. Engineering constraints: responsive, performance, accessibility, scope
7. Optional tooling, with benefit and cost
8. Build order
9. Follow-ups
- Appendix A: Ledger (not chosen; its light palette is the seed for a future light theme)
- Appendix B: Shamiana (not chosen)

Every contrast ratio below was computed with the WCAG 2.x relative-luminance formula. "AA" means 4.5:1 for normal text; non-text elements (input borders, focus rings, icons, chart marks) need 3:1.

---

## 0. Decisions (20 October 2026)

| # | Question | Decision | Where it lands |
|---|---|---|---|
| | Direction | **After Hours, full dark**: the landing and the whole app are dark | Section 2 |
| 1 | Can the page say "free"? | Yes, plainly | Hero line, FAQ |
| 2 | CTA naming | **"Create free account" everywhere** (nav, hero, how it works, final CTA). One action, one name; "Log in" stays for existing accounts | Section 4 |
| 3 | Cancelled bookings | Grey with strikethrough. Red now means only clash and errors | 1.1, 2.3 |
| 4 | Business name in screenshots | Fictional: **Shree Ganesh Caterers** (already a dev seed merchant) | Section 5 |
| 5 | Dark mode | The app is dark throughout, not only its chrome | 2.3, 2.6 |
| 6 | Logged-in merchant at `/` | Landing shows **"Open dashboard"**, no redirect | 3.3 |
| 7 | Mention phones? | **Stay silent.** No phone FAQ, no "on your phone" copy. The page itself is still fully responsive | Section 4 |
| 8 | Language | English only for now. No Hindi or Hinglish anywhere, no "coming soon" | Section 4 |
| 9 | Transform/opacity only? | Color, background and border cross-fades over 150ms are fine (paint only). Movement and size changes still use transform/opacity only | 1.5 |
| 10 | Ledger sidebar | Not applicable now: in After Hours the sidebar is dark. If a light theme is added later, revisit then | 2.6 |
| 11 | Inspect live sites for timings | Not needed. Values below are final until we adjust in the browser | Section 1.5, 2.5 |
| 12 | Inventory picker | **Quantity inputs** (what the code has). ROADMAP.md's "unit grid" entry is stale and should be corrected in a separate docs commit | Section 4.6 |
| 13 | `ui-ux-pro-max` | Fetched, reviewed and used in this research (see `RESEARCH.md` section 1). For a permanent install, see section 9 | Section 9 |

Two adjustments I made while writing this spec, flagged so you can push back:
- **Press feedback.** The first draft of After Hours had no scaling at all. Your brief's example asked for a press scale, so every button now presses to `scale(0.98)`, and the landing's primary CTA grows to `scale(1.02)` on hover. Hover inside the app is still a color change only.
- **Danger and WhatsApp buttons.** On dark surfaces, white text on red-700 or green-700 leaves the button edge too faint against dialogs (2.27:1 and 2.93:1). Both now use a lighter fill with dark text (6.62:1 and 6.54:1), which keeps the edge visible (5.31:1 and 6.45:1). Each keeps its icon and label, so red delete and green WhatsApp never depend on hue alone.

---

## 1. Shared foundations

### 1.1 Semantic color meaning

| Meaning | Before | Now | Why |
|---|---|---|---|
| Confirmed booking | teal | teal | Existing meaning. |
| Date clash | red | red | Existing meaning. |
| Inventory shortfall | amber | amber | Existing meaning. |
| Pending advance | amber | amber, but **always a status badge**, never a banner | Same hue as shortfall; different shape keeps "status" and "warning" apart. |
| Completed | indigo | indigo | Dark-surface values in 2.3. |
| Cancelled | red | **grey with strikethrough** | Decision 3. Red on the calendar now always means "look at this". |
| Errors | red | red (lighter tint on dark) | |
| WhatsApp action | green with white text | green-500 with dark text | Passes on dark surfaces (see section 0). |

Rule: **color never carries meaning alone.** Clash banners have an alert icon and the word "clash"; shortfall banners have a package icon and the counts; statuses carry their label text; cancelled has strikethrough and the word.

### 1.2 Breakpoints

Tailwind's defaults line up with the requested widths: base (375), `md` 768, `xl` 1280, `2xl` 1536. Design and test at exactly those four. `sm` 640 and `lg` 1024 stay for in-between fixes.

### 1.3 Type sizing rule

- **Landing:** fluid `clamp()` sizes from a 375px viewport to 1440px (scale in 2.2).
- **App:** fixed sizes. A working screen should not resize as the window changes.

### 1.4 Spacing

Keep Tailwind's 4px scale. Add three layout tokens:

| Token | Value | Use |
|---|---|---|
| `section` | `clamp(4rem, 2.592rem + 6.009vw, 8rem)` (64 to 128px) | Gap between landing sections |
| `block` | `clamp(2rem, 1.648rem + 1.502vw, 3rem)` (32 to 48px) | Section heading to content |
| `gutter` | `clamp(1rem, 0.648rem + 1.502vw, 2rem)` (16 to 32px) | Page side padding |

Content max width 72rem (1152px); prose max 65ch.

### 1.5 Motion base

**Durations**

| Token | ms | Use |
|---|---|---|
| `press` | 100 | Button and card press |
| `hover` | 150 | Hover background, border or color change |
| `state` | 180 | Toggles, tab indicator, banner appearing |
| `enter` | 240 | Dialog and popover in |
| `exit` | 160 | Dialog and popover out (exit is faster than enter) |
| `sheet-in` | 280 | Drawer (`BookingDetail`) and booking sheet in |
| `sheet-out` | 200 | Drawer and sheet out |
| `hero` | about 900 total | The one orchestrated landing moment, played once |

**Easings**

| Token | Curve | Source |
|---|---|---|
| `out` | `cubic-bezier(0.2, 0, 0, 1)` | Interaction-design skill "standard" |
| `enter` | `cubic-bezier(0, 0, 0.2, 1)` | Same as Razorpay Blade `entrance` |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | Interaction-design skill "exit" |
| `move` | `cubic-bezier(0.3, 0, 0.2, 1)` | Same as Razorpay Blade `standard` |

**Rules**
- Anything that moves or resizes uses `transform` and `opacity` only. Color, background-color and border-color may cross-fade over `hover` (decision 9). Never animate width, height, top, left, margin or padding.
- Replace the standard `transition-all duration-200` with an explicit list (`transition-[transform,opacity,background-color,border-color,color]`) so layout never animates by accident. `CODING_STANDARDS.md` needs a one-line update when the build starts.
- CSS transitions, not keyframes, for anything the merchant can interrupt (opening and closing a drawer quickly reverses smoothly).
- No motion on keyboard-initiated or very frequent actions (switching sidebar screens, typing).
- **Focus:** `focus-visible` only, drawn as `outline: 2px solid var(--focus); outline-offset: 2px`. Outline, not box-shadow, so it survives Windows high-contrast mode.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, drop every transform (no slide, no scale), keep opacity fades at 120ms or less, show the hero demo in its final state with a "Play" button instead of autoplay, and stop the `animate-pulse` skeletons. In Tailwind: `motion-safe:` on transforms, plus a global rule in `index.css`.

### 1.6 Fixes every screen needs, whatever the look

From the audit in `RESEARCH.md` section 2:
- `ConfirmDialog`, `AddInventoryItemModal`, `BookingDetail`: add Escape to close.
- All dialogs and drawers (those three, the `BookingPage` sheet, the Profile modals): trap focus while open, return focus to the trigger on close, make the rest of the page `inert`.
- Sidebar: `aria-current="page"` on the active item, plus a non-color active marker.
- Replace `text-slate-400` labels (2.56:1, 41 uses) with `text-3` (at least 4.69:1 on every dark surface).
- Replace the ⛺ emoji favicon and the stock `CalendarDays` logo with a drawn mark (2.4).

---

## 2. After Hours: the spec

**Mood:** the evening of an event. Dark, precise and quietly lit, like a shamiana at night under string lights. The calm "premium tool" look people share from Linear and Raycast, made warmer and specific to the trade.

**The one bold thing:** **dates drawn as small lights.** In the landing hero, a month of dates where booked days glow teal, the clash day glows red with a ring, and free days are dim. Choosing a lit date shows its bookings. The same idea carries into the app: the calendar's "today" is a teal ring, and a clash day carries a small red light beside its number. Nothing else on the page glows.

**Draws from:** Linear (dark neutral chrome, the real product doing the explaining, themes from a few inputs), Raycast (hero object built from the product's own vocabulary), Vercel (elevation by surface steps and borders, monochrome plus meaning, no decorative shadows), Resend (the product's states shown as content), Family (continuity: what you entered becomes what you confirm), Cal.com and Razorpay Blade (button press feedback).

### 2.1 Typography

**Family:** Schibsted Grotesk (Bakken & Baeck for Schibsted), Google Fonts, OFL. A firm, compact newspaper grotesk; not the default Inter look.
- Verified in the font file: has the ₹ glyph and tabular figures (`tnum`); variable weight 400 to 900.
- Self-hosted (the CSP blocks Google's CDN). Latin subset plus ₹: **39.4 KB** as one WOFF2 (measured).
- No Devanagari. If a Hindi interface is ever built, pair it with Anek Devanagari or Mukta as the Devanagari fallback in the font stack.
- Rejected on inspection: Instrument Sans and Onest (no ₹), Hanken Grotesk (no ₹, no tabular figures), Geist and Mona Sans (read as Vercel and GitHub).

| Role | Weight | Notes |
|---|---|---|
| Display | 700, tracking -0.02em | Landing only |
| Headings | 600 | |
| Body, UI | 400; 500 for labels and buttons | Body line-height 1.6 (a touch looser on dark) |
| Amounts, dates | 500, `tabular-nums` | Always tabular so columns of ₹ line up |

Never below 400: thin weights break up on dark backgrounds.

### 2.2 Type scale

**Landing** (base 16px, ratio 1.2 at 375px to 1.333 at 1440px; stops growing above 1440):

| Step | 375px | 1440px | CSS |
|---|---|---|---|
| sm | 13 | 13 | `0.8125rem` |
| base | 16 | 16 | `1rem` |
| lg | 19 | 21 | `clamp(1.1875rem, 1.143rem + 0.1878vw, 1.3125rem)` |
| xl | 23 | 28 | `clamp(1.4375rem, 1.327rem + 0.4695vw, 1.75rem)` |
| 2xl | 28 | 38 | `clamp(1.75rem, 1.53rem + 0.939vw, 2.375rem)` |
| 3xl | 33 | 51 | `clamp(2.0625rem, 1.666rem + 1.69vw, 3.1875rem)` |
| 4xl | 40 | 67 | `clamp(2.5rem, 1.906rem + 2.535vw, 4.1875rem)` |
| display | 48 | 90 | `clamp(3rem, 2.076rem + 3.944vw, 5.625rem)` |

**App** (fixed): xs 12, sm 13, base 15, lg 17, xl 20, 2xl 24px. Screen titles at 2xl/600; section titles at lg/600; body at base/400. Today almost everything is 14px, so this adds real hierarchy.

### 2.3 Color tokens (all dark)

**Surfaces.** Elevation is shown by lighter surface steps, not shadows.

| Token | Hex | Use |
|---|---|---|
| `sidebar` | `#0A101C` | Sidebar (recessed, darkest) |
| `input` | `#0A101C` | Input fields (sunken into the card) |
| `canvas` | `#0E1524` | Page background, calendar |
| `raised` | `#172033` | Cards, table headers, landing panels |
| `overlay` | `#1D2840` | Drawers, dialogs, menus, row hover |
| `line` | `#243049` | Hairlines and dividers (decorative) |
| `line-strong` | `#6E7A93` | Input and control borders, dialog borders |

**Text**

| Token | Hex | canvas | sidebar/input | raised | overlay |
|---|---|---|---|---|---|
| `text-1` primary | `#E7EBF2` | 15.25 | 15.91 | 13.61 | 12.28 |
| `text-2` secondary | `#A9B3C6` | 8.64 | 9.01 | 7.71 | 6.96 |
| `text-3` muted, labels, placeholders | `#8792A8` | 5.83 | 6.08 | 5.20 | 4.69 |

`text-1` is deliberately not pure white, which reduces glare and the halo effect on dark screens.

**Lines and focus (non-text, need 3:1)**

| Pair | Ratio |
|---|---|
| `line-strong` vs canvas / input / raised / overlay | 4.23 / 4.41 / 3.77 / 3.40 |
| `focus` `#5EEAD4` vs canvas / input / raised / overlay | 12.33 / 12.86 / 11.00 / 9.93 |

**Accent and buttons**

| Element | Colors | Ratio |
|---|---|---|
| `accent` (primary button fill, links, focus) | `#5EEAD4` (teal-300) | link on canvas 12.33 |
| Primary button | ink `#042F2C` on `#5EEAD4` | 9.80 |
| Primary hover | ink on `#99F6E4` (teal-200) | 11.50 |
| Secondary button | `text-1` on transparent, 1px `line-strong` border; hover fill `raised` | 13.61 on hover fill |
| Danger button (delete account, delete booking) | ink `#2A0A0A` on `#F87171` (red-400); hover `#FCA5A5` | 6.62; hover 9.65; edge vs overlay 5.31 |
| WhatsApp button | ink `#052E16` on `#22C55E` (green-500); hover `#4ADE80` | 6.54; hover 8.55; edge vs overlay 6.45 |
| Disabled button | `#67728B` on `#1D2537`, no pointer | 3.18 (disabled controls are exempt from AA; still legible) |
| `accent-soft` (selected row, active nav) | `text-1` on `#0F2A2D` | 12.64 |

**Status badges** (pill, tinted fill, label text)

| Status | Text on fill | Ratio |
|---|---|---|
| Confirmed | `#5EEAD4` on `#0F2A2D` | 10.22 |
| Pending advance | `#FCD34D` on `#2A2312` | 10.81 |
| Completed | `#A5B4FC` on `#1C1E3A` | 8.13 |
| Cancelled | `#A9B3C6` on `#222B3E`, struck through | 6.71 |
| Inventory available | `#6EE7B7` on `#0B2A22` | 10.07 |
| Inventory in use today | `#FCD34D` on `#2A2312` | 10.81 |
| Inventory damaged | `#FCA5A5` on `#2B1519` | 9.04 |
| Sidebar pending count | ink `#422006` on `#FCD34D` | 10.11 |

**Banners**

| Banner | Fill | Title / body | Edge | Ratios |
|---|---|---|---|---|
| Date clash | `#2B1519` | `text-1` / `#FCA5A5` | 4px left edge `#F87171` | title 14.35, body 9.04, edge 6.20 vs fill and 5.88 vs raised |
| Stock shortfall | `#2A2312` | `text-1` / `#FCD34D` | 1px full border `#F59E0B` | body 10.81, edge 7.26 vs fill and 7.57 vs raised |

Different shape (left edge vs full border), icon (alert vs package) and hue, so the two warnings are told apart three ways.

**Calendar event pills** (filled, so a month of events stays readable)

| Status | Text on fill | Ratio | Extra cue |
|---|---|---|---|
| Confirmed | `#F0FDFA` on `#115E59` | 7.27 | 3px left stripe `#5EEAD4` (5.13 vs pill) |
| Pending | `#FEF3C7` on `#78350F` | 8.15 | "Advance due" in the drawer |
| Completed | `#E0E7FF` on `#3730A3` | 8.06 | Check icon |
| Cancelled | `#A9B3C6` on `#273248` | 6.08 | Strikethrough |

Calendar: day numbers `text-2` (8.64), other-month days `text-3` (5.83), today a 2px `#5EEAD4` ring (12.33), clash day a red light `#F87171` beside the number (6.59) plus an accessible label "date clash".

**Messages:** error text `#FCA5A5` (7.74 on overlay, 9.61 on canvas); success and "target met" text `#6EE7B7` (9.64 on overlay).

**Charts (recharts):** series 1 `#5EEAD4` (11.00 vs raised), series 2 `#A5B4FC` (8.16). The two series are close in lightness (1.35:1), so they must differ by mark too: revenue as bars, target as a dashed line. Grid lines `line`, axis labels `text-3` (5.20), tooltip on `overlay` with a `line-strong` border.

**Backdrop:** `rgb(5 8 15 / 0.72)` over the page (measured composite `#080C15`). Dialogs and drawers sit on `overlay` with a 1px `line-strong` border, 4.53:1 against the backdrop, so the panel edge is always clear.

**Browser chrome:** `<html style="color-scheme: dark">` so native date pickers, selects and scrollbars render dark; `<meta name="theme-color" content="#0E1524">` (today `#0d9488`).

### 2.4 Shape, border, elevation

| Token | Value | Use |
|---|---|---|
| `radius-control` | 6px | Inputs, buttons, chips, calendar pills |
| `radius-card` | 8px | Cards, banners, table wrappers |
| `radius-sheet` | 12px | Dialogs, drawer leading corners, landing screenshots |
| `radius-pill` | 9999px | Status badges only |
| Borders | 1px `line` for structure; 1px `line-strong` for inputs and overlays | |
| Shadows | **None.** Elevation is a lighter surface plus a border | |

**Mark:** a tent drawn as a single line with one small teal light at the ridge. Used as an SVG favicon and logo, replacing ⛺ and `CalendarDays`.

### 2.5 Motion

- **Buttons (all):** press `scale(0.98)` over 100ms `out`; release returns over 150ms.
- **Landing primary CTA:** hover `scale(1.02)` plus fill to `#99F6E4` over 150ms `out`. Under reduced motion, color only.
- **App hover:** background or border color only, over 150ms. No scale, no lift.
- **Links:** underlined in body copy (not color alone); hover thickens the underline from 1px to 2px.
- **Clickable rows and cards** (inventory items, pending balances, records): hover fill `overlay`. Non-clickable cards: no hover at all.
- **Drawer:** `translateX(100%)` to 0 over 280ms `enter`; out over 200ms `exit`; backdrop opacity over 200ms.
- **Dialog:** opacity 0 to 1 and `scale(0.97)` to 1 over 240ms `enter`; out over 160ms.
- **Banners:** clash and shortfall appear with opacity plus `translateY(-4px)` to 0 over 180ms. They never shake or pulse.
- **Continuity:** after "Confirm booking", the button label cross-fades to "Booked" and the new booking's calendar day briefly lights (teal light fades in over 240ms). The first booking a merchant ever saves gets a one-time 600ms glow on its day; never again.
- **Hero lights:** see 4.2.

### 2.6 How it applies across the product

| Surface | Treatment |
|---|---|
| Landing | Dark throughout on `canvas`, with `raised` panels for the hero demo and FAQ. Screenshots of the (dark) app sit in a 1px `line` frame with 12px corners. No fake browser or phone chrome. |
| Login, signup, reset (`AuthCard`) | `raised` card on `canvas`, new mark, primary button teal. |
| Sidebar | `sidebar` background with a right `line` border. Active item: `accent-soft` fill, 3px teal bar, `aria-current`. Business name in `text-1`/600. |
| Calendar (FullCalendar) | Set FullCalendar's own CSS variables (`--fc-page-bg-color`, `--fc-border-color`, `--fc-neutral-bg-color`, `--fc-today-bg-color` transparent, `--fc-button-*`) from the tokens instead of hex in `index.css`. Toolbar buttons become secondary buttons, so teal is not spent on navigation. Pills as in 2.3 with `radius-control` (not fully round) so long names truncate cleanly. |
| Morning briefing | A `raised` card at the top of the calendar; numbers in `text-1`/500 tabular, labels in `text-2`. |
| Booking drawer (`BookingDetail`) | `overlay` surface. Header shows the event date large in `text-1` with the countdown in `text-2`. Sections divided by `line`, not boxed. WhatsApp buttons in green-500. |
| Booking sheet (`BookingPage`) | Inputs on `input` with `line-strong` borders. Clash banner directly under the date field; shortfall banner directly under the item quantity rows. Submit always enabled for clashes; confirm-anyway dialog for shortfalls (rules unchanged). |
| Dialogs | Native `<dialog>` (see 7.2), `overlay` surface, `line-strong` border, `radius-sheet`. |
| Records table | Header row `raised` with `text-2` labels; row dividers `line`; hover row `overlay`; amounts right-aligned and tabular. |
| Pending balances | Each row: client, event date, balance in `text-1`/500. Totals in a `raised` summary bar. |
| Analytics, My Activity | Cards on `raised`; the number is the largest thing in the card, its label below in `text-2`. Charts per 2.3. |
| Inventory | Item cards on `raised`; available / in use / damaged as badges (2.3). |
| Profile, danger zone | Sections on `raised`. Danger zone title in `#FCA5A5`, delete button in red-400 with dark text. |
| Empty states | One line of `text-2` and a single action ("Add your first item"). A faint row of dim lights (the hero motif at 40% `text-3`) behind the empty calendar only. |
| Loading | Skeletons in `overlay`, gently pulsing (stopped under reduced motion). |
| Printed report and PDF | **Stay light.** They are paper documents; the report window keeps its current light styling. |
| Excel export, WhatsApp messages | Unaffected. |

### 2.7 Daylight legibility (the main risk of full dark)

Merchants often work in bright shops or at venues during the day, where dark screens are harder to read. Mitigations built into this spec:
- High text contrast: primary text 12 to 16:1, and even muted text never below 4.69:1.
- Body text 15px (app) and 16px (landing), weights never below 400.
- No thin grey-on-grey: every label uses `text-2` or `text-3` from the table above.
- All colors are CSS variables (2.8), so a light theme can be added later by supplying a second set of values (Appendix A has a ready, contrast-checked light palette). Worth revisiting once merchants use the dark app in daylight.

### 2.8 Tailwind mapping (sketch, not applied)

Define tokens as CSS variables in `index.css` and point Tailwind at them, so a future light theme is a value swap rather than a rewrite:

```css
/* index.css (sketch) */
:root {
  color-scheme: dark;
  --sidebar: 10 16 28;   --canvas: 14 21 36;   --raised: 23 32 51;   --overlay: 29 40 64;
  --line: 36 48 73;      --line-strong: 110 122 147;
  --text-1: 231 235 242; --text-2: 169 179 198; --text-3: 135 146 168;
  --accent: 94 234 212;  --accent-hover: 153 246 228; --accent-ink: 4 47 44; --accent-soft: 15 42 45;
  --focus: 94 234 212;
}
```

```js
// tailwind.config.js theme.extend (sketch)
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`
colors: {
  sidebar: v('sidebar'), canvas: v('canvas'), raised: v('raised'), overlay: v('overlay'),
  line: { DEFAULT: v('line'), strong: v('line-strong') },
  fg: { 1: v('text-1'), 2: v('text-2'), 3: v('text-3') },
  accent: { DEFAULT: v('accent'), hover: v('accent-hover'), ink: v('accent-ink'), soft: v('accent-soft') },
  // status, banner and pill colors from 2.3 as fixed values (they do not change per theme)
},
fontFamily: { sans: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'] },
borderRadius: { control: '6px', card: '8px', sheet: '12px' },
spacing: {
  section: 'clamp(4rem, 2.592rem + 6.009vw, 8rem)',
  block: 'clamp(2rem, 1.648rem + 1.502vw, 3rem)',
  gutter: 'clamp(1rem, 0.648rem + 1.502vw, 2rem)',
},
transitionDuration: { press: '100ms', hover: '150ms', state: '180ms', enter: '240ms', exit: '160ms', 'sheet-in': '280ms', 'sheet-out': '200ms' },
transitionTimingFunction: {
  out: 'cubic-bezier(0.2, 0, 0, 1)', enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)', move: 'cubic-bezier(0.3, 0, 0.2, 1)',
},
```

Custom names (`bg-canvas`, `text-fg-2`, `rounded-card`) replace `slate-*` and the default radius and shadow classes.

**If Tailwind v4 is adopted:** the same values go in `@theme` in `index.css` and become CSS variables automatically. Watch the renamed defaults (`shadow-sm` becomes `shadow-xs`, `rounded` becomes `rounded-sm`, `ring` becomes 1px currentColor, border color defaults to currentColor); the custom names above avoid most of that churn.

---

## 3. Routing: how `/` coexists with the app

### 3.1 Today

`App.jsx` matches `window.location.pathname` by hand: `/` is the app behind the auth gate, `/privacy` the policy, everything else the 404 page. `vercel.json` sends every non-`/api` path to `index.html`. `checkAuth()` runs on mount for every route, including `/privacy`.

### 3.2 Proposal

| Path | Shows | Calls the API? |
|---|---|---|
| `/` | Landing page | **No** |
| `/login` | Login | Only on submit |
| `/signup` | Sign-up flow | Only on submit |
| `/forgot-password` | Reset flow | Only on submit |
| `/app` | The logged-in app (today's `/`) | Yes, `checkAuth()` |
| `/privacy` | Privacy policy (its "Back to sign in" link changes to `/login`) | **No** (gate `checkAuth()` to `/app`) |
| anything else | 404 | No |

- Keep the small hand-written path switch; six paths do not need a router library. Move it **above** `App`: `main.jsx` picks the route and lazy-loads either the landing bundle or the app bundle, so the landing never downloads FullCalendar, recharts, jsPDF, html2canvas or xlsx.
- `/app` without a session redirects to `/login?next=/app`; after login, go to `next` (same-origin paths only).
- Landing "Create free account" goes to `/signup`, "Log in" to `/login`. Inside the auth screens, the in-page switches become real links so the back button works.
- `vercel.json` needs no change for this; it changes only if the landing is pre-rendered (7.4).

### 3.3 Logged-in merchant at `/` (decision 6)

The session cookie is `httpOnly`, so the landing cannot see it, and calling the API would wake the Render server for every visitor. So:
- On successful login or `/api/auth/me`, the app writes a **UI hint** to `localStorage` (`ef:signedIn = "1"`). It is not a token and holds no personal data. It is cleared on logout, on any 401 and on account deletion.
- At `/`, if the hint is present, the nav and hero show **"Open dashboard"** (to `/app`) in place of "Log in" and "Create free account". No redirect, so the landing stays reachable and a stale hint can never loop.
- A stale hint costs one step: `/app` runs `checkAuth()`, gets a 401, clears the hint and shows `/login`.
- The `localStorage` read is wrapped in try/catch (private browsing can throw).

---

## 4. Landing page plan

Copy rules: plain merchant English, 8 to 14 words per sentence, verbs on buttons, one name per action (decision 2), no em dashes, amounts in Indian format, no invented numbers, logos or quotes, nothing about phones (decision 7) or languages (decision 8). Section titles in sentence case.

### 4.1 Nav

- **Purpose:** reach signup or login fast; jump to the explainers.
- **Layout:**
```
1280: [mark] EventFlow    Features  How it works  FAQ      Log in  [Create free account]
375:  [mark] EventFlow                                     Log in  [Menu]
```
  The bar is `canvas` with a bottom `line` once the page scrolls (no shadow). At 375 the anchors and "Create free account" move into a disclosure menu (`<button aria-expanded>` opening a list, not a drawer).
- **Copy:** "Features", "How it works", "FAQ", "Log in", "Create free account". With the signed-in hint: "Open dashboard".
- **Interactions:** anchors scroll natively (`scroll-behavior: smooth` only under `motion-safe`) and move focus to the section heading. No scroll spy. "Skip to content" is the first focusable element. Targets at least 44px tall.

### 4.2 Hero

- **Purpose:** in five seconds an owner sees this is for them, and sees the core idea: you get warned, you still decide.
- **Layout (1280):**
```
| H1 (left, about 14 characters per line)        |  ┌ Sample month ─────────────────┐ |
| Subhead (2 lines max)                          |  │  M  T  W  T  F  S  S          │ |
|                                                |  │  ·  ·  ●  ·  ·  ●  ·          │ |
| [Create free account]   See how it works       |  │  ·  ●  ·  ·  ·  ·  ◉  ← 14    │ |
| Free to use. Sign up with your email.          |  │  ...                          │ |
|                                                |  │ ┌ 14 February ──────────────┐ │ |
|                                                |  │ │ Verma family, wedding     │ │ |
|                                                |  │ │ Khan family, wedding (new)│ │ |
|                                                |  │ │ Date clash: ...           │ │ |
|                                                |  │ │ [Confirm booking]         │ │ |
|                                                |  │ └───────────────────────────┘ │ |
| ─────── real calendar screenshot below the fold line, cropped, 12px corners ────── |
```
  At 768: two narrower columns. At 375: H1, subhead, CTA, then the lights panel full width, then the screenshot cropped to one week.
- **Copy direction:**
  - H1: "Every booking, advance and chair, on one screen."
  - Subhead: "EventFlow keeps your event dates, advances and stock together. It warns you about clashes and short stock, and you decide."
  - Primary: "Create free account". Secondary text link: "See how it works".
  - Under the button: "Free to use. Sign up with your email."
- **The lights panel (built in HTML and CSS, not an image):**
  - A 7-column month of sample dates. Each date is a small light (10px dot) above its number. Booked dates are teal `#5EEAD4`, the clash date (14th) is red `#F87171` with a 2px ring, free dates are `text-3` at 40%.
  - Only booked dates and the clash date are buttons (about six), each with a label such as "14 February: two weddings, date clash". Free dates are plain text, so keyboard users are not walked through 28 stops.
  - Choosing a date shows its bookings in the card below. The 14th's card shows both weddings, the clash banner, and a **"Confirm booking" button that stays enabled**. Pressing it cross-fades the label to "Booked" and adds the line "2 events on 14 Feb. Both saved." announced through a polite live region.
- **Sequence (once, when the panel first enters the viewport):** lights fade in left to right, 180ms each, staggered 20ms (about 0.6s for the month); 300ms later the 14th's ring appears and its card opens with the clash banner (180ms). If the panel is off-screen, the sequence waits; if the tab is hidden, it pauses. A small "Play again" button resets it. Reduced motion: the final state is shown immediately.
- **Panel label:** "Sample month with made-up bookings".
- **Performance:** the hero screenshot is the LCP image (`fetchpriority="high"`, explicit width and height, not lazy). The lights panel is a few dozen elements and no images.

### 4.3 Problem

- **Purpose:** name the paper habit exactly, so the owner feels understood.
- **Layout:** left: title and two lines. Right (stacked at 375): three short items, each with a small line drawing in `text-3` strokes (a register page, a stack of advance slips, a thought bubble of chairs) and two lines of text, separated by `line`. Not cards.
- **Copy direction:**
  - Title: "Right now it lives in three places"
  - "Dates and names in the booking register, in pen."
  - "Advances on separate slips, or in your head."
  - "How many chairs are free on the 14th? Only you know."
  - Closing: "When two families want the same date, or 400 chairs are promised on a day you own 300, you find out late."
- **Interactions:** none.

### 4.4 Features

- **Purpose:** six features, each named by what the owner gets.
- **Layout:** two large rows for the headline features (clash alerts, stock per date), each with a cropped dark screenshot of that state. Then a 2x2 grid (2x1 at 768, one column at 375) for the other four: text plus a small cropped UI fragment. Not six identical icon cards.
- **Copy direction:**
  - **Clash alerts that don't stop you.** "If a date already has an event, you see it before you save. You decide if you can do both."
  - **Stock checked for the event date.** "Add chairs, tables and tents to a booking. If that day's other bookings already use them, you see the shortfall and confirm only if you mean it."
  - **WhatsApp in one tap.** "The confirmation or payment reminder opens in WhatsApp, filled in and signed with your business name. You press send."
  - **Pending balances in one list.** "Every booking with money still to come, and how much."
  - **Reports and Excel.** "Pick a date range for a printable report or PDF. Download your records as an Excel file."
  - **Morning briefing.** "Open the app to a short note: events this week, balances due and your next event."
- **Interactions:** none (these blocks are not clickable).

### 4.5 How it works

- **Purpose:** show setup is small. A real sequence, so numbering is honest.
- **Layout:** three columns at 1280 and 768, stacked at 375; each step a number in `accent`, a title and one line; a thin `line` connects them on wide screens.
- **Copy direction:**
  1. "Create your account. Your email, a one-time code, a password."
  2. "Add your stock. Item names and how many you own."
  3. "Log your bookings. Date, client, guests and what they need."
  - Then "[Create free account]".
- **Interactions:** the button only.

### 4.6 Product tour

- **Purpose:** let a careful owner look around before signing up.
- **Layout:** tabs (Calendar, New booking, Booking details, Pending balances, Reports) above one large framed screenshot. At 375 the tabs become a horizontally scrollable row with a visible edge fade, and the screenshot is cropped to the relevant region.
- **Copy direction**, one line under each image:
  - Calendar: "Your month at a glance, with clashes marked."
  - New booking: "Date, client, venue and guests, then the items and quantities they need."
  - Booking details: "Client, event, money and stock for one booking, with the WhatsApp buttons."
  - Pending balances: "Who still owes what, nearest event first."
  - Reports: "Pick dates, then print, save as PDF or download Excel."
- **Interactions:** WAI-ARIA tabs (arrow keys between tabs, Tab into the panel). Images cross-fade over 180ms; no sliding. All images lazy-loaded. Only the "New booking" tab may carry a short loop (section 5), with a visible pause button, `preload="none"` and a poster frame.

### 4.7 Built for Indian event businesses

- **Purpose:** show the local details are right, without flag-waving.
- **Layout:** title left; four short facts right, each paired with a tiny example rendered in the app's style.
- **Copy direction:**
  - "Amounts the way you write them: ₹1,20,000, not ₹120,000."
  - "Dates and 'today' in Indian time, wherever the server is."
  - "Weddings, birthdays, corporate events, or your own event type."
  - "Messages go out on WhatsApp, under your business name."
- **Interactions:** none. No GST, UPI collection, languages or anything not built.

### 4.8 Security and privacy

- **Purpose:** plain, specific, honest; matches `/privacy` and DATA_PRIVACY.md.
- **Layout:** two columns of short statements, then a text link.
- **Copy direction:**
  - "Every account is confirmed with a one-time code sent to your email."
  - "Each business sees only its own bookings, stock and records."
  - "See which devices signed in recently, and sign out the others."
  - "Delete your account from Profile. Everything is removed straight away."
  - "The person who runs EventFlow can technically access the database, and looks at your data only when you ask for help."
  - Link: "Read the privacy policy" (`/privacy`).
- **Interactions:** none.

### 4.9 FAQ

- **Purpose:** answer what stops a signup.
- **Layout:** one column, max 65ch, native `<details>`/`<summary>` on `raised` rows separated by `line`. Opening rotates the chevron 90 degrees over 150ms; content appears without animating height.
- **Questions** (every answer must stay true):
  - "Is it free?" "Yes. Creating an account and using EventFlow is free."
  - "Does EventFlow message my clients itself?" "No. It opens WhatsApp with the message ready, and you send it yourself."
  - "What happens if two bookings fall on the same day?" "You see a clash alert. You can still save both."
  - "What if I don't have enough chairs for an event?" "You see what is short for that date, and you can confirm anyway if you have a plan."
  - "Can I get my data out?" "Download your records as Excel any time. For a full export, write to eventflow.support@gmail.com."
  - "Can I delete my account?" "Yes, from Profile. You confirm with your password and business name, and everything is deleted at once."
  - "Do I need to install anything?" "No. EventFlow runs in your web browser."
- **Interactions:** as above.

### 4.10 Final CTA and footer

- **Layout:**
```
Put this season's bookings in one place.        [Create free account]
──────────────────────────────────────────────────────────────────────
EventFlow      Privacy policy   Contact   Log in               © 2026 EventFlow
```
- **Copy:** as above; "Contact" is a `mailto:` for eventflow.support@gmail.com. No social links (there are none).
- **Interactions:** the button as in the hero.

---

## 5. Screenshots and demo loops from seeded data only

Per DATA_PRIVACY.md: never capture production, never show a real client.

1. **Source:** local dev against the Neon dev branch, seeded with `db/seedMerchants.js`. The production-host guard already refuses production.
2. **Business name:** **Shree Ganesh Caterers** (decision 4), logged in as that seed merchant. Never Bala Ji Tent House.
3. **Client data:** seeded fictional names and Meerut localities only. The seed phone pattern (`98765432xx`) is shaped like a real number, so mask phones in every capture (`98765 4XXXX`) or seed visibly impossible ones for screenshots.
4. **Freeze time:** seed bookings into one demo month (February 2026, wedding season, with a clash on the 14th to match the hero), and fix the browser clock to that month, so the calendar, countdowns and "this week" lines agree in every image.
5. **Capture:** dark theme, 1440x900 at 2x for desktop shots; cursor hidden.
6. **Output:** AVIF with WebP fallback in `<picture>`, widths 640/960/1440/2160, explicit width and height, `loading="lazy"` and `decoding="async"` below the fold, hero eager with `fetchpriority="high"`. Stored in `client/public/landing/` (same origin, CSP-safe). Alt text describes the state, e.g. "Calendar for February 2026 with two weddings on the 14th and a red clash light".
7. **Short loop** ("New booking" tab only): 6 to 8 seconds, H.264 MP4 plus WebM, under 1.5 MB, muted, `playsinline`, `preload="none"`, poster frame, visible pause control, no autoplay under reduced motion, paused when off-screen.
8. **Review before commit:** check every image for names, phone numbers and emails before it enters the repo.

---

## 6. Engineering constraints

### 6.1 Responsive

| Width | Landing | App (notes only) |
|---|---|---|
| 375 | One column; lights panel full width; tour tabs scroll; nav in a menu | Sidebar already becomes an off-canvas menu below `md`; drawers go full width. Mobile-only bugs (e.g. #094) stay out of scope. |
| 768 | Two-column hero; features two columns | Calendar month view usable; drawer 480px over content. |
| 1280 | Full layout, 72rem container | Primary design width. |
| 1536 | Same container, more side space; display type at max | Calendar gains width; no layout change. |

### 6.2 Performance budget (landing)

| Item | Budget |
|---|---|
| JS for `/` (gzipped) | Under 90 KB including React and ReactDOM; no FullCalendar, recharts, jsPDF, html2canvas, xlsx |
| CSS (gzipped) | Under 20 KB |
| Fonts | One WOFF2 (39.4 KB), preloaded, `font-display: swap`, with a size-adjusted fallback to avoid layout shift |
| Hero image | Under 120 KB AVIF at 1440 wide |
| Video | None in the hero; tour loop under 1.5 MB, not preloaded |
| Third-party requests | Zero (also required by the CSP) |
| API requests on `/` | Zero |
| Targets | LCP under 2.5 s on throttled 4G, CLS under 0.05, Lighthouse Performance and Accessibility 90 or above |

### 6.3 Accessibility

- Landmarks: `header`, `main`, `footer`; one `h1`; headings in order; skip link to `main`.
- Everything reachable and operable by keyboard; tour tabs follow the tabs pattern; FAQ uses `<details>`.
- AA contrast for every pair in 2.3 (all computed); focus outlines at least 9.93:1.
- Alt text on every screenshot describing the state; decorative drawings `alt=""`.
- `lang="en-IN"` on `<html>` (today `en`) so screen readers read ₹ amounts with Indian English.
- `color-scheme: dark` so native controls match.
- Landing touch targets at least 44px (WCAG 2.2 AA asks for 24px; 44 is the comfortable size).
- App fixes from 1.6.

### 6.4 Scope (ROADMAP.md)

Show only shipped features. Not shown or hinted: customer portal or client-facing pages, WhatsApp booking intake, payment collection or gateway, bulk or automatic WhatsApp reminders, quotation PDFs, client ledger or repeat-client detection, deploy/return tracking, multi-day events, Google or phone login, Hindi or other languages, native apps.

---

## 7. Optional tooling

None of these is needed. The spec works with Tailwind v3, plain CSS transitions and the current dependencies.

### 7.1 Self-hosted font file (practically required)
- **Benefit:** the CSP blocks Google's font CDN, so self-hosting is the only way to use Schibsted Grotesk.
- **Cost:** no dependency if the subset WOFF2 is committed to `client/public/fonts/` with `@font-face` in `index.css`. Re-verify: no CSP violations, no layout shift on swap.
- **Optional:** yes; the system font stack still works, but the direction loses its typeface.

### 7.2 Native `<dialog>` instead of a headless library
- **Benefit:** `showModal()` gives Escape-to-close, a top layer, `::backdrop` and an inert page behind it, in every modern browser since 2022. A small hook adds focus return. Fixes most of 1.6 with no dependency.
- **Cost:** rework of five overlay components. Re-verify every modal flow, including the inventory confirm-anyway step and account deletion.
- **Optional:** yes.

### 7.3 Radix primitives
- **Benefit:** tested focus management and ARIA for menus, popovers and comboboxes beyond what `<dialog>` covers.
- **Cost:** a new dependency tree; measure the gzipped size with `vite build` before adopting. Unstyled, so no visual lock-in. Re-verify all overlays.
- **Optional:** yes. Start with 7.2; add Radix only when a widget needs it.

### 7.4 Pre-rendering the landing route
- **Benefit:** the landing HTML ships with its content (faster first paint, link previews and indexing without JS).
- **Cost:** two entries (`index.html` for the landing, `app.html` for the app) with `vercel.json` rewrites for `/app`, `/login`, `/signup`, `/forgot-password` and `/privacy`. Landing components must render without `window` at import time. A small script using Vite's SSR build and `react-dom/server` needs no runtime dependency. **CSP:** `script-src 'self'` blocks inline scripts, so any tool that injects inline hydration JSON will break.
- **Optional:** yes. The route split in 3.2 gets most of the speed without it.

### 7.5 Tailwind v4
- **Benefit:** tokens in CSS (`@theme`) become variables automatically, which suits this variable-based spec; faster builds; the only fix for the accepted build-time advisories BUGS #088 and #093.
- **Cost:** the browser floor rises to Safari 16.4, Chrome 111 and Firefox 128 (official upgrade guide), so an older iPhone that can't update past iOS 16.4 would get broken styles. Utility renames across the codebase; changed defaults (border color and ring become currentColor, button cursor default); the JS config needs an explicit `@config`. The upgrade tool (`npx @tailwindcss/upgrade`) does most of it. Best as its own commit with no visual change, before the restyle.
- **Optional:** yes.

### 7.6 Motion library (`motion`, formerly Framer Motion)
- **Benefit:** springs and shared-element layout animations.
- **Cost:** a JS animation runtime, animation on the main thread, and nothing in this spec needs it.
- **Optional:** yes, and not recommended. CSS transitions and the Web Animations API cover every interaction here; the hero lights are CSS transitions with staggered delays.

### 7.7 Accessibility checks in development
- **Benefit:** `eslint-plugin-jsx-a11y` (dev only) catches missing labels and alt text as you write; an axe run on the landing in CI guards the 90+ target.
- **Cost:** one or two dev dependencies, some lint noise on existing files.
- **Optional:** yes.

---

## 8. Build order

Each step is one prompt and one or more commits, verified in the browser before the next.

1. **Route split** (3.2): `/app`, `/login`, `/signup`, `/forgot-password`; gate `checkAuth()` to `/app`; signed-in hint (3.3). No visual change.
2. **Accessibility fixes** (1.6): Escape, focus trap and return, `inert`, `aria-current`. Native `<dialog>` if you take 7.2.
3. **Tokens and font** (2.3, 2.8, 7.1): CSS variables, Tailwind mapping, self-hosted Schibsted Grotesk, `color-scheme`, theme-color, new mark and favicon. Optional: Tailwind v4 as its own step just before this.
4. **App restyle, screen by screen** (2.6): auth screens, sidebar, calendar, drawer, booking sheet, then the remaining screens.
5. **Seed the demo month and capture screenshots** (section 5).
6. **Landing page** (section 4), last, so its screenshots show the finished dark app.

Each built screen is checked against the anti-"AI look" checklist in `RESEARCH.md` section 6.

---

## 9. Follow-ups

- **ROADMAP.md "unit grid":** the scope log describes a BookMyShow-style inventory picker; the code uses quantity inputs (decision 12). Correct that line in a separate `docs:` commit (outside `docs/design/`, so I did not edit it).
- **`ui-ux-pro-max` permanent install:** it isn't in your claude.ai skills catalog. To have it in your own Claude Code sessions, run these two commands in Claude Code on your computer (from the skill's README):
  ```
  /plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
  /plugin install ui-ux-pro-max@ui-ux-pro-max-skill
  ```
  It is MIT-licensed. I reviewed its scripts: they use no network, shell or eval calls, and write files only when asked to `--persist`.

---

## Appendix A: Ledger (not chosen)

Kept because its palette is a ready, contrast-checked **light theme** if one is added later (2.7).

**Mood:** the paper booking register, made calm and exact. Daylight, ink on paper. **Bold thing:** a huge condensed date numeral. **Type:** Anek Latin (Ek Type), variable width and weight, has ₹ and `tnum`, Devanagari sibling; 60.7 KB instanced to width 85 to 100 and weight 400 to 700.

| Token | Hex | Ratio |
|---|---|---|
| `paper` / `canvas` | `#FFFFFF` / `#F5F7F9` | |
| `ink-900` text | `#18212F` | 16.19 on paper, 15.07 on canvas |
| `ink-600` secondary | `#4A5566` | 7.55 / 7.03 |
| `ink-500` muted | `#5F6B7C` | 5.41 / 5.04 |
| `rule-strong` input borders | `#8A94A3` | 3.07 vs paper |
| `accent` | `#0F766E` (teal-700), white text 5.47; hover `#115E59` 7.58 | |
| Confirmed badge | `#115E59` on `#F0FDFA` | 7.27 |
| Clash banner | `#B91C1C` on `#FEF2F2`, edge `#EF4444` | 5.91 / 3.44 |
| Shortfall banner | `#92400E` on `#FFFBEB`, edge `#D97706` | 6.84 / 3.07 |
| Pending badge | `#92400E` on `#FEF3C7` | 6.37 |
| Completed | `#4338CA` on `#EEF2FF`; pill white on `#4F46E5` | 7.07 / 6.29 |
| WhatsApp | white on `#15803D` | 5.02 |

Shapes: radius 8 / 12 / 16px; cards bordered, no shadow; overlays `0 16px 40px -12px rgb(24 33 47 / 0.22)`. If used as the light theme, keep After Hours' typeface and motion and swap only these color values.

## Appendix B: Shamiana (not chosen)

**Mood:** festive, from the trade: striped canopy fabric, wedding season. **Bold thing:** a scalloped rani-pink canopy band, once. **Type:** Baloo 2 headings and Mukta body (Ek Type), both with ₹, `tnum` and Devanagari; 69.6 KB for three files. **Accent:** rani `#B3135E`, white text 6.62. **Rejected because** rani and clash red have almost the same lightness (1.02:1), so they would differ by hue alone, and its informal personality wears thin in a tool used all day.
