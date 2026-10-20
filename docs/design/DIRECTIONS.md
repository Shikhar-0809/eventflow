# EventFlow design directions

Three directions for the landing page and the logged-in app, the landing section plan, the routing proposal, optional tooling, a recommendation and open questions. Research and sources are in `RESEARCH.md`. Nothing here has been built.

Contents:
1. Shared foundations (all directions)
2. Direction A: Ledger (recommended)
3. Direction B: After Hours
4. Direction C: Shamiana
5. Routing: how `/` coexists with the app
6. Landing page plan, section by section
7. Screenshots and demo loops from seeded data only
8. Engineering constraints: responsive, performance, accessibility, scope
9. Optional tooling, with benefit and cost
10. Recommendation
11. Open questions

All contrast ratios below were computed with the WCAG 2.x relative-luminance formula (script in the session scratchpad, not committed). "AA" means 4.5:1 for text; non-text (borders, focus rings, icons) needs 3:1.

---

## 1. Shared foundations

These hold whichever direction you pick, so the landing page and the app read as one product.

### 1.1 Semantic color meaning (kept from today, tightened)

| Meaning | Today | Proposal | Why |
|---|---|---|---|
| Confirmed booking | teal | teal (unchanged) | Existing meaning. |
| Date clash | red | red (unchanged) | Existing meaning. |
| Inventory shortfall | amber | amber (unchanged) | Existing meaning. |
| Pending advance | amber | amber, but **always a filled status badge**, never a banner | Same color as shortfall today. Different shape keeps "status" and "warning" apart. |
| Completed | indigo `#6366f1` | indigo-600 `#4F46E5` | Current hex fails AA with white text (4.47:1); indigo-600 is 6.29:1. |
| Cancelled | red `#dc2626` | **neutral grey with strikethrough** | Today red means clash, error and cancelled. Freeing red for clash and errors makes a red thing on the calendar always mean "look at this". Needs your OK (open question 3). |
| WhatsApp action | green-600 + white (3.30:1, fails) | green-700 `#15803D` + white (5.02:1) | Fixes a current AA failure. |

Rule for every direction: **color never carries meaning alone.** Clash banners carry an alert icon and the word "clash"; shortfall banners carry a package icon and the counts; statuses carry their label text.

### 1.2 Breakpoints

Tailwind's defaults already line up with the requested widths: base (375), `md` 768, `xl` 1280, `2xl` 1536. Design and test at exactly those four widths. `sm` 640 and `lg` 1024 stay available for in-between fixes.

### 1.3 Type sizing rule

- **Landing:** fluid sizes with `clamp()`, interpolating from 375px to 1440px viewports (scales per direction below).
- **App:** fixed sizes. A dense working screen should not change size as the window changes; fluid type there just causes reflow. The app uses the `sm`, `base`, `lg`, `xl`, `2xl` steps at their 375px values, with `base` at 15 or 16px depending on direction.

### 1.4 Spacing

Keep Tailwind's 4px scale (it already matches Blade's 2/4/8/12/16/20/24/32/40/48 rhythm closely). Add three layout tokens:

| Token | Value | Use |
|---|---|---|
| `section` | `clamp(4rem, 2.592rem + 6.009vw, 8rem)` (64 to 128px) | Vertical gap between landing sections |
| `block` | `clamp(2rem, 1.648rem + 1.502vw, 3rem)` (32 to 48px) | Gap between a section heading and its content |
| `gutter` | `clamp(1rem, 0.648rem + 1.502vw, 2rem)` (16 to 32px) | Page side padding |

Content max width 72rem (1152px); prose max 65ch.

### 1.5 Motion base (every direction inherits, each adds its flavor)

**Durations**

| Token | ms | Use |
|---|---|---|
| `press` | 100 | Button and card press feedback |
| `hover` | 150 | Hover color or shadow change |
| `state` | 180 | Toggles, tab indicator, banner appearing |
| `enter` | 240 | Dialog and popover in |
| `exit` | 160 | Dialog and popover out (exit faster than enter) |
| `sheet-in` | 280 | Drawer (`BookingDetail`) and booking sheet in |
| `sheet-out` | 200 | Drawer and sheet out |
| `hero` | 600 total | The one orchestrated landing moment, played once |

**Easings**

| Token | Curve | Source |
|---|---|---|
| `out` | `cubic-bezier(0.2, 0, 0, 1)` | Interaction-design skill "standard" |
| `enter` | `cubic-bezier(0, 0, 0.2, 1)` | Same as Razorpay Blade `entrance` |
| `exit` | `cubic-bezier(0.4, 0, 1, 1)` | Interaction-design skill "exit" |
| `move` | `cubic-bezier(0.3, 0, 0.2, 1)` | Same as Razorpay Blade `standard` |

**Rules**
- Only `transform` and `opacity` animate anything that moves or resizes. Color, border-color and box-shadow may cross-fade over `hover` (150ms) because they repaint without layout; that is my reading of "transform/opacity only" (open question 9). Never animate width, height, top, left, margin or padding.
- Replace the current standard `transition-all duration-200` with an explicit utility (`transition-[transform,opacity,background-color,border-color,box-shadow,color]`) so layout properties never animate by accident. `CODING_STANDARDS.md` would need a one-line update.
- Use CSS transitions, not keyframes, for anything the merchant can interrupt (opening and closing a drawer quickly reverses smoothly).
- No motion on keyboard-initiated or very frequent actions (switching sidebar screens, typing, opening the same drawer for the twentieth time beyond its basic slide).
- **Focus:** `focus-visible` only (not on mouse click), drawn as `outline: 2px solid <focus>; outline-offset: 2px`. Outline rather than box-shadow so it survives Windows high-contrast mode. Focus color is at least 3:1 against every surface it can sit on (ratios per direction).
- **Reduced motion:** under `prefers-reduced-motion: reduce`, drop every transform (no slide, no scale), keep opacity fades at 120ms or less, show the hero demo in its final state with a "Play" button instead of autoplay. In Tailwind: `motion-safe:` for transforms, plus a global rule in `index.css` that shortens transitions.

### 1.6 Components every direction must fix (independent of look)

From the audit in `RESEARCH.md` section 2:
- `ConfirmDialog`, `AddInventoryItemModal`, `BookingDetail`: add Escape-to-close.
- All dialogs and drawers (those three, `BookingPage` sheet, the Profile modals): trap focus while open, return focus to the trigger on close, mark the rest of the page `inert`.
- Sidebar: `aria-current="page"` on the active item, plus a non-color active marker.
- Replace `text-slate-400` labels (2.56:1, 41 uses) with the direction's muted text token (all at least 5:1).
- Replace the ⛺ emoji favicon and the stock `CalendarDays` mark with a drawn mark (each direction proposes one).

---

## 2. Direction A: Ledger (recommended)

**Mood:** the paper booking register, made calm, exact and digital. Daylight, ink on paper, every number lined up.

**The one bold thing:** the **date numeral**. In the hero, a single calendar day ("14") set very large in a condensed width, with two wedding bookings stacked under it and the clash banner appearing while the confirm button stays live. The same condensed numerals carry dates through the app (calendar day numbers, the event countdown, the drawer header). Everything else is quiet.

**Draws from:** Apple (one idea per section, numbers shown big with their basis beside them), Things and Granola (calm confidence, lived-in sample data), Cal.com (product widget as hero; restrained buttons with a pressed-in state), Vercel's rules (color only for meaning, always with a non-color cue), Stripe (UI fragments built as live markup).

### 2.1 Typography

**Family:** Anek Latin by Ek Type (Mumbai), Google Fonts, OFL. One variable family used actively through its width axis: condensed for dates and display, normal for reading.
- Verified in the font file: has the ₹ glyph (U+20B9), has tabular figures (`tnum`), axes `wght` 100 to 800 and `wdth` 75 to 125.
- It has a Devanagari sibling (Anek Devanagari, same designer team, same axes, also has ₹ and `tnum`), so a Hindi interface later keeps the same voice.
- Self-hosted (CSP requires it). Instanced to `wdth` 85 to 100 and `wght` 400 to 700, Latin subset plus ₹: **60.7 KB** as one WOFF2 (measured). Full axes would be 93.7 KB.

| Role | Width | Weight | Notes |
|---|---|---|---|
| Display, date numerals | 85 | 650 | `font-variant-numeric: tabular-nums` on numerals |
| Headings | 92 | 600 | |
| Body, UI | 100 | 400 / 500 | Body line-height 1.55 |
| Labels, buttons | 100 | 550 | Sentence case, never all caps |
| Amounts | 100 | 500 | Always `tabular-nums` |

**Landing scale** (base 16 to 17px, ratio 1.2 at 375px to 1.25 at 1440px):

| Step | 375px | 1440px | CSS |
|---|---|---|---|
| sm | 13 | 14 | `clamp(0.8125rem, 0.7905rem + 0.0939vw, 0.875rem)` |
| base | 16 | 17 | `clamp(1rem, 0.978rem + 0.0939vw, 1.0625rem)` |
| lg | 19 | 21 | `clamp(1.1875rem, 1.143rem + 0.1878vw, 1.3125rem)` |
| xl | 23 | 27 | `clamp(1.4375rem, 1.349rem + 0.3756vw, 1.6875rem)` |
| 2xl | 28 | 33 | `clamp(1.75rem, 1.64rem + 0.4695vw, 2.0625rem)` |
| 3xl | 33 | 42 | `clamp(2.0625rem, 1.864rem + 0.8451vw, 2.625rem)` |
| 4xl | 40 | 52 | `clamp(2.5rem, 2.236rem + 1.127vw, 3.25rem)` |
| display | 48 | 65 | `clamp(3rem, 2.626rem + 1.596vw, 4.0625rem)` |
| date numeral | 96 | 160 | `clamp(6rem, 4.592rem + 6.009vw, 10rem)` (hero only) |

All steps interpolate between 375px and 1440px viewports and stop growing above 1440.

**App:** base 15px, sm 13px, lg 17px, xl 20px, 2xl 24px. Section titles get a real step up from body (today almost everything is 14px).

### 2.2 Color tokens

Cool, slightly blue-black ink on white and a cool off-white canvas. Not cream. Accent is the existing teal, one step darker so white text passes AA.

| Token | Hex | Pair | Ratio |
|---|---|---|---|
| `paper` (cards, drawers) | `#FFFFFF` | | |
| `canvas` (page) | `#F5F7F9` | | |
| `ink-900` text | `#18212F` | on paper / canvas | 16.19 / 15.07 |
| `ink-600` secondary | `#4A5566` | on paper / canvas | 7.55 / 7.03 |
| `ink-500` muted, labels | `#5F6B7C` | on paper / canvas | 5.41 / 5.04 |
| `ink-100` cancelled bg | `#EEF1F4` | `ink-600` on it | 6.66 |
| `rule` hairlines | `#E3E7EC` | decorative only | |
| `rule-strong` input borders | `#8A94A3` | on paper (non-text) | 3.07 |
| `accent` buttons, links | `#0F766E` (teal-700) | white on it / it on paper | 5.47 / 5.47 |
| `accent-hover` | `#115E59` (teal-800) | white on it | 7.58 |
| `accent-soft` selected rows | `#F0FDFA` | `accent` on it | 5.25 |
| `focus` ring | `#0F766E` | on paper / canvas | 5.47 / 5.10 |
| Confirmed badge | `#115E59` on `#F0FDFA` | | 7.27 |
| Calendar confirmed pill | white on `#0F766E` | | 5.47 |
| Clash banner | `#B91C1C` on `#FEF2F2`, edge `#EF4444` | text / edge | 5.91 / 3.44 |
| Shortfall banner | `#92400E` on `#FFFBEB`, edge `#D97706` | text / edge | 6.84 / 3.07 |
| Pending badge | `#92400E` on `#FEF3C7` | | 6.37 |
| Calendar pending pill | `#422006` on `#FCD34D` | | 10.11 |
| Completed badge / pill | `#4338CA` on `#EEF2FF` / white on `#4F46E5` | | 7.07 / 6.29 |
| Cancelled pill | `ink-600` on `ink-100`, struck through | | 6.66 |
| WhatsApp button | white on `#15803D` | | 5.02 |

Note: the amber-500 border I first tried on the shortfall banner was 2.07:1 and failed; amber-600 (`#D97706`) passes at 3.07:1.

### 2.3 Shape, border, shadow

| Token | Value | Use |
|---|---|---|
| `radius-control` | 8px | Inputs, buttons, chips |
| `radius-card` | 12px | Cards, banners, calendar wrapper |
| `radius-sheet` | 16px | Dialogs, drawer leading corners |
| `radius-pill` | 9999px | Status badges only |
| Border | 1px `rule` for structure, 1px `rule-strong` for inputs | |
| `shadow-raised` | `0 1px 2px rgb(24 33 47 / 0.06), 0 1px 1px rgb(24 33 47 / 0.04)` | Sticky headers, menus |
| `shadow-overlay` | `0 16px 40px -12px rgb(24 33 47 / 0.22), 0 2px 6px rgb(24 33 47 / 0.06)` | Drawers, dialogs |
| `shadow-press` | `inset 0 2px 1px rgb(0 0 0 / 0.10)` | Primary button while pressed (Cal.com-style) |

Cards rest with a border and no shadow. Only floating things get a shadow.

**Motif:** faint ruled lines (`rule`, 1px, 32px apart) behind the Problem section's "register page" illustration and in empty states, never behind content that needs reading. No red margin line (red is reserved).

**Mark:** a drawn tent roofline whose ridge is a calendar tab, in `accent`, used as favicon (SVG) and logo. Replaces ⛺ and `CalendarDays`.

### 2.4 Motion

- **Landing CTA:** hover `scale(1.02)` + `accent-hover` background over 150ms `out`; press `scale(0.97)` over 100ms; focus outline as in 1.5.
- **App buttons:** hover changes background only (no scale; the app is used all day and the verified product systems in the research do not scale on hover); press `scale(0.98)` + `shadow-press` over 100ms.
- **Links:** underline always present in body copy (not color alone); hover thickens decoration from 1px to 2px.
- **Clickable cards** (inventory items, pending-balance rows): hover border to `rule-strong`, no lift. Non-clickable cards: no hover at all.
- **Drawer:** `translateX(100%)` to 0 over 280ms `enter`, out over 200ms `exit`; backdrop opacity 0 to 1 over 200ms.
- **Dialog:** opacity 0 to 1 and `scale(0.97)` to 1 over 240ms `enter`; out over 160ms.
- **Banners:** clash and shortfall banners appear with opacity plus `translateY(-4px)` to 0 over 180ms. They do not shake or pulse.
- **Continuity (from Family):** after "Confirm booking", the button label cross-fades to "Booked" and the drawer for the new booking opens from the calendar cell's side. The first booking a merchant ever saves gets a one-time 600ms highlight on its calendar cell; never again.
- **Hero sequence:** see 6.2. One sequence, played once, replayable.

### 2.5 How it applies across the product

| Surface | Ledger treatment |
|---|---|
| Landing | White paper sections on `canvas`, left-aligned text, the date numeral as the only large display element, real screenshots in a 1px `rule` frame with `radius-card` (no fake browser or phone chrome). |
| Login / signup (`AuthCard`) | Same card, new mark, Anek type, `accent` button. Visually the "first page" of the app. |
| Sidebar | Proposal: switch from `slate-900` to `paper` with a right `rule`, like a register's margin. Active item: 3px `accent` bar plus `accent-soft` fill plus `aria-current`. (Alternative if you want to keep the dark sidebar: `ink-900` background, which still passes with white text at 16:1.) |
| Calendar (FullCalendar) | Day numbers in condensed Anek with tabular figures; today marked with a 2px `accent` outline, not a fill; event pills with `radius-control` (not fully round) so long names truncate cleanly; status colors from 2.2; toolbar buttons become secondary buttons (paper, `rule-strong` border) so teal is not spent on navigation. Overrides move from hex in `index.css` to token values. |
| Booking drawer (`BookingDetail`) | Header shows the event date in the numeral style plus the countdown; sections separated by `rule`, not boxed cards; WhatsApp buttons green-700. |
| Booking sheet (`BookingPage`) | Inputs 8px radius with `rule-strong` borders; clash banner sits directly under the date field; shortfall banner directly under the item rows; submit always enabled for clashes, confirm-anyway dialog for shortfalls (unchanged rules). |
| Dialogs | `radius-sheet`, `shadow-overlay`, native `<dialog>` (see 9.2). |
| Cards (Inventory, Analytics, Usage) | Border, no shadow; the number is the largest thing in the card, label below it in `ink-500`. |
| Banners | Clash: `radius-card`, 4px left edge in `#EF4444`, alert icon, title "Date clash", one line naming the other booking. Shortfall: full 1px `#D97706` border, package icon, a small table "Item, need, available". Different shape, icon and color. |
| Empty and loading states | Ruled-line motif behind a one-line instruction and a single action ("Add your first item"). Skeletons in `ink-100`. |

### 2.6 Tailwind v3 mapping (`tailwind.config.js` `theme.extend`, not applied)

```js
// Sketch only. Values from 2.1 to 2.4.
fontFamily: { sans: ['"Anek Latin"', 'system-ui', 'sans-serif'] },
colors: {
  paper: '#FFFFFF', canvas: '#F5F7F9',
  ink: { 100: '#EEF1F4', 500: '#5F6B7C', 600: '#4A5566', 900: '#18212F' },
  rule: { DEFAULT: '#E3E7EC', strong: '#8A94A3' },
  accent: { DEFAULT: '#0F766E', hover: '#115E59', soft: '#F0FDFA' },
  whatsapp: '#15803D',
},
borderRadius: { control: '8px', card: '12px', sheet: '16px' },
boxShadow: {
  raised: '0 1px 2px rgb(24 33 47 / 0.06), 0 1px 1px rgb(24 33 47 / 0.04)',
  overlay: '0 16px 40px -12px rgb(24 33 47 / 0.22), 0 2px 6px rgb(24 33 47 / 0.06)',
  press: 'inset 0 2px 1px rgb(0 0 0 / 0.10)',
},
fontSize: { /* landing clamp() steps from 2.1, app fixed steps */ },
spacing: { section: 'clamp(4rem, 2.592rem + 6.009vw, 8rem)', block: 'clamp(2rem, 1.648rem + 1.502vw, 3rem)', gutter: 'clamp(1rem, 0.648rem + 1.502vw, 2rem)' },
transitionDuration: { press: '100ms', hover: '150ms', state: '180ms', enter: '240ms', exit: '160ms', 'sheet-in': '280ms', 'sheet-out': '200ms' },
transitionTimingFunction: {
  out: 'cubic-bezier(0.2, 0, 0, 1)', enter: 'cubic-bezier(0, 0, 0.2, 1)',
  exit: 'cubic-bezier(0.4, 0, 1, 1)', move: 'cubic-bezier(0.3, 0, 0.2, 1)',
},
```

Font variation settings (`font-stretch` for width) need a small plugin or a few arbitrary values (`[font-stretch:85%]`); a two-line plugin in the config is cleaner.

**If Tailwind v4 is adopted:** the same values go in `@theme { --color-ink-900: #18212F; --radius-card: 12px; --ease-enter: cubic-bezier(0, 0, 0.2, 1); ... }` inside `index.css`, and every token becomes a CSS variable automatically. That makes the FullCalendar overrides use `var(--color-accent)` instead of hard-coded hex. Watch the renamed defaults: `shadow-sm` becomes `shadow-xs`, `rounded` becomes `rounded-sm`, `ring` becomes 1px currentColor, border color defaults to currentColor. Custom names like `shadow-raised` and `rounded-card` avoid most of that churn.

---

## 3. Direction B: After Hours

**Mood:** the evening of an event. Dark, precise and quietly lit, like a shamiana at night with string lights. The "premium tool" look people screenshot from Linear and Raycast, warmed up.

**The one bold thing:** a **month strip of dates drawn as small lights** in the hero. Booked dates glow teal, the clash date glows red with a ring, free dates are dim. Hovering or focusing a light shows its booking. Nothing else on the page glows.

**Draws from:** Linear (dark, neutral chrome, real product doing the explaining, themes from a few inputs), Raycast (hero object built from the product's own vocabulary), Vercel (no shadows, elevation by surface steps and borders, monochrome plus meaning), Resend (states shown as content).

### 3.1 Typography

**Family:** Schibsted Grotesk (Bakken & Baeck for Schibsted), Google Fonts, OFL. A newspaper grotesk: firm, compact, not the default Inter look.
- Verified in the font file: has ₹ and `tnum`; weights 400 to 900 (variable). Latin subset plus ₹: **39.4 KB** WOFF2 (measured).
- Rejected on inspection: Instrument Sans (no ₹ glyph), Onest (no ₹), Hanken Grotesk (no ₹, no tabular figures). Geist and Mona Sans have both but read as Vercel and GitHub.

| Role | Weight | Notes |
|---|---|---|
| Display | 700, tracking -0.02em | |
| Headings | 600 | |
| Body, UI | 400 / 500 | Body line-height 1.6 on dark (a touch looser) |
| Amounts, dates | 500, `tabular-nums` | |

**Landing scale** (base 16px, ratio 1.2 to 1.333, a more dramatic top end):

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

**App:** base 15px, same fixed steps as Ledger.

### 3.2 Color tokens

Dark landing and dark app chrome (sidebar, drawer headers, login). The app's working canvas stays light by default (open question 5), so merchants are not forced into dark mode in daylight.

| Token | Hex | Pair | Ratio |
|---|---|---|---|
| `night` page | `#0E1524` | | |
| `night-raised` cards | `#172033` | | |
| `text-1` | `#E7EBF2` | on night | 15.25 |
| `text-2` | `#A9B3C6` | on night | 8.64 |
| `text-3` muted | `#8792A8` | on night / raised | 5.83 / 5.20 |
| `line` hairlines | `#243049` | decorative | |
| `line-strong` input borders | `#67728B` | on night (non-text) | 3.78 |
| `accent` | `#5EEAD4` (teal-300) | ink `#042F2C` on it / it on night | 9.80 / 12.33 |
| `focus` | `#5EEAD4` | on night / raised | 12.33 / 11.00 |
| Confirmed | `#5EEAD4` on `#0F2A2D` | | 10.22 |
| Clash | `#FCA5A5` on `#2B1519` | | 9.04 |
| Shortfall | `#FCD34D` on `#2A2312` | | 10.81 |
| Completed | `#A5B4FC` on `#1C1E3A` | | 8.13 |
| Light app canvas | ink `#141B2B` on `#F6F7FA` | | 16.05 |

The first `line-strong` I tried (`#4A5670`) was 2.48:1 and failed; `#67728B` passes. Light-surface statuses inside the app use the Ledger values from 2.2.

**Lights motif:** the date lights use `accent` at 100% (booked), `#FCA5A5` (clash) and `text-3` at 40% (free). A warm white glow is tempting but sits too close to the amber warning; not used.

### 3.3 Shape, border, shadow

| Token | Value |
|---|---|
| `radius-control` | 6px |
| `radius-card` | 8px |
| `radius-sheet` | 12px |
| Border | 1px `line`; inputs 1px `line-strong` |
| Shadows | **None.** Elevation is `night` to `night-raised` plus a border. Overlays get a 1px `line-strong` border and a 60% `night` backdrop. |

**Mark:** a tent outline drawn as a single line with one small light at the ridge.

### 3.4 Motion

- **No scale anywhere**, on landing or app. Hover lifts the background one surface step (`night` to `night-raised`) over 150ms; press dims to 85% opacity over 100ms. This follows Cal.com and Vercel's restraint, and is the precise, unbouncy feel this mood needs.
- **Date lights:** each light fades from 0 to its level over 180ms, staggered 20ms left to right, once on load (the whole strip finishes in about 0.8s). Focus and hover scale the light to 1.25 (a transform on a 8px dot, not on text). Reduced motion: lights appear at full level instantly.
- Drawers, dialogs, banners: same timings as 1.5.

### 3.5 How it applies across the product

| Surface | After Hours treatment |
|---|---|
| Landing | Dark throughout, one light-themed band for the product tour so screenshots of the (light) app sit naturally. |
| Login / signup | Dark card on `night`. |
| Sidebar | Already dark (`slate-900`); retoken to `night` with `accent` active bar. Smallest change of the three directions here. |
| Calendar | Light canvas; event pills as in Ledger; today ring in `#0F766E`. |
| Drawer, dialogs | Dark header strip (`night`, `text-1`) over a light body: continuity with the landing without making forms dark. |
| Banners | Same shapes as Ledger, light-surface colors. |

**Risk:** the landing and the app look like two different products unless the dark chrome carries over strongly. A full dark mode for the app would fix that but is real work (every component, FullCalendar, recharts, the printed report stays light).

### 3.6 Tailwind mapping

Same structure as 2.6 with these values; v4 notes identical.

---

## 4. Direction C: Shamiana

**Mood:** festive and confident, from the trade itself: striped canopy fabric, wedding season, rani pink. Warm without being kitsch.

**The one bold thing:** a **canopy band**, the scalloped edge of a striped shamiana, in rani pink and white, used once across the top of the hero and as the logo mark. Nowhere else.

**Draws from:** Arc and Family (personality, human headlines, fluid label morphing, delight only on rare moments), OkCredit (vernacular warmth, naming the paper habit), Apple (big type, short sections).

### 4.1 Typography

**Families:** Baloo 2 for headings and Mukta for text, both by Ek Type (Mumbai), Google Fonts, OFL.
- Verified in the font files: both have ₹ and `tnum`. Baloo 2 variable 400 to 800; Mukta static weights.
- Measured Latin subset plus ₹: Baloo 2 30.2 KB; Mukta Regular 19.3 KB, SemiBold 20.1 KB (69.6 KB for three files).
- Both have Devanagari in the same family (Mukta and Baloo 2 are Devanagari plus Latin), ready for Hindi.

| Role | Family | Weight |
|---|---|---|
| Display, headings | Baloo 2 | 700 / 800 |
| Body, UI | Mukta | 400 / 600 |
| Amounts | Mukta | 600, `tabular-nums` |

**Landing scale** (base 16 to 18px, ratio 1.2 to 1.25):

| Step | 375px | 1440px | CSS |
|---|---|---|---|
| sm | 13 | 14 | `clamp(0.8125rem, 0.7905rem + 0.0939vw, 0.875rem)` |
| base | 16 | 18 | `clamp(1rem, 0.956rem + 0.1878vw, 1.125rem)` |
| lg | 19 | 22 | `clamp(1.1875rem, 1.121rem + 0.2817vw, 1.375rem)` |
| xl | 23 | 28 | `clamp(1.4375rem, 1.327rem + 0.4695vw, 1.75rem)` |
| 2xl | 28 | 35 | `clamp(1.75rem, 1.596rem + 0.6573vw, 2.1875rem)` |
| 3xl | 33 | 44 | `clamp(2.0625rem, 1.82rem + 1.033vw, 2.75rem)` |
| 4xl | 40 | 55 | `clamp(2.5rem, 2.17rem + 1.408vw, 3.4375rem)` |
| display | 48 | 69 | `clamp(3rem, 2.538rem + 1.972vw, 4.3125rem)` |

**App:** base 16px (Mukta runs small), other steps as Ledger.

### 4.2 Color tokens

| Token | Hex | Pair | Ratio |
|---|---|---|---|
| `paper` | `#FFFFFF` | | |
| `canvas` | `#F6F5F8` | | |
| `ink` text | `#1D1A24` | on paper | 17.14 |
| `ink-600` | `#4D4858` | on paper | 8.81 |
| `ink-500` muted | `#635E6E` | on canvas | 5.76 |
| `rani` accent (buttons, links) | `#B3135E` | white on it / it on paper | 6.62 / 6.62 |
| `rani-hover` | `#930F4E` | white on it | 8.68 |
| `rani-soft` selected | `#FDF0F6` | `rani` on it | 5.98 |
| `focus` | `#D0176D` | on paper | 5.22 |
| Status and alert colors | as Ledger 2.2 | | |

**Known risk, measured:** rani `#B3135E` and clash red `#B91C1C` have almost identical luminance (1.02:1 against each other). They differ only in hue, which is the first thing color-blind merchants lose. So: pink is never used on the calendar, inside banners, on badges or near the date field; clash always carries its icon and the word "clash". This rule is strict and easy to break later, which is a main reason this direction is not recommended.

### 4.3 Shape, border, shadow

| Token | Value |
|---|---|
| `radius-control` | 12px; primary buttons fully rounded (pill) |
| `radius-card` | 16px |
| `radius-sheet` | 20px |
| `shadow-cta` | `0 6px 20px -8px rgb(179 19 94 / 0.35)` on the primary landing CTA only |
| Cards | 1px border, no shadow |

**Mark:** a tent made of two stripes under a scalloped edge.

### 4.4 Motion

- **Landing CTA:** hover `scale(1.03)` over 150ms `out`; press `scale(0.96)` over 100ms.
- **App buttons:** press `scale(0.97)`; hover color only.
- **Label morph (from Family):** "Confirm booking" to "Booked", "Add item" to "Added", by cross-fading the changing word inside a fixed-width label.
- **Directional tabs (from Family):** in the product tour and in Analytics tabs, content slides 12px toward the side of the tab you picked, over 240ms.
- **Canopy band:** draws in once, left to right, as a `clip-path` reveal over 600ms. Reduced motion: shown complete.

### 4.5 How it applies across the product

| Surface | Shamiana treatment |
|---|---|
| Landing | White and `canvas` sections, the canopy band once, Baloo 2 headlines, pill CTAs. |
| Sidebar | `paper` with `rani` active bar. |
| Calendar | Same as Ledger. No pink inside the calendar (rule from 4.2). |
| Drawer, dialogs | 20px corners, Mukta body, pill primary button. |
| Banners | Same shapes and colors as Ledger. |

**Risk:** personality that suits a landing page can wear thin in a tool opened twenty times a day; Baloo 2 is informal for amounts and records.

---

## 5. Routing: how `/` coexists with the app

### 5.1 Today

`App.jsx` matches `window.location.pathname` by hand: `/` renders the app behind the auth gate, `/privacy` the policy, everything else the 404 page. `vercel.json` sends every non-`/api` path to `index.html`. `checkAuth()` runs on mount for every route.

### 5.2 Proposal

| Path | Shows | Calls the API? |
|---|---|---|
| `/` | Landing page | **No** |
| `/login` | Login screen (today's `LoginScreen`) | Only on submit |
| `/signup` | Sign-up flow (today's `SignupScreen`) | Only on submit |
| `/forgot-password` | Reset flow | Only on submit |
| `/app` | The logged-in app (today's `/`) | Yes, `checkAuth()` |
| `/privacy` | Privacy policy (unchanged) | **No** (today it does; fix by gating `checkAuth()` to `/app`) |
| anything else | 404 | No |

- Keep the small hand-written path switch; adding a router library is not needed for six paths. It moves **above** `App`: `main.jsx` picks a route and lazy-loads either the landing bundle or the app bundle, so the landing never downloads FullCalendar, recharts, jsPDF or Zustand stores it does not use.
- `/app` without a session redirects to `/login?next=/app`; after login, go to `next` (only same-origin paths accepted).
- The landing's "Create free account" links to `/signup`, "Log in" to `/login`. Inside the auth screens, the existing in-page switching becomes real links, so the browser back button works.
- `vercel.json` needs no change for this (the SPA fallback already serves `index.html` everywhere). It changes only if the landing is pre-rendered (9.4).

### 5.3 What a logged-in merchant sees at `/`

The session cookie is `httpOnly`, so the landing cannot read it, and asking the API would wake the Render server for every visitor. So:

- On successful login or `/api/auth/me`, the app stores a **UI hint** in `localStorage` (`ef:signedIn = "1"`). It is not a token and holds no personal data. It is cleared on logout, on any 401, and on account deletion.
- At `/`, if the hint is present, the nav shows **"Open dashboard"** (to `/app`) instead of "Log in" and "Get started", and the hero CTA becomes "Open dashboard". No redirect, so the landing stays reachable and a stale hint can never loop.
- If the hint is stale, `/app` simply runs `checkAuth()`, gets a 401, clears the hint and shows `/login`. One extra step, no harm.
- Existing bookmarks to `/` (Bharat's, if he resumes) land on the landing with "Open dashboard" one click away. Alternative: auto-redirect `/` to `/app` when the hint is present (open question 6).
- The `localStorage` read is wrapped in try/catch (private browsing can throw).

---

## 6. Landing page plan

Copy rules: plain merchant English, short sentences (8 to 14 words), verbs on buttons, one name per action, no em dashes, amounts in Indian format, no invented numbers, logos or quotes. Section titles use sentence case. Draft copy is direction-neutral; visual notes are given for Ledger, with differences for B and C where they matter.

### 6.1 Nav

- **Purpose:** get to signup or login fast; jump to the three explainers.
- **Layout:**
```
[mark] EventFlow      Features  How it works  FAQ        Log in   [Get started]
375px: [mark] EventFlow                                   Log in   [Menu]
```
  Sticky after the hero scrolls away, with `shadow-raised` only once stuck. On mobile, the three anchors move into a disclosure menu (a `<button aria-expanded>` that opens a list, not a drawer).
- **Copy:** "Features", "How it works", "FAQ", "Log in", "Get started". Logged-in hint: "Open dashboard".
- **Interactions:** anchor links scroll natively (`scroll-behavior: smooth` only under `motion-safe`), and move focus to the section heading. Active section is not tracked (no scroll spy; it adds JS for little value). Skip link "Skip to content" is the first focusable element.

### 6.2 Hero

- **Purpose:** in five seconds, a tent or catering owner knows this is for them and sees the core idea: you get warned, you still decide.
- **Layout (1280):**
```
| H1 (left, max 14ch per line)                 |  ┌ Example, sample data ───────────┐ |
| Subhead (max 2 lines)                        |  │ February 2026                    │ |
|                                              |  │  14   Verma family, wedding      │ |
| [Create free account]   See how it works     |  │       Khan family, wedding (new) │ |
| Free to sign up. Email and a one-time code.  |  │  ┌ Date clash: Verma family ... ┐│ |
|                                              |  │  [Confirm booking]               │ |
|                                              |  └──────────────────────────────────┘ |
| ─────────── real calendar screenshot, cropped, framed in 1px rule, below ────────── |
```
  At 768: two columns get narrower; the demo card sits right. At 375: H1, subhead, CTA, then the demo card full width, then the screenshot cropped to the week row.
- **Copy direction:**
  - H1: "Every booking, advance and chair, on one screen." (alternative: "Your booking register, minus the register.")
  - Subhead: "EventFlow keeps your event dates, advances and stock together. It warns you about clashes and short stock, and you decide."
  - Primary: "Create free account". Secondary text link: "See how it works".
  - Under the button: "Free to sign up. Email and a one-time code." (depends on open question 1)
- **Interactions:** the demo card is live markup with seeded fictional names. On first view (IntersectionObserver, once): at 0ms one booking sits under "14"; at 300ms the "Khan family" pill enters (opacity plus `translateY(8px)` to 0, 240ms `enter`); at 600ms the clash banner appears (180ms). The "Confirm booking" button is enabled throughout. Clicking it cross-fades the label to "Booked" and adds a line: "2 events on 14 Feb. Both saved." A small "Play again" button resets it. Reduced motion: shown in the final pre-click state. The card has `aria-label="Example of a date clash warning, with sample data"` and announces "Booked" through a polite live region. Hero screenshot is the LCP image: `fetchpriority="high"`, explicit width and height, not lazy.
- **B:** the demo becomes the strip of date lights; clicking the red light opens the same clash card. **C:** canopy band draws across the top edge once.

### 6.3 Problem

- **Purpose:** name the paper habit exactly, so the merchant feels understood (OkCredit's lesson).
- **Layout:** left: title and two lines. Right (stacks below at 375): three short items, each a small drawn object (register page with ruled lines, a stack of advance slips, a thought bubble with chairs) plus two lines of text. Not cards; items separated by `rule`.
- **Copy direction:**
  - Title: "Right now it lives in three places"
  - Register: "Dates and names in the booking register, in pen."
  - Slips: "Advances on separate slips, or in your head."
  - Stock: "How many chairs are free on the 14th? Only you know."
  - Closing line: "When two families want the same date, or 400 chairs are promised on a day you own 300, you find out late."
- **Interactions:** none. Static section.

### 6.4 Features

- **Purpose:** six features, each named by what the merchant gets.
- **Layout:** two large rows for the two headline features (clash alerts, per-date stock), each with a cropped real screenshot of that state; then a 2x2 grid (2x1 at 768, 1 column at 375) for the other four, text plus a small cropped UI fragment. Not six identical icon cards.
- **Copy direction:**
  - **Clash alerts that don't stop you.** "If a date already has an event, you see it before you save. You decide if you can do both."
  - **Stock checked for the event date.** "Add chairs, tables and tents to a booking. If that day's other bookings already use them, you see the shortfall and confirm only if you mean it."
  - **WhatsApp in one tap.** "The confirmation or payment reminder opens in WhatsApp, filled in and signed with your business name. You press send."
  - **Pending balances in one list.** "Every booking with money still to come, and how much."
  - **Reports and Excel.** "Pick a date range for a printable report or PDF. Download your records as an Excel file."
  - **Morning briefing.** "Open the app to a short note: events this week, balances due and your next event."
- **Interactions:** the two large screenshots show the state described (a red clash banner, an amber shortfall table). No hover effects on these blocks (not clickable).

### 6.5 How it works

- **Purpose:** show that setup is small. This is a real sequence, so numbering is honest.
- **Layout:** three columns at 1280 and 768, stacked at 375; each step a number, a title and one line; a thin `rule` connects them horizontally on wide screens.
- **Copy direction:**
  1. "Create your account. Your email, a one-time code, a password."
  2. "Add your stock. Item names and how many you own."
  3. "Log your bookings. Date, client, guests and what they need."
  - Under the steps: "[Create free account]"
- **Interactions:** none beyond the button.

### 6.6 Product tour

- **Purpose:** let a cautious merchant look around before signing up.
- **Layout:** a tab list (Calendar, New booking, Booking details, Pending balances, Reports) above one large framed screenshot. At 375 the tabs become a horizontally scrollable row (no hidden overflow trap; visible scroll affordance) and the screenshot is cropped to the relevant region.
- **Copy direction:** one sentence under each image, e.g. Booking details: "Client, event, money and stock for one booking, with the WhatsApp buttons."
- **Interactions:** WAI-ARIA tabs pattern (arrow keys move between tabs, Tab moves into the panel). Images cross-fade over 180ms (B: no slide; C: 12px directional slide). Only the "New booking" tab may carry a short loop (see 7.3), with a visible pause button, `preload="none"`, and a poster frame; all other tabs are still images, lazy-loaded.

### 6.7 Built for Indian event businesses

- **Purpose:** show the local details are right, without flag-waving.
- **Layout:** left: title. Right: four short facts, each paired with how it looks in the app.
- **Copy direction:**
  - "Amounts the way you write them: ₹1,20,000, not ₹120,000."
  - "Dates and 'today' in Indian time, wherever the server is."
  - "Weddings, birthdays, corporate events, or your own event type."
  - "Messages go out on WhatsApp, under your business name."
- **Interactions:** none. Must not mention Hindi, GST, UPI collection or anything not built.

### 6.8 Security and privacy

- **Purpose:** plain, specific, honest. Matches `/privacy` and DATA_PRIVACY.md.
- **Layout:** two columns of short statements, then a text link to the policy.
- **Copy direction:**
  - "Every account is confirmed with a one-time code sent to your email."
  - "Each business sees only its own bookings, stock and records."
  - "See which devices signed in recently, and sign out the others."
  - "Delete your account from Profile. Everything is removed straight away."
  - "The person who runs EventFlow can technically access the database, and looks at your data only when you ask for help."
  - Link: "Read the privacy policy" (`/privacy`).
- **Interactions:** none.

### 6.9 FAQ

- **Purpose:** answer the questions that stop a signup.
- **Layout:** single column, max 65ch, native `<details>`/`<summary>` (keyboard and screen reader support for free). Open state rotates a chevron 90 degrees over 150ms; content appears without height animation.
- **Questions and answer direction** (all must stay true):
  - "Is it free?" "Yes, creating an account and using EventFlow is free." (open question 1)
  - "Does EventFlow message my clients itself?" "No. It opens WhatsApp with the message ready. You send it from your own phone."
  - "What happens if two bookings fall on the same day?" "You see a clash alert. You can still save both."
  - "Can I use it on my phone?" "Yes, in your phone's browser. For long PDF reports, use a computer." (open question 7)
  - "Is it in Hindi?" "English for now." (open question 8)
  - "Can I get my data out?" "Download your records as Excel any time. For a full export, write to eventflow.support@gmail.com."
  - "Can I delete my account?" "Yes, from Profile. You confirm with your password and business name, and everything is deleted at once."
  - "Do I need to install anything?" "No. It runs in the browser."
- **Interactions:** as above.

### 6.10 Final CTA and footer

- **Purpose:** one last, calm push; then the essentials.
- **Layout:**
```
Put this season's bookings in one place.        [Create free account]
──────────────────────────────────────────────────────────────────────
EventFlow      Privacy policy   Contact   Log in               © 2026 EventFlow
```
- **Copy direction:** title as above; contact is the `mailto:` for eventflow.support@gmail.com; no social links (there are none to show).
- **Interactions:** button as hero.

---

## 7. Screenshots and demo loops from seeded data only

Per DATA_PRIVACY.md: never capture production, never show a real client.

1. **Source:** local dev against the Neon dev branch, seeded with `db/seedMerchants.js` (two demo merchants). Never point at production; the existing production-host guard already refuses it.
2. **Which merchant name:** use **Shree Ganesh Caterers** (fictional seed) or a new fictional demo business, not Bala Ji Tent House. Showing the real merchant's name on a page with "Create free account" reads as an endorsement, which the brief rules out (open question 4).
3. **Client data:** seeded fictional names only (Ramesh Sharma, Priya Patel and the like) and Meerut localities. The seed phone pattern (`98765432xx`) is shaped like a real mobile number and may belong to someone; mask phones in every capture (`98765 4XXXX`) or seed visibly impossible ones for screenshots.
4. **Freeze time:** seed relative dates, then capture with the browser clock fixed to one demo month (for example February 2026, wedding season), so the calendar, countdowns and "this week" lines agree across all images.
5. **Capture:** 1440x900 at 2x device pixel ratio for desktop shots, 390x844 at 3x for any phone crop; light theme; cursor hidden.
6. **Output:** AVIF with WebP fallback via `<picture>`, widths 640/960/1440/2160, explicit `width`/`height`, `loading="lazy"` and `decoding="async"` below the fold, hero eager with `fetchpriority="high"`. Images live in `client/public/landing/` (same origin, CSP-safe). Alt text describes what the image shows, e.g. "Calendar for February 2026 with two weddings on the 14th and a red clash marker".
7. **Short loops** (product tour "New booking" tab only): 6 to 8 seconds, H.264 MP4 plus WebM, under 1.5 MB, muted, `playsinline`, `preload="none"`, poster frame, visible pause control, no autoplay under reduced motion. Alternative with no video at all: the hero-style live markup demo reused in the tour.
8. **Review before commit:** every image checked for names, phone numbers and emails before it enters the repo.

---

## 8. Engineering constraints

### 8.1 Responsive

| Width | Landing | App (notes only) |
|---|---|---|
| 375 | Single column; demo card full width; tour tabs scroll horizontally; nav anchors in a menu | Sidebar already becomes an off-canvas menu below `md`; drawers go full width. Known mobile bugs (e.g. #094 iOS PDF size) stay out of scope. |
| 768 | Two-column hero; features 2 columns | Calendar month view usable; drawer 480px over content. |
| 1280 | Full layout, 72rem container | Primary design width. |
| 1536 | Same container, more side space; display type at max | Calendar gains width; no layout change. |

### 8.2 Performance budget (landing)

| Item | Budget |
|---|---|
| JS for `/` (gzipped) | Under 90 KB including React and ReactDOM; no FullCalendar, recharts, jsPDF, html2canvas, xlsx |
| CSS (gzipped) | Under 20 KB |
| Fonts | Under 70 KB total WOFF2, preloaded, `font-display: swap`, with a metric-matched fallback (`size-adjust`) to avoid layout shift |
| Hero image | Under 120 KB AVIF at 1440 wide |
| Video | None in the hero; tour loop under 1.5 MB, not preloaded |
| Third-party requests | Zero (also required by the CSP) |
| API requests on `/` | Zero |
| Targets | LCP under 2.5 s on throttled 4G mobile, CLS under 0.05, Lighthouse Performance and Accessibility at 90 or above |

### 8.3 Accessibility

- Landmarks: `header` (nav), `main`, `footer`; one `h1`; headings in order.
- Skip link to `main`; visible on focus.
- Every interactive element reachable and operable by keyboard; tour tabs follow the tabs pattern; FAQ uses `<details>`.
- AA contrast on all pairs listed per direction; focus outlines at 3:1 or more.
- Alt text on every screenshot describing the state shown; decorative drawings `alt=""`.
- `lang="en-IN"` on `<html>` (currently `en`) so screen readers pick Indian English pronunciation for ₹ amounts.
- App fixes listed in 1.6 (Escape, focus trap and return, `inert`, `aria-current`, muted text contrast).

### 8.4 Scope (ROADMAP.md)

The landing and redesign show only shipped features. Not shown, not hinted: customer portal or client-facing pages, WhatsApp booking intake, payment collection or gateway, bulk or automatic WhatsApp reminders, quotation PDFs, client ledger or repeat-client detection, deploy/return tracking, multi-day events, Google or phone login, Hindi or other languages, native apps.

---

## 9. Optional tooling

None of these is needed for any direction. Each direction works with Tailwind v3, plain CSS transitions and the current dependencies.

### 9.1 Self-hosted font files (practically required if any custom font is used)
- **Benefit:** the CSP blocks Google's font CDN, so self-hosting is the only way to use Anek, Schibsted or Baloo/Mukta.
- **Cost:** zero dependencies if the WOFF2 files are subset once and committed to `client/public/fonts/` with `@font-face` in `index.css`. The `@fontsource-variable/*` packages are the dependency alternative (simpler updates, larger files unless subset). Re-verify: CSP has no violations, no layout shift on swap.
- **Optional:** yes; the system font stack still works, but then every direction loses its main typographic idea.

### 9.2 Native `<dialog>` instead of a headless library
- **Benefit:** `showModal()` gives Escape-to-close, a top layer, the `::backdrop` and an inert page behind it, in every modern browser since 2022. A ~40-line hook adds focus return. Fixes most of 1.6 with no dependency.
- **Cost:** rework of five overlay components; `BookingDetail` is a drawer, which `<dialog>` also handles with CSS. Re-verify every modal flow, including the inventory confirm-anyway step and the delete-account flow.
- **Optional:** yes.

### 9.3 Radix primitives (`@radix-ui/react-dialog`, later Popover/Tabs)
- **Benefit:** battle-tested focus management and ARIA for complex widgets (menus, popovers, comboboxes) beyond what `<dialog>` covers.
- **Cost:** a new dependency tree (each primitive pulls in several small Radix packages); measure the gzipped delta with `vite build` before adopting. Unstyled, so no visual lock-in. Re-verify all overlays.
- **Optional:** yes. My view: start with 9.2; add Radix only when a widget needs it.

### 9.4 Pre-rendering the landing route
- **Benefit:** the landing's HTML ships with content (better first paint, link previews and search indexing without running JS).
- **Cost:** two entries (`index.html` for the landing, `app.html` for the app) with `vercel.json` rewrites for `/app`, `/login`, `/signup`, `/forgot-password`, `/privacy` to `app.html`; landing components must be safe to render on the server (no `window` at import time). A small build script using Vite's SSR build and `react-dom/server` needs no runtime dependency; tools like `vite-react-ssg` are simpler but add one. **CSP check:** `script-src 'self'` blocks inline scripts, so any tool that injects inline JSON for hydration will break.
- **Optional:** yes. The route split in 5.2 gets most of the speed without it.

### 9.5 Tailwind v4
- **Benefit:** tokens defined once in CSS (`@theme`) become CSS variables automatically, so FullCalendar overrides and any future dark theme read the same values; faster builds; and it is the only fix for the accepted build-time advisories BUGS #088 and #093.
- **Cost:** browser floor rises to Safari 16.4, Chrome 111, Firefox 128 (from the official upgrade guide). A merchant on an iPhone stuck below iOS 16.4 would get broken styles; that is a real consideration for this audience. Utility renames across the codebase (`shadow-sm` to `shadow-xs`, `rounded` to `rounded-sm`, `outline-none` to `outline-hidden`, `ring` to `ring-3`), changed defaults (border color and ring become currentColor, button cursor default), the JS config needs an explicit `@config`. The upgrade tool (`npx @tailwindcss/upgrade`) does most of it. Re-verify every screen; best done as its own commit with no visual change, before the redesign.
- **Optional:** yes.

### 9.6 Motion library (`motion`, formerly Framer Motion)
- **Benefit:** springs and layout animations (shared elements moving between screens).
- **Cost:** a JS animation runtime (tens of KB gzipped for the full React package; measure), main-thread animation, and nothing in any direction needs it.
- **Optional:** yes, and not recommended. CSS transitions plus the Web Animations API cover every interaction above. For the Family-style continuity moments, the View Transitions API is a native progressive enhancement (it degrades to an instant change); check current browser support before relying on it.

### 9.7 Accessibility checks in development
- **Benefit:** `eslint-plugin-jsx-a11y` (dev only) catches missing labels and alt text as you write; an axe run on the landing in CI guards the 90+ target.
- **Cost:** one or two dev dependencies and some lint noise on existing files.
- **Optional:** yes.

---

## 10. Recommendation: Ledger

1. **It fits how the product is used.** Merchants open it in daylight, at a shop counter or a venue, often on a mid-range phone. Dark-first (B) fights that; festive (C) is fun on the landing and tiring in a tool used all day.
2. **Its one bold idea is the product's thesis.** The big date with a clash under it and a confirm button that still works is "alert, don't block" in one picture, and the same numerals carry into the app.
3. **Least risk to meaning.** It keeps teal as the brand and as "confirmed", fixes every AA failure found (primary button, WhatsApp, labels, calendar pills), and has no accent that can be confused with clash red (C's rani pink measures 1.02:1 luminance against it).
4. **Smallest migration.** Slate becomes ink, teal-600 becomes teal-700, shapes and shadows get stricter. No dark theme to build (B), no color rules to police (C).
5. **The type choice earns its place.** One variable family from an Indian foundry, with a Devanagari sibling for a later Hindi interface, verified to carry ₹ and tabular figures, at 60.7 KB.

Borrow from the others: B's restraint (no hover scale inside the app, borders over shadows) is already in Ledger's app rules; C's Family-style continuity (label morph to "Booked", the one-time first-booking moment) is in Ledger's motion spec.

Suggested order once you choose: (1) route split and the `checkAuth` gate (no visual change), (2) a11y fixes from 1.6, (3) tokens and fonts, (4) landing, (5) app restyle screen by screen. Optional: Tailwind v4 as its own step before (3).

---

## 11. Open questions

1. **Free:** can the landing say "free" plainly ("Creating an account and using EventFlow is free"), or should it only say "free to sign up"?
2. **CTA label:** the brief names "Get started" in the nav and "Create free account" in the hero. UX writing says one action should have one name. Use "Create free account" in both?
3. **Cancelled bookings:** OK to move cancelled from red to grey with strikethrough, so red means only clash and errors?
4. **Demo business name** in screenshots: Shree Ganesh Caterers (fictional seed), a new fictional name, or Bala Ji Tent House (real, permitted, but reads as an endorsement)?
5. **Direction B only:** should the app get a full dark mode, or keep a light working canvas with dark chrome?
6. **Logged-in at `/`:** show "Open dashboard" (my proposal), or auto-redirect to `/app`?
7. **Phones:** mobile is out of scope for the app. Can the FAQ say it works in a phone browser (true today, with the #094 PDF caveat), or should the landing stay silent on phones?
8. **Language:** English only for launch, or a Hinglish line or two in the hero (OkCredit-style)? The fonts in all three directions can support Devanagari later.
9. **"Transform/opacity only":** is a 150ms color or shadow cross-fade on hover acceptable (paint only, no layout), or should color changes be instant?
10. **Sidebar in Ledger:** light paper sidebar (my proposal) or keep a dark one in `ink-900`?
11. **Reference inspection:** fetch could not see hover/press timings on Linear, Stripe, Apple and the rest. If you want measured values from those live sites, I can inspect them in the Claude desktop app's browser on your computer in a later session.
12. **Docs mismatch:** ROADMAP.md describes a BookMyShow-style "unit grid" inventory picker, but `BookingPage.jsx` uses quantity inputs. Which is current? (Affects the product tour.)
13. **`ui-ux-pro-max`:** not installed. Want it added before the build phase?
