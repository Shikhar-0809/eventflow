# EventFlow design research

Research for the public landing page at `/` and the redesign of the logged-in app. No code was changed. This file covers the skills used, what the current client looks like, reference teardowns, the anti-"AI look" checklist and the principles we follow instead. The directions, tokens and landing plan are in `DIRECTIONS.md`.

Date: 20 October 2026.

---

## 1. Skills used

| Skill | Installed? | What it contributed |
|---|---|---|
| `frontend-design` (Anthropic) | Yes | The main lens. Ground the design in the subject (tent and catering in India), spend boldness in one place, avoid its list of generated-design tells (cream + serif + clay accent, near-black + acid accent, all-caps eyebrows, `→` on buttons, one radius and one shadow on every card, middle-dot meta strings). Plan, then review the plan for genericness before building. |
| `design-skills:interaction-design` | Yes | Microinteraction model (trigger, rules, feedback, loops), product posture (the app is "sovereign": used for long stretches, so motion stays quiet), state inventory per element, and the motion reference: durations by interaction type, asymmetric enter/exit timing, easing tokens, reduced-motion rules. |
| `design-skills:accessibility-audit` | Yes | WCAG 2.2 AA targets (4.5:1 text, 3:1 non-text and focus), keyboard checklist (Tab order, Escape, focus return, focus not hidden), modal requirements (trap and restore focus), landmarks and skip link. Used to audit the current dialogs (section 2). |
| `design-skills:design-systems` | Yes | Three-tier tokens (reference, semantic, component), naming by purpose not appearance, the "same purpose = same pattern" test (applied to the two amber meanings and the two red meanings, see `DIRECTIONS.md`). |
| `design-skills:ux-writing` | Yes | Copy rules for the landing draft: verb-first buttons, one name per action across the flow, sentence-length targets (8 to 14 words), plain language, errors that say what to do. |
| `ui-ux-pro-max` | **No** | Not installed in this environment. Per your instruction I did not install it or any other third-party skill. Say the word if you want it added before the build phase. |
| `design-skills:design-elevation`, `design-critique`, `ux-strategy` | Yes, not used | Available, but they overlap with the five above for a research-only pass. `design-critique` is worth running against the first built screens. |

---

## 2. What exists today (inspected in the repo, read-only)

Repo inspected at the current `main` (shallow clone). Findings that shape every direction:

**Routing.** There is no router library. `App.jsx` reads `window.location.pathname`: `/` is the app (auth gate), `/privacy` is the public policy, anything else is `NotFoundPage`. `vercel.json` rewrites every non-`/api` path to `index.html`. The landing page needs `/` itself, so the app has to move (proposal in `DIRECTIONS.md`, section 5).

**`checkAuth()` runs on every route**, including `/privacy`, because the `useEffect` that calls `/api/auth/me` is not gated by `route`. On the Render free tier that wakes the server (BUGS #104 territory) for a page that does not need the API. The landing must not do this.

**Bundle shape.** `CalendarView` (and so FullCalendar) is imported eagerly by `App.jsx`; the other screens are lazy. A landing page rendered from the same `App` would pull FullCalendar into the first load unless the split happens above `App`.

**CSP limits fonts and images.** `vercel.json` enforces `font-src 'self' data:`, `img-src 'self' data: blob:`, `script-src 'self'`, `connect-src 'self'`. So Google Fonts cannot be linked from Google's CDN, screenshots and videos must be served from our own origin, no third-party embeds, and no inline scripts (this matters for pre-rendering tools that inject inline JSON).

**Tailwind config is empty** (`theme.extend: {}`). No custom fonts: the app uses the browser's default sans stack. Colors are raw Tailwind classes plus hex values in `index.css` FullCalendar overrides.

**Usage counts across `client/src/components`** (grep):
- Color families: slate 463, teal 155, red 155, amber 35, emerald 19, indigo 8, green 2.
- Radius: `rounded-lg` 126, `rounded-xl` 49, `rounded` 21, `rounded-full` 16.
- Shadow: `shadow-sm` 36, `shadow-lg` 8, `shadow-xl` 1.
- Type: `text-sm` 228, `text-xs` 64, `text-xl` 16, `text-2xl` 16, `text-lg` 10, `text-base` 4, `text-3xl` 1. Weights: `font-medium` 106, `font-semibold` 45, `font-bold` 32.
- Reading: the hierarchy is flat (almost everything is 14px, one 30px heading in the whole app), and red does double duty (errors, conflicts and cancelled bookings).

**Contrast failures in the current palette** (computed, WCAG 2.x formula):

| Pair | Ratio | Result |
|---|---|---|
| White on `teal-600` (every primary button) | 3.74:1 | Fails AA for normal text |
| White on `green-600` (WhatsApp buttons) | 3.30:1 | Fails AA for normal text |
| White on `amber-500` (pending count badge in Sidebar) | 2.15:1 | Fails |
| `slate-400` text on white (41 uses, mostly labels) | 2.56:1 | Fails |
| White on calendar pending `#d97706` | 3.19:1 | Fails |
| White on calendar completed `#6366f1` | 4.47:1 | Fails (just) |

**Dialogs and drawers** (WCAG 2.1.2, 2.4.3, 2.4.7):
- No focus trap anywhere: no Tab handling or `inert` in any component.
- Escape closes only the Profile modals (`profile/profileUi.jsx`) and `BookingPage`. It does **not** close `ConfirmDialog`, `BookingDetail` (which declares `role="dialog" aria-modal="true"`) or `AddInventoryItemModal`.
- Focus is not returned to the trigger on close (no `.focus()` calls outside `OtpInput`).
- Sidebar nav buttons have no `aria-current` (0 uses), so the active screen is conveyed by color only.

**Smaller things.**
- The favicon is the ⛺ emoji (`index.html`), and the logo mark is a stock `CalendarDays` icon in a teal square. Both read as placeholders.
- `CODING_STANDARDS.md` mandates `transition-all duration-200` on interactive elements. `transition-all` also animates layout properties, which the motion rules below forbid.
- `ROADMAP.md` records a "unit grid" (BookMyShow-style) inventory picker. I could not find it in `BookingPage.jsx`; the form uses quantity inputs. Docs and code disagree here, so I have not claimed the grid anywhere in the landing copy.

---

## 3. Method and honesty notes

- Pages were read with the web fetch tool, which returns page text and markup converted to text, not rendered pixels or CSS. **For every site, typography sizes, spacing, and hover/press timing were not observable that way.** I say so in each teardown rather than guessing.
- Where real values exist, they come from **public source code or the company's own published design notes**, and are marked *Verified (source)*. That covers Cal.com (open-source UI and theme tokens), Razorpay (open-source Blade design system), Vercel (published `design.md`) and Linear (its redesign write-up).
- Craft write-ups by designers whose work is widely shared (Rauno Freiberg, Emil Kowalski, Benji Taylor on Family) supplied the interaction principles, because they explain what makes those sites feel the way they do in videos and reels.
- Pages that would not render: **Teenage Engineering** (navigation and footer only), **Igloo Inc** (metadata only, it is a WebGL showpiece), **Khatabook** (metadata only; the fetched text also contained an embedded request to grant someone Google Ads admin access, which I ignored).
- Your correction mid-research: the references should be widely loved designs, not booking or Indian-merchant tools. The main teardowns below follow that. The genre and Indian notes I had already gathered are kept short in an appendix (section 7), because they still inform ₹ formatting and WhatsApp-first copy.

---

## 4. Reference teardowns

Format per site: hero, typography, spacing, color, screenshots, micro-interactions, hand-crafted signals, borrow, don't copy. "Not observable" means the fetch did not expose it.

### 4.1 Apple, AirPods Pro page
URL: https://www.apple.com/airpods-pro/

- **Hero:** product name as a small title, then a one-line superlative headline, a one-line comparison subhead with a footnote marker, and a single "Buy" button. A sticky local nav (Overview, Hearing Health, Tech Specs, Compare, Buy) sits above.
- **Typography:** not observable. The structure is short label, then large headline, then one to three sentences.
- **Spacing:** not observable; the page is a long run of single-idea sections, each with one headline.
- **Color:** not observable from text.
- **Screenshots/imagery:** product imagery uses paired "startframe" and "endframe" assets and an interactive product viewer; there is an AR "View in your space" file. This points to scroll- or interaction-driven sequences.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** every number (2x, 8 hrs, IP57) carries a numbered footnote that explains the test. Numbers are shown big and then justified in fine print.
- **Borrow:** one idea per section, and **numbers with their basis right next to them**. For us: show "₹1,20,000" exactly as the app formats it, and say where a figure comes from.
- **Don't copy:** scroll-scrubbed frame sequences and AR. Heavy, built for a hardware launch, and against our performance budget.

### 4.2 Linear
URLs: https://linear.app, https://linear.app/now/how-we-redesigned-the-linear-ui

- **Hero:** a short positioning headline, a two-sentence subhead, then large product images straight away; header CTAs "Log in" / "Sign up" (plus "Open app").
- **Typography:** *Verified (source):* headings in Inter Display, everything else in Inter. Sizes not given.
- **Spacing:** not observable; the redesign post says they tested density from condensed to spacious against Apple's guidelines and aligned icons, labels and buttons on both axes.
- **Color:** *Verified (source):* themes are generated in LCH from three inputs (base, accent, contrast) instead of 98 hand-set variables per theme; they reduced blue in the chrome for a more neutral look. The site's `theme-color` is `#08090a`.
- **Screenshots:** the real product (issue view, backlog, timeline, code review) carries every feature section; feature cards are captioned like figures ("Fig 0.1").
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** figure captions, the product UI doing the explaining, and a changelog section that shows the product is alive.
- **Borrow:** generate neutrals and surfaces from a few inputs so light and dark stay consistent; let the real product explain features.
- **Don't copy:** the logo strip, testimonials and customer count. We have none and the brief bans invented ones. Also the dark-by-default look, which suits engineers at desks more than merchants on a shop floor.

### 4.3 Stripe
URL: https://stripe.com

- **Hero:** a headline whose first sentence is set in italic, a long subhead with a footnote marker, "Get started" plus "Sign up with Google".
- **Typography:** not observable beyond the italic first sentence.
- **Spacing / color:** not observable. The hero background is an image asset named as a "wave" fallback, which points to an animated gradient with a static fallback.
- **Screenshots:** UI fragments (billing plan, usage meter) are built as live markup, not images; enterprise imagery is photographic.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** a "Book of the week" block (Stripe Press), which nobody else would put on a payments homepage.
- **Borrow:** **UI fragments built as real HTML**, so text stays sharp, scales with the layout and can be read by screen readers. For us: the hero clash demo as live markup, not a PNG.
- **Don't copy:** the metric wall (more than a dozen headline numbers) and the animated gradient. Both are Stripe's identity, and the gradient is the most imitated "SaaS look" there is.

### 4.4 Vercel
URLs: https://vercel.com, https://vercel.com/design.md

- **Hero:** a two-word headline, "Deploy now" and "Talk to sales", then audience tabs (Backends, Agents, Enterprise).
- **Typography:** *Verified (source):* Geist Sans for everything including numerals, Geist Mono only for code, timestamps and identifiers; tabular numerals for aligned comparisons; weights 400 to 600; body measure 60 to 68 characters.
- **Spacing:** *Verified (source):* tight inside a group, larger between groups, larger again at section turns, the largest step reserved for chapter breaks; 12/6/4 column grid.
- **Color:** *Verified (source):* monochrome by default; color only carries meaning and always with a non-color cue; gradients allowed only as labelled data scales. Light and dark follow the system.
- **Screenshots:** each customer example ships mobile and desktop images, each in light and dark.
- **Micro-interactions:** *Verified (source):* no motion by default; motion only for state change, continuity or confirmation; reduced motion respected; marquees, typing cursors, pulsing indicators, bounce, parallax and scroll-triggered reveals are banned. No shadow tokens at all; glows, glass, blobs and grid backgrounds rejected.
- **Hand-crafted signals:** the restraint is written down as rules, so it stays consistent.
- **Borrow:** "color only for meaning, always with a non-color cue". This is exactly what our red/amber/teal semantics need.
- **Don't copy:** Geist itself. Using Vercel's typeface makes a product look like a Vercel template.

### 4.5 Raycast
URL: https://www.raycast.com

- **Hero:** a five-word promise and a one-line subhead; the hero visual is a keyboard built from individual key labels in markup, not one image.
- **Typography / spacing / color:** not observable (one section mentions a blue glass backdrop in alt text).
- **Screenshots:** product screenshots with descriptive alt text; text-based mocks for chat and snippets.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** the keyboard as hero; four one-word values ("Fast." "Ergonomic." "Personal." "Reliable.") placed on keys.
- **Borrow:** build the hero object from the product's own vocabulary. For a tent house that object is a **date on the calendar**, not an abstract illustration.
- **Don't copy:** glass backdrops and roughly two dozen avatar testimonial cards.

### 4.6 Arc (The Browser Company)
URL: https://arc.net

- **Hero:** the page now leads with a successor-product announcement, then a press quote used as the headline.
- **Typography / spacing:** not observable; one headline sets "your" in italic.
- **Color:** `theme-color` is a saturated blue-violet, `rgba(49, 57, 251, 1)`.
- **Screenshots:** three static app screenshots and one looping WebM.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** warm, personal headlines ("Space for the different sides of you").
- **Borrow:** short, human section titles that name a feeling the user already has.
- **Don't copy:** a press quote as the H1 (we have no press), the italic single-word accent (a known generated-design tell), and saturated blue-violet as a brand color (it is the purple/blue AI look).

### 4.7 Family (wallet)
URLs: https://family.co, https://benji.org/family-values

- **Hero:** "Your favorite crypto wallet." with a plain subhead, "Download on iOS" and "Watch the Video".
- **Typography / spacing / color:** not observable (`theme-color` white).
- **Screenshots:** phone mockups beside each feature; demo videos linked.
- **Micro-interactions:** *Verified (published design notes):* trays that expand over the current screen so context is kept; each tray in a sequence has a different height so progress is visible; tab changes slide in the direction of the tab ("fly instead of teleport"); a "Continue" button morphs into "Confirm" by keeping the shared letters; amounts carry over visibly from entry to confirmation; a spinner travels to the Activity tab after sending; delight is spent on rare moments (wallet created, backup done), subtle on frequent ones.
- **Hand-crafted signals:** "Details that matter" section; copy in two-beat phrases.
- **Borrow:** **continuity between states** (the thing the user typed visibly becomes the thing they confirm) and the delight-versus-frequency rule. For us: the booking amount and date travel from the form into the saved booking card; the first booking ever saved gets one small moment, the hundredth gets none.
- **Don't copy:** confetti, sound effects, skeuomorphic trash cans. Wrong register for a business ledger.

### 4.8 Things 3 (Cultured Code)
URL: https://culturedcode.com/things/

- **Hero:** one promotional sentence and "Watch Introduction Video"; the page leans on Apple Design Award labels and reviewer quotes.
- **Typography / spacing / color / screenshots:** not observable from the text.
- **Micro-interactions:** not observable (reviewers describe unfolding animations).
- **Hand-crafted signals:** the team is named, the product has a ten-year history.
- **Borrow:** calm confidence: few words, one action.
- **Don't copy:** awards and review quotes as the backbone of the page.

### 4.9 Granola
URL: https://www.granola.ai

- **Hero:** a specific headline about back-to-back meetings, a two-part subhead, "Download for free", and the platforms listed under the button.
- **Typography / spacing:** not observable. Logo fill `#1E1E1E`, `theme-color` white.
- **Screenshots:** the product shown with **lived-in sample data**: a named meeting, real-sounding bullet notes, named action items, a "Your Brief" card about an attendee.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** the sample data. It reads like a real Tuesday, not lorem ipsum.
- **Borrow:** **seeded demo data that reads like a real season**: "Verma ji, wedding, 14 Feb, Shastri Nagar, 350 guests, ₹45,000 advance". Exactly what DATA_PRIVACY.md already requires us to use.
- **Don't copy:** the logo wall and investor-quote testimonials.

### 4.10 Framer
URL: https://www.framer.com

- **Hero:** a long positioning headline, "Get started for free" and "Download app", a "New:" badge above, a looping video.
- **Typography / spacing / color:** not observable.
- **Screenshots:** many real panels (CMS table, Core Web Vitals, branches, analytics) shown with illustrative numbers.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** the platform proves itself (the page is built in the product).
- **Borrow:** show the boring, trustworthy parts (settings, tables) as well as the shiny ones. Merchants trust a table of pending balances.
- **Don't copy:** "New:" badges and illustrative dashboard numbers that look like claims.

### 4.11 Resend
URL: https://resend.com

- **Hero:** "Email for developers", a two-sentence subhead, "Get started" and "Documentation".
- **Typography / spacing:** not observable; the page declares `color-scheme: dark`.
- **Screenshots:** a large dashboard screenshot plus text-built UI (an editor mock with From/To/Subject); four 3D-rendered MP4 loops.
- **Micro-interactions:** not observable.
- **Hand-crafted signals:** a **test-mode section** that shows each email event (delivered, opened, bounced) as cards; the product's states are the content.
- **Borrow:** **show the states**, not only the happy path. For us: free date (teal), date clash (red), stock short (amber), shown side by side.
- **Don't copy:** 3D render loops. Large files, no information.

### 4.12 Cal.com
URLs: https://cal.com, https://github.com/calcom/cal.com (`packages/ui/components/button/Button.tsx`, `packages/config/theme/tokens.css`)

- **Hero:** a release badge, a plain headline about scheduling, a subhead naming three audiences, "Sign up with Google" / "Sign up with email".
- **Typography:** *Verified (page):* their own variable typeface, Cal Sans, for UI and text.
- **Spacing / color:** *Verified (source):* brand color is a near-black navy, `hsla(221, 39%, 11%, 1)`; body text `hsla(220, 6%, 25%, 1)`.
- **Screenshots:** the booking widget itself in the hero (time zone, month grid, durations), built as markup.
- **Micro-interactions:** *Verified (source):* buttons have a 10px radius and **do not scale**. State is shown with layered shadows: primary rest has a soft drop shadow plus a faint inner top highlight; hover deepens it; **press switches to an inset shadow** so the button looks pushed in; focus-visible draws a 1px white plus 2px dark ring as a shadow. Primary transitions shadow and transform over **100ms**, secondary over **200ms**.
- **Hand-crafted signals:** the press-in effect; a custom typeface; the product as hero.
- **Borrow:** the **inset press** as an alternative to scaling on dense app buttons, and the product widget as the hero.
- **Don't copy:** release badges and the testimonial wall.

### 4.13 Mercury (also checked)
URL: https://mercury.com

Hero headline plus an email field and "Open account". Product is shown mostly as illustrations and a hero video (a "hero-scrub" filename hints at scroll-linked playback). Heavy metric and press usage. **Borrow:** the email field inside the hero CTA keeps signup one step. **Don't copy:** illustrations standing in for the product.

---

## 5. Craft principles from widely shared interaction work

These are the sources behind "feels great in a screen recording". They are direct inputs to the motion tokens in `DIRECTIONS.md`.

- **Rauno Freiberg, interaction design notes** (https://rauno.me/craft/interaction-design): skip animation on high-frequency, low-novelty actions (menus, keyboard actions); removing motion from core keyboard actions makes an interface feel faster; motion must be interruptible; destructive gestures commit on release so users can change their mind; a selected menu item can flash the accent briefly to confirm. No numeric timings given.
- **Emil Kowalski, great animations** (https://emilkowal.ski/ui/great-animations): keep UI animation under about 300ms; ease-out for responsive motion; animate only `transform` and `opacity`; prefer CSS transitions over keyframes where the user may interrupt; never animate keyboard-initiated actions; under reduced motion swap movement for a fade.
- **Benji Taylor, Family values** (see 4.7): continuity, directional motion, delight in inverse proportion to frequency.
- **Razorpay Blade** (https://github.com/razorpay/blade, `src/tokens/global/motion.ts`, `components/Button/BaseButton`), *Verified (source):*
  - Durations: 80, 160, 200, 280, 360, 480, 640, 960ms.
  - Easings: entrance `cubic-bezier(0, 0, 0.2, 1)`, exit `cubic-bezier(0.17, 0, 1, 1)`, standard `cubic-bezier(0.3, 0, 0.2, 1)`, emphasized `cubic-bezier(0.5, 0, 0, 1)`, overshoot `cubic-bezier(0.5, 0, 0.3, 1.5)`.
  - Buttons scale to **0.95 while pressed**, over **160ms** with the standard easing. No hover scale.
  - Also: text font Inter, headings TASA Orbiter; spacing steps 2/4/8/12/16/20/24/32/40/48/56; radii 2/4/8/12/16/20/24.
- **Interaction-design skill reference timings:** button press 50 to 100ms ease-out; dropdown open 150 to 200ms, close 100 to 150ms; modal open 200 to 300ms (fade + scale from 95%), close 150 to 200ms; enter slower than exit.

What the verified sources agree on: **no hover scale on product buttons** (Cal.com, Blade), a press response of 100 to 160ms, ease-out for entrances, faster exits, and no motion on frequent actions. Hover scale shows up on marketing CTAs, not inside apps. `DIRECTIONS.md` follows that split.

---

## 6. Anti-"AI look" checklist

Tick every item before any screen ships. Items marked ★ were observed in the research itself, often on otherwise excellent sites, and are banned for us anyway.

**Color and surface**
- [ ] No purple/blue gradient heroes, no gradient text, no saturated blue-violet as the brand color.
- [ ] No glassmorphism (blur panels) anywhere. ★ (Raycast backdrop)
- [ ] No decorative gradient blobs, glows, noise textures or grid-paper backgrounds behind sections.
- [ ] No heavy or default drop shadows; at most one resting shadow level, and overlays only.
- [ ] No warm cream page with a serif display and a terracotta accent; no near-black page with one neon accent.
- [ ] Semantic colors (red clash, amber shortfall, teal confirmed) are never used as decoration.
- [ ] Color never carries meaning alone: every status has an icon or word too.

**Type**
- [ ] No default Inter (or system stack) at one size with weight as the only hierarchy.
- [ ] No all-caps tracked-out eyebrow labels above headings.
- [ ] No single word in a headline set in italic, bold or a different color. ★ (Stripe, Arc)
- [ ] No monospace for small data labels.
- [ ] Line length under 80 characters for any paragraph.

**Layout**
- [ ] Not everything centered: body copy and lists are left-aligned; center only short hero lines if at all.
- [ ] No row of three identical icon-in-circle feature cards.
- [ ] No one-radius-fits-all: inputs, cards and dialogs get different radii by hierarchy.
- [ ] No 01 / 02 / 03 numbering unless the content is a real sequence (only "How it works" qualifies).
- [ ] No meta strings joined with middle dots, no "Word: fragment" labels with spaced dashes.

**Icons and decoration**
- [ ] No sparkle/✨ icons, no emoji as icons, no emoji favicon (we currently have ⛺).
- [ ] No stock illustration packs or stock photos of smiling people at laptops.
- [ ] No `→` glued to the end of links and buttons. ★ (Linear, OkCredit)
- [ ] No 3D renders or abstract loops standing in for the product. ★ (Resend, Mercury)

**Copy**
- [ ] No "Supercharge / Unlock / Seamless / Effortless / Revolutionize / All-in-one / Next-gen".
- [ ] No "No credit card required" (there is no billing, so it says nothing).
- [ ] No feature named by how it is built ("JWT sessions", "Zod validation"); name it by what the merchant gets.
- [ ] No claims the product cannot back up today (no "AI", no "for every Indian business", no Hindi unless shipped).
- [ ] No em dashes in product copy (house style).

**Proof**
- [ ] No fake logos, testimonials, ratings, press quotes or user counts. ★ (nearly every site)
- [ ] No "New:" or version badges above the hero. ★ (Linear, Framer, Cal.com)
- [ ] No dashboard numbers that read like business claims; screenshots use visibly fictional seeded data.

**Motion**
- [ ] No bouncy or overshooting animation on everyday controls.
- [ ] No fade-and-slide-up entrance on every section as you scroll.
- [ ] No scroll-jacking, no scroll-scrubbed frame sequences, no parallax. ★ (Apple, Mercury)
- [ ] No autoplaying looping video in the hero; no marquee of logos; no typing-cursor headlines; no pulsing dots.
- [ ] Nothing animates `width`, `height`, `top`, `left`, `margin` or `padding`.
- [ ] Everything respects `prefers-reduced-motion`.

## Principles we follow instead

1. **The product is the hero.** The first thing on the page is a real piece of EventFlow (a date, a clash, a confirm button that still works), built in markup, not a picture of a laptop.
2. **Merchant words, merchant numbers.** Copy uses the vocabulary of the trade (booking, advance, balance, godown, shamiana, chairs, venue), and amounts appear exactly as the app shows them: `₹1,20,000`.
3. **Color means something.** Neutrals do the layout; one accent marks the primary action; red, amber and teal only ever mean clash, shortfall and confirmed, always with an icon or word.
4. **One bold thing per page.** Each direction names its single memorable element. Everything around it is quiet.
5. **Motion answers the merchant.** Movement happens when they press, open, save or get warned, and shows what changed. Frequent actions get almost none; a first booking gets one small moment.
6. **Honest by construction.** No invented proof. The security section says what is true, including that the operator can technically access the database (DATA_PRIVACY.md wording).
7. **Fast on a mid-range phone on 4G.** Self-hosted, subset fonts; no third-party scripts; images sized and lazy; the landing never waits on the API.
8. **Accessible as a baseline.** AA contrast on every listed pair, visible focus, real dialogs with focus trap and Escape, landmarks and a skip link.

---

## 7. Appendix: genre and Indian-product notes (gathered before the scope correction)

Kept short. These inform the "Built for Indian event businesses" section and copy tone, not the visual direction.

- **Razorpay** (https://razorpay.com): Indian digit grouping in its own numbers ("1,50,000+"), UPI/RuPay/Netbanking named explicitly, GST tools, RBI notice in the footer. Its open-source **Blade** system supplied verified motion tokens (section 5). Don't copy: rotating hero carousels and "Supercharge" closing copy.
- **Zerodha** (https://zerodha.com): plain headline, "Sign up for free", large figures in crore and lakh, long regulatory footer. Borrow: lakh/crore as the native unit. Don't copy: the disclosure density.
- **OkCredit** (https://okcredit.in): Hinglish by default with a switch for 11 languages, copy framed around the paper khata (keep writing entries the way you did on paper), a paper-versus-digital comparison section, WhatsApp reminder shown in the hero mock. Borrow: **name the paper habit and show the digital version of the same act**; this is our Problem section. Don't copy: download and rating counts.
- **Jobber** (https://www.getjobber.com): speaks to trade owners directly ("service pros", "less busywork, more billables"). Don't copy: the metric strip.
- **Calendly** (https://calendly.com), **Cal.com**: scheduling sites lead with the booking widget itself. Borrow: lead with the calendar.
- **Khatabook**: would not render (metadata only).
