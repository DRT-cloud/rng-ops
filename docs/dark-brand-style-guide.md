# Dark Industrial Brand Style Guide

A reusable dark-mode brand framework built for precision-focused, industrial-grade brands. Drop in your brand name, logo, and primary accent colors — the structure and rules remain consistent.

---

## Color Palette

### Structural (Background & Surface) Tones

| Role | Name | Hex | Usage |
|---|---|---|---|
| Deep Background | Forge Black | `#0F1114` | Page/app background, email base, outermost shell |
| Surface / Card | Charcoal Steel | `#1C2128` | Cards, panels, sidebars, section backgrounds |
| Elevated Surface | Gunmetal | `#2E3440` | Modals, dropdowns, table rows, hover states |
| Border / Divider | Steel Gray | `#4A5568` | Horizontal rules, input borders, subtle separators |

### Text Tones

| Role | Name | Hex | Usage |
|---|---|---|---|
| Primary Text | Crisp White | `#F4F5F7` | Headlines, logo rendering, high-contrast labels |
| Body Text | Vapor | `#B0BAC9` | Paragraph copy, descriptions — softer than pure white |
| Muted / Caption | Steel Gray | `#4A5568` | Captions, footnotes, placeholders, timestamps |

> **Rule:** Never use pure `#000000` as a background. Forge Black (`#0F1114`) reads as black but avoids the harsh flatness of true black, especially on OLED/AMOLED displays.

---

## Brand Accent Colors

These are the identity-defining colors. Replace with your brand's equivalents — the roles and usage rules stay the same.

| Role | Name | Hex | Semantic Use |
|---|---|---|---|
| Primary Action | Brand Red | `#CC2229` | CTA buttons, active nav states, accent underlines, alerts |
| Secondary Accent | Brand Blue | `#2358A6` | Links, icon fills, table headers, informational callouts |
| Warning / Notice | Safety Yellow | `#F5C518` | Alert banners, caution callouts — use sparingly (≤10% surface) |

### Accent Color Rules

- **Red = Action.** All calls-to-action, primary buttons, and interactive triggers use the primary action color.
- **Blue = Information.** Links, data labels, icons, and secondary navigational elements use the secondary accent.
- **Yellow = Warning.** Reserve for genuine alerts or safety-related callouts only. Not decorative.
- On hover/active states, darken the primary action color by ~15% (e.g., `#CC2229` → `#A81B21`).

---

## Surface Layering System

Three levels of depth — no gradients needed. Each layer sits one step lighter than the one below it.

```
Level 0 — Shell:       Forge Black  #0F1114   (outermost, page bg)
Level 1 — Container:   Charcoal     #1C2128   (cards, panels)
Level 2 — Elevated:    Gunmetal     #2E3440   (modals, dropdowns)
```

Apply this consistently across web, app, and document layouts to create visual hierarchy without decorative flourishes.

---

## Typography

### Typeface

Use a modern, geometric or humanist **sans-serif** (e.g., Inter, DM Sans, Barlow, Source Sans Pro). Condensed variants work well for industrial display headlines.

### Weight & Color by Role

| Role | Weight | Color |
|---|---|---|
| Display / Hero Headline | ExtraBold / Black (800–900) | Crisp White `#F4F5F7` |
| Section Heading (H2/H3) | Bold (700) | Crisp White `#F4F5F7` |
| Subheading / Label | SemiBold (600) | Vapor `#B0BAC9` |
| Body Copy | Regular (400) | Vapor `#B0BAC9` |
| Caption / Footnote | Regular (400) | Steel Gray `#4A5568` |
| CTA Button Text | Bold (700) | Crisp White `#F4F5F7` |
| Hyperlink | Regular (400) | Brand Blue `#2358A6` |

### Sizing (Base 16px)

```
Display:   48–72px
H1:        36–48px
H2:        28–36px
H3:        20–24px
Body:      15–17px
Caption:   12–14px
```

---

## Component Patterns

### Buttons

```
Primary CTA:
  Background: Brand Red  #CC2229
  Text:       White      #F4F5F7
  Hover:      Darkened   #A81B21
  Border:     none
  Radius:     4px (sharp/industrial) or 6px (modern)

Secondary / Outline:
  Background: transparent
  Border:     1.5px solid Brand Blue  #2358A6
  Text:       Brand Blue  #2358A6
  Hover bg:   Brand Blue at 15% opacity

Ghost / Tertiary:
  Background: transparent
  Text:       Vapor  #B0BAC9
  Hover:      text → White, underline appears
```

### Cards

```
Background:  Charcoal Steel  #1C2128
Border:      1px solid Steel Gray  #4A5568  (optional)
Shadow:      0 2px 12px rgba(0,0,0,0.5)
Radius:      6–8px
Padding:     20–24px
```

### Navigation Bar

```
Background:      Forge Black  #0F1114
Logo:            White version
Nav links:       Vapor  #B0BAC9
Active link:     White + Brand Red bottom border (2px)
Hover link:      White
Border-bottom:   1px solid Steel Gray  #4A5568
```

### Tables

```
Header row bg:   Brand Blue  #2358A6  at 20% opacity, or Gunmetal  #2E3440
Header text:     White
Body row bg:     Charcoal Steel  #1C2128
Alternate row:   Gunmetal  #2E3440
Cell text:       Vapor  #B0BAC9
Border:          1px solid Steel Gray  #4A5568
```

### Dividers & Accent Bars

- Horizontal rule: `1px solid #4A5568`
- Section accent bar (decorative, under headline): `3px solid Brand Red #CC2229`, width ~48px
- Info block left border: `4px solid Brand Blue #2358A6`

### Callout / Alert Boxes

```
Info:     Left border Brand Blue + Gunmetal bg + Vapor text
Warning:  Left border Safety Yellow + Gunmetal bg + Vapor text
Error:    Left border Brand Red + Gunmetal bg + Vapor text
```

---

## Email Templates

### Structure

```
Header:     Forge Black background, white logo, red underline accent bar
Body:       Charcoal Steel background
Section:    Gunmetal cards for featured content blocks
Footer:     Forge Black, Vapor text, gray social icons
```

### Text Rules for Email

- Headlines: White `#F4F5F7`
- Body copy: Vapor `#B0BAC9` — do not use pure white on dark email backgrounds (increases visual fatigue)
- Links: Brand Blue `#2358A6`, underlined
- CTA Buttons: Red background, white bold text — inline-styled for email client compatibility

---

## Print & Marketing Materials

### Flyer / Brochure

- Background: Charcoal Steel (`#1C2128`) or Forge Black (`#0F1114`)
- Hero headline: White, condensed, large
- Subheadline: Vapor
- Accent rule: Brand Red or Brand Blue horizontal line
- CTA block: Brand Red full-width strip at bottom

### Documents (Technical / Proposals)

- Page background: Charcoal Steel `#1C2128` OR white (for print — invert text to dark)
- Cover page: Forge Black with white headline and red accent
- Section headers: Red accent bar + white bold label
- Body copy: Vapor `#B0BAC9` (dark bg) or `#2E3440` (white bg print)
- Tables: Gunmetal rows, blue headers (see table pattern above)

---

## Icon & Illustration Style

- Icon fill: Vapor `#B0BAC9` default; Brand Blue for informational; Brand Red for action/alert
- Line weight: medium (2px stroke) — heavier lines read better on dark backgrounds
- Style: Geometric, flat, or flat-with-depth — avoid soft pastel or watercolor styles
- Avoid drop shadows on icons; use color tinting instead

---

## Logo Placement Guidelines

- Always use the **white or light version** of the logo on dark backgrounds
- Never place a dark logo on Forge Black or Charcoal Steel
- Minimum clear space: equal to the cap-height of the wordmark on all sides
- Acceptable backgrounds: Forge Black, Charcoal Steel, Brand Red (white logo), Brand Blue (white logo)
- Avoid placing logo on Gunmetal unless contrast is tested and passes WCAG AA (4.5:1 ratio minimum)

---

## Accessibility

- All body text (Vapor on Charcoal Steel) achieves **WCAG AA** contrast minimum
- All headlines (White on Forge Black) achieve **WCAG AAA**
- CTA buttons (White on Brand Red `#CC2229`) pass WCAG AA — verify if you swap the red
- Test any new accent color at [https://webaim.org/resources/contrastchecker/](https://webaim.org/resources/contrastchecker/) before using it for text

---

## Quick-Reference Tokens

Copy-paste these as CSS custom properties, design tokens, or variables in any tool.

```css
/* === DARK INDUSTRIAL BRAND TOKENS === */

/* Backgrounds */
--color-bg-base:       #0F1114;
--color-bg-surface:    #1C2128;
--color-bg-elevated:   #2E3440;
--color-border:        #4A5568;

/* Text */
--color-text-primary:  #F4F5F7;
--color-text-body:     #B0BAC9;
--color-text-muted:    #4A5568;

/* Brand Accents — replace with your values */
--color-accent-primary:   #CC2229;   /* Action / CTA */
--color-accent-secondary: #2358A6;   /* Info / Links */
--color-accent-warning:   #F5C518;   /* Caution only */

/* Hover States */
--color-accent-primary-hover:   #A81B21;
--color-accent-secondary-hover: #1A4080;
```

---

## Applying to a New Brand

1. Replace `--color-accent-primary` and `--color-accent-secondary` with your brand's colors.
2. Drop in your logo (white/light version).
3. Choose your typeface — apply the weight/color roles above.
4. Keep all structural tones (`--color-bg-*`) unchanged unless your brand requires a warm vs. cool dark shift (e.g., `#14110F` for warm-dark, `#0D1117` for cool-dark).
5. Validate all text/background contrast pairs before finalizing.
