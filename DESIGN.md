---
name: Slow Down on Victory Lakes Loop
description: A resident-run petition site drawn as one sheet of the neighborhood plat.
colors:
  paper: "#f7f7f3"
  sheet: "#f7f7f3"
  field: "#fdfdfb"
  ink: "#102a56"
  ink-soft: "#3d4f6e"
  rule: "#1d3a6b"
  rule-soft: "#b9c3d0"
  lake: "#6f97b5"
  vermilion: "#cf3a2c"
  vermilion-ink: "#b3301f"
  vermilion-edge: "#8a2216"
  on-vermilion: "#ffffff"
  select: "#f3cfc8"
  paper-dark: "#0f1a27"
  sheet-dark: "#f2f2ec"
  field-dark: "#142233"
  ink-dark: "#e8eef6"
  ink-soft-dark: "#b4c2d4"
  rule-dark: "#a9bbd2"
  rule-soft-dark: "#33465d"
  vermilion-ink-dark: "#ff8f80"
  select-dark: "#5a2b28"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Barlow, Arial Narrow, sans-serif"
    fontSize: "clamp(2.1rem, 8.6vw, 3.4rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.005em"
  headline:
    fontFamily: "Barlow Semi Condensed, Barlow, Arial Narrow, sans-serif"
    fontSize: "clamp(1.45rem, 5.4vw, 1.9rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.005em"
  title:
    fontFamily: "Barlow Semi Condensed, Barlow, Arial Narrow, sans-serif"
    fontSize: "1.2rem"
    fontWeight: 600
    lineHeight: 1.1
  body:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  lead:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 400
    lineHeight: 1.55
  body-admin:
    fontFamily: "Barlow, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  field-label:
    fontFamily: "Barlow Semi Condensed, Barlow, Arial Narrow, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
    letterSpacing: "0.02em"
  button:
    fontFamily: "Barlow Semi Condensed, Barlow, Arial Narrow, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.06em"
  lettering:
    fontFamily: "Osifont, Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "0.07em"
  lettering-title:
    fontFamily: "Osifont, Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1.1rem"
    fontWeight: 400
    letterSpacing: "0.16em"
  action:
    fontFamily: "Osifont, Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "1.45rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.08em"
  tally:
    fontFamily: "Osifont, Barlow Semi Condensed, Arial Narrow, sans-serif"
    fontSize: "2.15rem"
    fontWeight: 400
    lineHeight: 1.15
    fontFeature: "tnum"
rounded:
  none: "0px"
  hairline: "2px"
  field: "4px"
  button: "6px"
  pill: "999px"
  circle: "50%"
spacing:
  space-1: "6px"
  space-2: "12px"
  space-3: "18px"
  space-4: "28px"
  space-5: "44px"
  space-6: "64px"
  tick: "9px"
  gutter: "16px"
components:
  button-primary:
    backgroundColor: "{colors.vermilion}"
    textColor: "{colors.on-vermilion}"
    typography: "{typography.action}"
    rounded: "{rounded.button}"
    padding: "10px 22px"
    height: "58px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "10px 22px"
    height: "48px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.vermilion-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "10px 22px"
    height: "48px"
  input-text:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "11px 14px"
    height: "50px"
  frame:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "28px clamp(16px, 5vw, 32px)"
  key-swatch:
    backgroundColor: "{colors.vermilion}"
    rounded: "{rounded.hairline}"
    width: "18px"
    height: "3px"
  note-number:
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    size: "36px"
  note-number-current:
    textColor: "{colors.vermilion-ink}"
    rounded: "{rounded.circle}"
    size: "36px"
  admin-nav-link:
    textColor: "{colors.ink}"
    padding: "12px 12px 10px"
    height: "44px"
  tag:
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "1px 8px"
---

# Design System: Slow Down on Victory Lakes Loop

## Overview

**Creative North Star: "The Subdivision Plat"**

The petition is about our own streets, so every page is a sheet of the neighborhood plat. The ground is cool drafting film with a faint paper grain; everything is drawn in navy pen; one vermilion pencil line marks the boundary, and that same colour marks the one thing to do. The site's parts are the sheet's parts: a title block for the headline, a legend for the count and the action, numbered sheet notes for the county process, a scale bar for progress. Nothing is a card, a hero or a badge.

Density is calm and generous on the public pages (17px body, 44px section gaps, a single reading column on phones) and tighter in the admin, which is the same sheet set for work. The world refuses the petition-platform template (photo hero, solid red progress bar, a row of equal cards) and refuses anything that could read as an official county, VDOT or HOA document: there are no seals, crests or agency logos, only the three-ripple lake mark.

Imagery is drawn, never photographed: the plat itself, two small pen illustrations (a school bus with walking children, a car with speed lines), and two texture plates (the film ground and the vermilion pencil shading). Every shipping raster carries its provenance prompt.

**Key Characteristics:**
- Drafting-film paper, navy pen linework, one vermilion boundary colour.
- Containers are pen-ruled frames: a double rule with crop ticks at the corners, never a rounded card.
- Three voices of type: engineering lettering (osifont) for the sheet's labels and the action, Barlow Semi Condensed for headings, Barlow for reading.
- Flat sheet; depth comes from pen weight, not shadow.
- Dark mode is a light sheet lying on a dark drafting table.
- Strict CSP shapes the craft: no inline styles or scripts; geometry lives in SVG attributes, colour in CSS.

## Colors

A cool, nearly monochrome navy-on-film palette with a single warm vermilion that does all the pointing.

### Primary
- **Boundary Vermilion** (#cf3a2c): the red-pencil boundary on the plat, the legend's key swatch, the hatched scale-bar fill and its leading edge, the primary action's base under the pencil texture, the focus ring, checked checkboxes and radios (`accent-color`), the active combobox option, the text caret, the link-hover underline, and the "we are here" marker. It stays the same value in both schemes.
- **Vermilion Ink** (#b3301f; #ff8f80 on the dark table): vermilion as text or as a thin line that must read at text contrast. Error messages, the error summary, invalid field borders, the danger button, the "We are here:" step prefix and the current step number, admin warnings. 5.8:1 on paper, 7.9:1 on the dark table.
- **Pencil Edge** (#8a2216): the inked border round the primary action, so the pencil-shaded block has a drawn edge.
- **On Vermilion** (#ffffff): text on the primary action. The pencil texture's lightest pixel is the base vermilion, so white text holds at least 4.89:1.
- **Red Pencil Selection** (#f3cfc8; #5a2b28 dark): `::selection` only.

### Secondary
- **Lake Hatch Blue** (#6f97b5): the fine horizontal hatching of the lake inside the plat raster. In CSS it appears only as low-strength tints in the admin (14% under a success flash, 8% under a hovered table row). It never carries text or an action.

### Neutral
- **Drafting Film** (#f7f7f3): the page ground, tiled with the film texture at 101 × 58px. The header shares it. In dark mode the ground becomes **Drafting Table** (#0f1a27) and the texture is dropped.
- **Sheet** (#f7f7f3; #f2f2ec in dark): the plat's own sheet. In dark mode it stays light, so the drawing keeps its paper.
- **Field White** (#fdfdfb; #142233 dark): input and listbox fills, a half-step brighter than the film so fields read as blanks to fill in.
- **Navy Pen Ink** (#102a56; #e8eef6 dark): all text, icons and pen-drawn rasters. 13.1:1 on the film.
- **Faded Ink** (#3d4f6e; #b4c2d4 dark): secondary text: hints, captions, sheet-note body, the legend key, fine print. 7.7:1 on the film.
- **Pen Rule** (#1d3a6b; #a9bbd2 dark): every structural line: frames, header and footer rules, control borders, the scale track, the goal tick.
- **Soft Rule** (#b9c3d0; #33465d dark): the inner line of a double rule, dashed separators, table row lines, admin chips. Decorative contrast only; never the only edge of a control.

### Named Rules
**The One Boundary Rule.** Vermilion is the boundary line, and only things that belong to the boundary or call for a hand may wear it: the boundary and its key swatch, the scale fill, the one primary action, the "we are here" marker, focus and errors. Checked controls, the active option, the caret and the link-hover underline echo it at hairline weight. Never use it for a heading, a background, an icon, a decorative line or a second accent.

**The Navy Pen Rule.** Every line, letter and icon is drawn in the one navy ink (or its light-ink counterpart in dark mode). No greys, no black, no second ink colour. The county print view is the one exception.

**The Light Sheet Rule.** In dark mode the page becomes a dark drafting table, but the plat keeps its light sheet: 12px of sheet margin, 3px corners, and a soft drop shadow beneath it. Pen-drawn rasters swap to their light-ink variants through `<picture>` sources keyed on `prefers-color-scheme`. The plat's caption keeps the light sheet's faded ink.

## Typography

**Display Font:** Barlow Semi Condensed 600 (with Barlow, Arial Narrow)
**Body Font:** Barlow 400 and 600 (with system-ui, -apple-system, Segoe UI)
**Label Font:** osifont, ISO 3098 engineering lettering, subset to Latin (with Barlow Semi Condensed, Arial Narrow)

**Character:** A confident, slightly narrow grotesk carries headings the way a plat's title is set, Barlow reads plainly at an 8th-grade register, and osifont is the draftsman's hand lettering on the sheet. All four files are self-hosted WOFF2 under the SIL OFL (Barlow) and LGPL-3.0 with font exception (osifont); licences ship in `public/fonts/LICENSE.txt`.

### Hierarchy
- **Display** (600, clamp(2.1rem, 8.6vw, 3.4rem), 1.1): the page H1, balanced wrapping. In the title block it is centred.
- **Headline** (600, clamp(1.45rem, 5.4vw, 1.9rem), 1.1): section H2s, usually as a ruled heading with a 1.5px pen rule beneath.
- **Title** (600, 1.2rem; 1.25rem in the reasons list): H3s.
- **Body** (400, 1.0625rem / 17px, 1.55): all reading text. Long prose caps at 68ch; the title block's subline caps at 34ch.
- **Lead** (400, 1.15rem): the subline under a page title.
- **Field label** (Barlow Semi Condensed 600, 1.15rem, 0.02em): form labels and legends. Optional markers drop back to Barlow in faded ink.
- **Button** (Barlow Semi Condensed 600, 1.1rem, 0.06em, uppercase): secondary buttons.
- **Lettering** (osifont 400, 1.1rem, 0.07em, uppercase): the two-line site name in the header. The header's "Sign" link is osifont at 1.25rem, sentence case.
- **Lettering title** (osifont 400, 1.1rem, 0.16em, uppercase, underlined 1.5px at 5px offset): the LEGEND title. Sheet-note titles use the same voice at 1.15rem and 0.05em.
- **Action** (osifont 400, 1.45rem, 0.08em, uppercase, 0.45px text stroke): the primary action only.
- **Tally** (osifont 400, 2.15rem; 1.85rem on phones, tabular figures, 0.4px text stroke): the household count in the legend. The scale bar's labels are osifont inside the SVG.

osifont has one weight; where it must hold its own against Barlow 600 it is thickened with a hairline `-webkit-text-stroke` in the current colour, never with a faux bold.

### Named Rules
**The Lettering Rule.** osifont is the sheet's hand: it sets the site name, the legend, key and sheet-note titles, the tally, the scale labels, the plat caption and the primary action. Nothing else. Headings are Barlow Semi Condensed 600; reading text, form inputs and labels' helper text are Barlow.

**The Floor Rule.** Reading text is never smaller than 16px; the body is 17px. Lettering that has to be read (captions, keys, fine print) obeys the same floor.

## Layout

A centred sheet with a 16px gutter that grows to the device safe area. The public container is 1180px; reading and form pages narrow to 760px; the admin widens to 1320px. Spacing follows a six-step scale (6, 12, 18, 28, 44, 64px). Frames sit 9px inside their column so their crop ticks never touch the gutter.

- **Phones (below 640px)** are the primary layout: one column. The header compresses to 52px with the ripple mark, the lettered name centred and "Sign" right. The plat runs full width, then the title block, then the legend.
- **Very narrow (below 380px):** the legend's key column stacks above the tally with a pen rule between them, and the primary action tightens its lettering (1.2rem, 0.05em).
- **640px and up:** the header becomes a three-part bar 76px tall. The lower sections pair into two columns; the process and the "talk it over" sections span both.
- **960px and up:** the lead becomes the plat (left, 1.12fr) beside the title block and legend stacked (right, 0.88fr), with a 44px gap. The sheet notes turn into a four-column strip divided by vertical rules.

Lower sections stack with 44px gaps. Tap targets are at least 44px tall everywhere on the public site, including footer links and radio and checkbox rows.

### Named Rules
**The First Sheet Rule.** On a phone the plat, its caption, the title block, the legend and the primary action all land inside the first 844px. Anything added above the legend must earn its height against that line.

**The Weight Budget Rule.** A public page weighs under 150KB, not counting Turnstile. The four fonts (about 75KB) and the plat (17KB at 420w, 40KB at 840w) are most of that already; a new raster has to be palette-quantized to fit.

## Elevation & Depth

The system is flat. A sheet of drafting film has no z-axis, so depth is carried by pen weight and line type, and almost nothing casts a shadow. Line weights are a hierarchy: 2px rules close the page (header bottom, footer top); 1.5px pen rules draw frames, controls and ruled headings; 1px soft rules sit inside double rules and between rows; dashed soft rules separate list items and outline notices and filters. Hover on secondary buttons is an 8% navy tint, not a lift.

### Shadow Vocabulary
- **Popup** (`box-shadow: 0 10px 24px -12px rgb(16 42 86 / 0.45)`; `rgb(0 0 0 / 0.8)` in dark): the address combobox's listbox, which genuinely floats over the form.
- **Sheet on the table** (`box-shadow: 0 18px 40px -22px rgb(0 0 0 / 0.8)`, dark mode only): the plat's light sheet lying on the dark drafting table.

### Named Rules
**The Pen-Weight Rule.** Depth is drawn, not cast: 2px closes the page, 1.5px draws a part, 1px or dashed divides inside it. A shadow is allowed only on something that physically lifts off the sheet.

## Shapes

Frames and sheets are square: drafted rectangles with no radius. The signature form is the double rule: a 1.5px pen rule with a 1px soft rule inset 4px inside it. Full frames add crop ticks: their outer lines are extended 9px past every corner, so each corner reads as a drafting crossing. Controls carry a slight radius so they read as things to press: 4px on fields and the listbox, 6px on buttons, 2px on the focus ring and the key swatch. Circles mark numbered or completed items: sheet-note numbers (36px) and the check on the thank-you page (52px). Pills appear only in the admin, for status tags and the mode badge.

### Named Rules
**The Crop Tick Rule.** Only the important parts of a sheet get the full double rule with crop ticks: the title block, the legend, the first lower section, the petition statement and the signing form. Later sections open with a top double rule alone so the page can breathe. Content pages (FAQ, privacy, thanks, withdraw) use the double rule without ticks.

## Components

### Site header
Pen-drawn and quiet. The three-ripple lake mark (an authored SVG, 2.2 stroke) links home on the left; the site name is lettered in two centred lines; an underlined osifont "Sign" link sits on the right and is replaced by an empty spacer on the signing page itself. A 2px pen rule closes the header. The film texture continues behind it.

### Plat figure
The plat is the hero and it is an illustration, never a map of record. It is a palette-quantized PNG (420w and 840w) drawn in navy pen with blue lake hatching, a north arrow, and one red-pencil boundary. The only lettering on it is VICTORY LAKES LOOP along the road; side streets and the lake are unlabelled. Its caption always reads "Illustration only. The county sets the real petition area." in centred osifont, faded ink.

### Title block
A full frame holding the H1 and one line of lead text, centred. One word may take a "pencil" underline (2px navy, 4px offset) for emphasis; it is never italic and never vermilion.

### Legend (signature component)
The site's progress and action live in the plat's legend, a full frame:
- **Top row:** a key column (LEGEND title, then the 18 × 3px vermilion swatch beside "STUDY AREA (illustration)") divided by a vertical 1.5px pen rule from the tally ("40 of 173", then "households pledged · Goal 75%").
- **Scale bar:** an inline SVG (viewBox 1000 × 104) with an outlined track (3-unit pen rule over a 20% sheet fill), a vermilion hatch fill (10-unit bars on a 22-unit pattern rotated −55°) up to the current share, a 3-unit vermilion edge line, a 2.5-unit pen goal tick, and osifont labels (0%, 50%, the goal, 100%; the middle and end labels hide on phones). Geometry is set in SVG attributes and colour comes from CSS classes. The fill draws in from the left once (1100ms, expo-out, 200ms delay).
- **Action:** the full-width primary button, then "About 2 minutes. One per household." centred, a status line ("23.1% so far. 90 more households to reach 75%."), and the fine print that pledges do not count toward the county's threshold.
- Before the county sets the area, the tally and the scale bar give way to one line saying progress will appear later. Names are never shown.

### Buttons
- **Shape:** gently rounded corners (6px) on a 1.5px pen-rule border.
- **Primary:** Boundary Vermilion under a 128px tile of red-pencil shading, a Pencil Edge border, white osifont lettering with an arrow icon, 58px tall. It is the only filled button on a public page, and every public instance carries the same signing action. Hover darkens it slightly (brightness 0.93) and nudges the arrow 4px right over 200ms; press drops it 1px.
- **Secondary:** transparent with navy text in Barlow Semi Condensed 600 uppercase, 48px tall, 10px × 22px padding. Hover lays an 8% navy tint; press drops 1px; transitions run at 160ms.
- **Danger:** the secondary shape in Vermilion Ink, for withdrawing a signature on the public withdraw page and rejecting one in the admin.
- **Block:** full width, used in the legend and at the foot of the signing form.
- **Disabled:** 50% opacity with a not-allowed cursor.

### Frames and sheets (Cards / Containers)
- **Corner Style:** square (0px).
- **Background:** transparent; the film shows through.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** the double rule, plus crop ticks on full frames, or a top double rule only on open sections.
- **Internal Padding:** 28px block and clamp(16px, 5vw, 32px) inline; 14px all round on phones.

### Sheet notes
The county process is an ordered list drawn as the plat's numbered notes: a 1.5px pen-rule box with 1px pen rules between items, each with a 36px circled osifont number, an uppercase osifont title and faded-ink body text. The current step's circle turns into a 2px vermilion ring with a Vermilion Ink numeral, and its title is prefixed "We are here:" in Vermilion Ink. It carries `aria-current="step"`. At 960px and up the notes become a four-column strip.

### Reasons list
Each reason pairs a 76px pen-drawn raster (school bus with children, car with speed lines) with an H3 and faded-ink text, separated by 1.5px dashed soft rules.

### Inputs / Fields
- **Style:** Field White blanks with a 1.5px pen-rule border and 4px corners, 50px tall, 11px × 14px padding, 17px text. Each label sits above its field in Barlow Semi Condensed; any hint sits between them in faded ink. Selects draw their chevron with two CSS gradients.
- **Focus:** a 3px vermilion outline at 1px offset (#ff8f80 on the dark table). Everything else focusable takes the same ring at 2px offset.
- **Checkboxes and radios:** 24px native controls tinted vermilion with `accent-color`, each on a label row at least 44px tall.
- **Error:** the field border goes to 2px Vermilion Ink, and a 600-weight message in Vermilion Ink (prefixed "Error:" for screen readers) sits above the control. On submit, an error summary (2px Vermilion Ink border, 6% vermilion wash) takes focus and links to each field.
- **Address combobox:** progressive enhancement of the server `<select>`. It becomes a text input with a listbox popup 4px below it (Field White, pen-rule border, 4px corners, 300px max height, Popup shadow). Options are at least 44px tall; the active option gets a 12% vermilion wash and a 1.5px vermilion inset outline. A live status line in faded ink announces results. Without JS the select works as is.
- **Notices:** a 1.5px dashed pen-rule box for the privacy summary and fallbacks.

### Navigation
- **Public:** the header carries the mark, the name and "Sign". The footer (2px top rule, 16px text) states that this is a resident-run site, not an official one, names the organizer, and lists Home, Questions and Privacy notice as underlined links at least 44px tall. Links are navy with a 1.5px underline at 3px offset; hover turns the underline vermilion.
- **Admin:** a horizontally scrollable strip under a 1px soft rule. Its links are in Barlow Semi Condensed, 44px tall, with a 3px bottom bar: transparent at rest, soft rule on hover, vermilion for the current page.

### Admin surfaces
The same sheet set for work: 16px body text, no film texture, a 1320px container. Dashboard cards are square 1.5px pen-rule boxes (auto-fit, 240px minimum). Their H2s are uppercase Barlow Semi Condensed headings and their big numbers are 2.6rem tabular. Warnings are a 2px Vermilion Ink panel. Tables sit in a pen-ruled scroll container with soft row rules, a 6% navy header wash, an 8% lake hover wash and tabular figures. Status tags are pills with 1px soft-rule borders that turn Vermilion Ink for rejected or flagged entries. Filters sit in a dashed soft-rule box. The admin reuses the legend's scale bar.

### County print view
This is deliberately not the plat world; it is the county's paper. US Letter portrait with 0.5in margins, Georgia 11pt in near-black, 1px dark-grey table rules, signature rows 0.42in tall, and the petition title and full wording repeated at the top of every page. On screen it previews as white sheets on a grey ground.

### Icons
Icons come from one authored set: line icons on a 24 grid with a 1.75 stroke, round caps and joins, drawn in `currentColor` and always `aria-hidden`. They are arrow right, arrow left, star, check and sort up/down, plus the ripple mark. Pen-drawn illustrations are rasters with embedded provenance, not icons.

## Do's and Don'ts

### Do:
- **Do** draw every container as a part of the sheet: a 1.5px pen rule with a 1px soft rule inset 4px, crop ticks 9px past the corners for the parts that matter, a top double rule alone for the rest.
- **Do** caption the plat, every time it appears, with "Illustration only. The county sets the real petition area."
- **Do** keep reading text at 16px or larger (body is 17px) and every target at least 44px tall (the primary action is 58px, fields 50px, secondary buttons 48px).
- **Do** set SVG geometry with attributes and all colour with CSS classes; the CSP allows no inline styles and no inline scripts.
- **Do** keep the plat on its light sheet in dark mode, and ship a light-ink `-dark` variant for every pen-drawn raster, swapped with a `<picture>` source.
- **Do** draw icons from the authored set (24 grid, 1.75 stroke, `currentColor`, `aria-hidden`), or add to it in the same hand.
- **Do** embed the generation or derivation prompt in every shipping raster and palette-quantize it before it ships.
- **Do** keep a public page under 150KB, not counting Turnstile.
- **Do** honour `prefers-reduced-motion` by turning off every animation and transition; the scale-bar draw-in is the only entrance motion.

### Don't:
- **Don't** use vermilion outside the One Boundary Rule: no vermilion headings, backgrounds, icons, decorative lines or second accent colour.
- **Don't** set body copy, headings or form labels in osifont; it is lettering for labels, the tally, the scale, the caption and the action only.
- **Don't** label anything on the plat except Victory Lakes Loop, invent street or lake names, or present the drawing as the real petition area.
- **Don't** put an eyebrow or kicker label above a heading. Lettered uppercase belongs to the sheet's own parts (site name, legend title, key, sheet-note titles, scale), which are the label, not a preface to one.
- **Don't** use Unicode glyphs (★, ✓, →, ▸) as icons.
- **Don't** add county, VDOT or HOA seals, logos or anything that looks like an official crest; the ripple mark is the only mark.
- **Don't** round frames or float them on shadows; only the combobox popup and the dark-mode plat sheet may cast one.
- **Don't** fall back to the petition-platform template: a photo hero, a solid red progress bar, a row of equal cards.
