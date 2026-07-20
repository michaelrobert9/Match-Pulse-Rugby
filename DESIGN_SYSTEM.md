# MatchPulse Design System
**Version 1.0 · June 2026**

---

## 1. Audit Summary

### What was read

Every shared component, all public pages, all manage/admin pages, and the AI Studio inspiration version were reviewed before this document was written.

### What MatchPulse feels like today

A **functional dark-mode database tool** that happens to track rugby. The interaction patterns are clean and consistent, but the visual hierarchy is flat. A fixture looks the same as a settings field. A live score looks the same as a competition name. A school looks the same as any other row.

### What MatchPulse should feel like

A **live sports companion**. Matches are the heartbeat. Schools and clubs are protagonists. Every page should feel like it belongs to a sport — not to software.

---

## 2. Inconsistency Audit

The following conflicts were found between files. Each is a concrete problem to resolve, not a stylistic preference.

### 2.1 Multiple StatusBadge implementations

There are **three** separate ways status is communicated:

| Location | Implementation |
|---|---|
| `OrgManage.jsx` | `StatusBadge` component with `bg-sky-950/40 text-sky-400` (upcoming), `bg-emerald-950/40 text-emerald-400` (active/live), `bg-slate-800 text-slate-500` (final) |
| `Home.jsx` CompetitionCard | Inline JSX: `bg-emerald-950/50 text-emerald-400` (live), `bg-slate-800 text-slate-500` (final), `bg-slate-800 text-sky-400` (upcoming) |
| `MatchDetail.jsx` | Inline text only: `text-emerald-400` (live), `text-slate-500` (others) |

**Resolution:** One `StatusBadge` component, one set of tokens.

### 2.2 Card border-radius mixing

All cards use `rounded-xl` throughout the app. The `OrgManage.jsx` section container uses `rounded-xl`. The manage hub cards use `rounded-xl`. This is technically *consistent* but the radius is too small for the premium sports-media aesthetic — it reads as functional software, not a destination product.

**Resolution:** Upgrade the primary card radius to `rounded-2xl`. Reserve `rounded-xl` for inline elements (badges, inputs, buttons).

### 2.3 Page max-width inconsistency

| Page | Max-width |
|---|---|
| Home, OrgList, Browse, CompetitionsList | `max-w-7xl` |
| OrgDetail, TeamDetail, CompetitionOverview | `max-w-3xl` |
| OrgManage, CreateOrg | `max-w-2xl` |
| MatchDetail | **no wrapper** — full bleed |
| PersonCareer | `max-w-3xl` |
| Admin pages | Inside AdminLayout sidebar — variable |

MatchDetail has no container at all on desktop, which causes text to span the full viewport width. Manage pages use `max-w-2xl` while adjacent public pages use `max-w-7xl`, creating a jarring context shift.

**Resolution:** Define three layout tiers (see Section 7).

### 2.4 Button inconsistency

Primary buttons in forms: `uppercase tracking-wider rounded-lg py-2.5 text-sm font-bold`  
Error retry buttons: `rounded-lg px-4 py-2 text-sm` (no uppercase)  
Nav action links: `text-[10px] font-bold uppercase tracking-widest` (micro-label style)  
QuickActions buttons in OrgManage: three different visual weights with no clear secondary/tertiary system

**Resolution:** Define three button tiers (see Section 6).

### 2.5 Match cards have no consistent visual identity

The same "match" is rendered four different ways:
- **Home page** (`MatchResultCard`): horizontal flex, score on right, team names left
- **Home page** (`UpcomingMatchCard`): team names inline with "vs", date below
- **Home page** (`LiveMatchCard`): score large in centre, teams either side
- **OrgManage** (`UpcomingFixturesSection` row): team names with "vs", status badge, date
- **MatchDetail** header: full-width score panel with team colour strips

There is no shared "match card" component or token set. Live matches do not look more important than upcoming ones. Final scores are not visually prominent.

**Resolution:** Define a Match Card system (see Section 5.1).

### 2.6 Manage pages look like admin software

`OrgManage.jsx` renders sections (`Upcoming Fixtures`, `Teams`, `Staff`) as database-style row lists inside `bg-surface rounded-xl border border-slate-800` containers with header labels. This is identical to how the admin panel at `/admin` looks. There is no visual difference between "managing your school's fixtures" and "an admin editing a database record."

The public `OrgDetail.jsx` page (school/club public profile) is also just a list of teams in rows — there is no hero, no recent results, no upcoming fixture, no sense of a living organisation.

**Resolution:** Manage screens and public org pages share the same card/layout language as the rest of the product. Section 9 defines the priority upgrade path.

### 2.7 Form inputs use a hardcoded colour

Inputs use `bg-[#0A0C10]` (a hardcoded hex matching `canvas`) instead of a token. If the canvas colour changes, inputs break visually.

**Resolution:** Replace with `bg-canvas` token reference.

### 2.8 Micro-label colour is inconsistent

`.micro-label` utility sets `text-slate-500` but `OrgManage.jsx`'s `Section` component header sets `text-slate-400`. Both render as section headings but at different contrast levels.

**Resolution:** Standardise `micro-label` at `text-slate-500`.

### 2.9 The hero question: dark vs. light

The AI Studio inspiration uses light card bodies (`bg-white`) on a light page with a single dark hero. The current app is dark end-to-end. The brief says: "dark hero sections, light content areas."

**Recommendation: do not flip to light mode.** The dark canvas is a strong, distinctive choice that fits a live sports companion better than a light app. What the dark theme lacks today is *contrast and hierarchy* — cards blend into each other because `bg-surface` and `bg-canvas` are only `#0A0C10` vs `#0F1219`. The fix is not light mode; it is better surface differentiation and stronger use of the emerald accent.

Adopt instead: **Dark canvas · Elevated surfaces · Emerald energy**.

---

## 3. Colour System

### 3.1 Background scale

```
canvas    #0A0C10   — page background (body)
surface   #0F1219   — default card/panel background
elevated  #161B22   — raised card (formerly table-row), modal
overlay   #1C2230   — hover states, active rows
```

No changes to canvas or surface token names. Add `elevated` (currently named `table-row` — rename it).

### 3.2 Border scale

```
border-faint    slate-800/50   — very subtle dividers
border-default  slate-800      — default card borders
border-strong   slate-700      — hover / focus borders
border-active   slate-600      — active / selected state
```

### 3.3 Text scale

```
text-primary    white           — headlines, active labels
text-secondary  slate-300       — body copy
text-muted      slate-400       — supporting info
text-faint      slate-500       — metadata, micro-labels
text-ghost      slate-600       — placeholder, secondary metadata
```

### 3.4 Emerald palette (primary accent)

```
emerald-950/30   — subtle emerald wash (CTA backgrounds)
emerald-900/50   — live match card border
emerald-800      — emerald border, focus rings
emerald-700      — emerald text on light emerald bg
emerald-600      — nav link hover, secondary emerald
emerald-500      — primary action, live dot, active badge
emerald-400      — live indicators, icons on dark backgrounds
```

### 3.5 Status colours

| Status | Background | Text | Use |
|---|---|---|---|
| Live | `bg-emerald-500/15 border-emerald-500/30` | `text-emerald-400` | Live matches, active competitions |
| Upcoming | `bg-sky-500/10 border-sky-500/20` | `text-sky-400` | Scheduled fixtures |
| Final | `bg-slate-800 border-slate-700` | `text-slate-400` | Completed matches |
| Paused / HT | `bg-sky-950/40 border-sky-800/30` | `text-sky-400` | Half-time |

### 3.6 Team identity

Team identity is always expressed with the team's `primaryColor`. Use `primaryColor + '20'` for background tint and the raw `primaryColor` for border and icon. Never use a fixed colour for team identity elements.

---

## 4. Typography

### 4.1 Font stack (unchanged from current)

```
font-display  Space Grotesk  — page titles, hero copy, team names
font-sans     Inter          — body, labels, buttons, UI text
font-mono     JetBrains Mono — scores, stats, badges, timestamps
```

### 4.2 Type scale

| Role | Tag | Classes |
|---|---|---|
| Page title | h1 | `font-display font-bold text-white text-2xl sm:text-3xl` |
| Section title | h2 | `font-display font-bold text-white text-xl` |
| Card title | — | `font-display font-bold text-white text-base leading-tight` |
| Body | p | `font-sans text-sm text-slate-300 leading-relaxed` |
| Supporting | span | `font-sans text-xs text-slate-400` |
| Micro-label | — | `font-sans text-[10px] font-bold uppercase tracking-widest text-slate-500` |
| Score · large | — | `font-mono font-black text-4xl tabular-nums text-white leading-none` |
| Score · medium | — | `font-mono font-bold text-2xl tabular-nums text-white` |
| Score · inline | — | `font-mono font-bold text-lg tabular-nums text-white` |
| Stat number | — | `font-mono font-black text-white tabular-nums` |
| Timestamp | — | `font-mono text-xs text-slate-500 tabular-nums` |
| Badge text | — | `font-mono text-[9px] font-bold uppercase tracking-widest` |

### 4.3 Hero tagline

The product tagline — "The easiest way to create, score and publish school and club rugby fixtures." — should appear on the Home hero in `font-sans text-base text-slate-400 leading-relaxed`. The main headline uses `font-display`.

---

## 5. Card System

All cards share a base. Variants extend it.

### 5.1 Base card

```
bg-surface rounded-2xl border border-slate-800
```

Hover state: `hover:border-slate-700 transition-colors`  
Active/selected: `border-emerald-500/40 bg-emerald-950/10`

**Breaking change from current app:** `rounded-xl` → `rounded-2xl` on all primary cards. `rounded-xl` reserved for sub-elements (badges, inputs, icon containers).

---

### 5.2 Match Card system

Match cards are the most important visual element. They must express the *drama* of sport.

**Live Match Card**
```
bg-surface rounded-2xl border border-emerald-800/60 p-4
relative overflow-hidden
```
- Left accent strip: `absolute left-0 top-0 bottom-0 w-1 bg-emerald-500`
- Live pill: emerald with animate-pulse dot
- Score: `font-mono font-black text-4xl tabular-nums` centred between team badges
- Team badges: coloured `rounded-xl` swatch with short code

**Result Card**
```
bg-surface rounded-2xl border border-slate-800 p-4
hover:border-slate-700
```
- Final badge: `bg-slate-800 text-slate-400 font-mono text-[9px] uppercase tracking-widest rounded-full`
- Winner team name: `text-white font-semibold`, loser: `text-slate-500`
- Score: `font-mono font-bold text-xl tabular-nums` right-aligned column

**Upcoming Fixture Card**
```
bg-surface rounded-2xl border border-slate-800 px-4 py-3
hover:border-slate-700
```
- Date/time in `text-emerald-400 font-mono text-[10px] uppercase tracking-widest`
- Teams: `text-white text-sm font-medium`
- Venue: `text-slate-500 text-xs`

---

### 5.3 School / Club Card

```
bg-surface rounded-2xl border border-slate-800 px-4 py-3
hover:border-slate-700
```
- Identity swatch: `w-10 h-10 rounded-xl` with `primaryColor + '20'` bg and `primaryColor` border
- Name: `font-sans text-sm font-semibold text-white`
- Region / sub-label: micro-label

On School/Club detail pages (public profile), the card upgrades to a **hero card**:
```
bg-surface rounded-2xl border border-slate-800 overflow-hidden
```
With a `h-2` colour-bar gradient header, `p-5` body, and logo at `w-16 h-16 rounded-xl`.

---

### 5.4 Team Card

```
bg-surface rounded-2xl border border-slate-800 px-4 py-3
```
- Badge swatch: `w-8 h-8 rounded-lg` with team colour
- Name: `text-white text-sm font-semibold`
- Competition: micro-label

---

### 5.5 Player Card

```
bg-surface rounded-2xl border border-slate-800 p-3
hover:border-slate-700
```
- Avatar: `w-10 h-10 rounded-xl bg-slate-800 border border-slate-700`
- Name: `font-sans font-semibold text-sm text-white`
- Stats: `font-mono text-xs text-emerald-400` (caps) / `text-slate-400` (tries, points)

---

### 5.6 Section / Panel Card (Manage + public detail pages)

Used for grouping content on detail and manage pages. Same visual language — not a separate "admin" style.

```
bg-surface rounded-2xl border border-slate-800 overflow-hidden
```
Header bar (inside card):
```
flex items-center justify-between px-4 py-3 border-b border-slate-800
```
Header label: micro-label (`text-[10px] font-bold uppercase tracking-widest text-slate-500`)

---

## 6. Button Hierarchy

### Primary — Emerald

Use for the single most important action on a screen (Create fixture, Save, Sign in).

```
bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600
text-white font-bold text-sm
rounded-xl px-4 py-2.5
transition-colors
disabled:opacity-50 disabled:cursor-not-allowed
```

Full-width variant: add `w-full` and `uppercase tracking-wider`.

### Secondary — Surface

Use for supporting actions (Add team, Cancel, Browse all).

```
bg-surface border border-slate-700 hover:border-slate-500
text-slate-300 hover:text-white
font-medium text-sm
rounded-xl px-4 py-2.5
transition-colors
```

### Tertiary — Ghost

Use for low-priority or destructive-path actions (Settings, Add competition, Delete).

```
border border-transparent hover:border-slate-700 hover:bg-white/5
text-slate-500 hover:text-slate-300
font-medium text-sm
rounded-xl px-4 py-2.5
transition-colors
```

### Destructive

```
text-slate-600 hover:text-red-400
transition-colors p-1
```
Icon-only. Never a full-width button.

### Link button

```
text-[10px] font-bold uppercase tracking-widest
text-emerald-600 hover:text-emerald-400
transition-colors
```
Used for "View all →", "+ New", "Cancel" in section headers.

### CTA card button

Full-card emerald CTA (e.g. "Create your school or club"):
```
flex items-center gap-3
bg-emerald-950/30 border border-emerald-800/40
rounded-2xl px-4 py-4
hover:bg-emerald-950/50 transition-colors
```

---

## 7. Spacing & Layout

### 7.1 Layout tiers

| Tier | Constraint | Used for |
|---|---|---|
| Wide | `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` | Home, Browse, OrgList, CompetitionsList — discovery pages |
| Content | `max-w-3xl mx-auto px-4 sm:px-6` | OrgDetail, TeamDetail, PersonCareer, CompetitionOverview — detail pages |
| Focused | `max-w-2xl mx-auto px-4` | OrgManage, MatchDetail — task/action pages |

**MatchDetail fix:** wrap content in `max-w-2xl mx-auto` — currently unwrapped.

### 7.2 Page padding

- Top: `py-6`
- Bottom: `pb-12` (public), `pb-8` (manage/admin)
- Section spacing: `space-y-6` between major sections, `space-y-4` within sections
- Card internal: `px-4 py-3` (list rows), `p-4` or `p-5` (feature cards)

### 7.3 Page structure rule

Every page follows this order:
1. **Hero / Header** — page title, identity (logo, colour bar), status indicator
2. **Key Actions** — primary CTA (Create fixture / Edit / Share)
3. **Primary Content** — the thing that brought the user here (fixtures, results, teams)
4. **Secondary Content** — supporting context (competitions, settings, staff)

This is a structural rule, not a layout constraint. It applies to OrgDetail, OrgManage, MatchDetail, and TeamDetail equally.

---

## 8. Component Tokens

### StatusBadge (single implementation)

```jsx
const STATUS = {
  live:     'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400',
  upcoming: 'bg-sky-500/10 border border-sky-500/20 text-sky-400',
  paused:   'bg-sky-950/40 border border-sky-800/30 text-sky-400',
  final:    'bg-slate-800 border border-slate-700 text-slate-400',
  active:   'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400',
}
// className: `font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full`
```

### LiveDot

```jsx
<span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
```

### TeamSwatch (coloured identity badge)

```jsx
// size = 'sm' | 'md' | 'lg'
// sm: w-6 h-6 rounded-lg — inline references
// md: w-9 h-9 rounded-xl — list cards
// lg: w-14 h-14 rounded-xl — page headers
style={{ backgroundColor: color + '20', border: `1.5px solid ${color}` }}
```

### MicroLabel

```jsx
<span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
```

(The `.micro-label` utility in `index.css` already covers this — use it consistently.)

### Spinner

```jsx
<div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
```

### EmptyState

```jsx
<div className="bg-surface rounded-2xl border border-slate-800 px-4 py-10 text-center">
  <p className="text-slate-500 text-sm">{message}</p>
  {sub && <p className="text-slate-600 text-xs mt-1">{sub}</p>}
  {cta}
</div>
```

### Input / Select / Textarea

```
bg-canvas border border-slate-700 rounded-xl
px-3 py-2.5 text-white text-sm placeholder-slate-600
focus:outline-none focus:border-emerald-500 transition-colors
```

Change `bg-[#0A0C10]` → `bg-canvas` throughout. Add `rounded-xl` (currently `rounded-lg`).

---

## 9. Screen Priority Recommendations

Prioritised by impact-to-effort ratio. Do not redesign everything at once.

### Priority 1 — Foundation (one-time, high leverage)

**Tailwind config:** Add `elevated` colour token, rename `table-row`.  
**`index.css`:** Add utility classes for the card base, status badge, score display.  
**StatusBadge:** Create a single `src/components/StatusBadge.jsx` and replace all three current implementations.

*Effort: small. Impact: removes the most glaring inconsistency immediately.*

---

### Priority 2 — Match Cards (highest visible impact)

**`src/pages/Home.jsx`** — `LiveMatchCard`, `MatchResultCard`, `UpcomingMatchCard`:
- Upgrade to `rounded-2xl`
- `LiveMatchCard`: add left emerald accent strip, enlarge score to `text-4xl`, add team colour swatches
- `MatchResultCard`: enlarge score column, bold winner team name

**`src/pages/MatchDetail.jsx`** — score panel:
- Wrap in `max-w-2xl mx-auto`
- Score to `text-5xl font-mono font-black`
- Team colour strips → full gradient `h-1.5` bar (already there, good)

*Effort: medium. Impact: highest — match cards are the dominant visual element on every page.*

---

### Priority 3 — School & Club Detail Pages

**`src/pages/OrgDetail.jsx`** — currently just a header card + team list:
- Add Upcoming Fixtures section (top 3, from Firestore, same card pattern as Home)
- Add Recent Results section (top 3)
- Make it feel like a mini sports website, not an organisation record

*Effort: medium-high (requires data fetching). Impact: very high — these are the destination pages for public discovery.*

---

### Priority 4 — Manage Pages

**`src/pages/manage/OrgManage.jsx`**:
- Upgrade section cards from `rounded-xl` to `rounded-2xl`
- Replace the Section component's header label from `text-slate-400` to `.micro-label` (`text-slate-500`)
- The UpcomingFixturesSection and RecentResultsSection match rows should use the same card tokens as the public match cards — not plain `divide-y` rows

*Effort: small-medium. Impact: closes the visual gap between public and manage.*

---

### Priority 5 — Nav & Logo

**`src/components/Nav.jsx`**:
- Increase logo size slightly (currently `text-lg`)
- Add a `w-2 h-2 rounded-full bg-emerald-400 animate-pulse` live indicator next to the logo mark (communicates "live platform" at all times)

**`src/components/BottomNav.jsx`**:
- Already clean. Upgrade active tab indicator from `text-emerald-400` to include a `bg-emerald-500/10 rounded-lg` pill around the active tab icon.

*Effort: very small. Impact: immediate brand lift.*

---

### Priority 6 — Team Detail & Person Career

**`src/pages/TeamDetail.jsx`** and **`src/pages/PersonCareer.jsx`**:
- Add hero headers following the same pattern as OrgDetail (colour bar, identity swatch, name, region)
- Cards and sections upgrade to `rounded-2xl`

*Effort: small. Impact: medium — completion of the public surface.*

---

### Defer

- Full OrgDetail redesign with players section
- Scorer screen (`ScoreMatch.jsx`) — functional requirement, low design priority
- Admin pages — internal tool, last priority

---

## 10. What This Is Not

This design system does not introduce:
- Light mode or white card bodies (keep dark canvas)
- An icon library dependency (keep inline SVG)
- Animation library (keep CSS transitions only)
- New layout paradigms (keep the current page structure, upgrade details)
- New data dependencies on any page before Priority 3

The goal is **refinement of what exists**, not a rewrite. Every change should make the platform feel more like a sports destination and less like database software — by sharpening contrast, enlarging scores, upgrading match cards, and bringing manage pages into the same visual language as public pages.

---

*End of MatchPulse Design System v1.0*
