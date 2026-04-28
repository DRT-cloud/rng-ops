# Twilight Biathlon — Brand Style Guide

> **Usage:** Reference this file when creating documents, HTML emails, presentations, and web assets. Attach `favicon.svg` as the canonical logo source when embedding the logo.

---

## Logo

- **Mark:** Bold white **T** with a night-vision–green reticle ring and center dot, on dark background `#0A0B0D`.
- **Canonical file:** `favicon.svg` (scalable, use for all embed contexts)
- **Raster pack:** `favicon-16.png`, `favicon-32.png`, `favicon.ico`, `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`

**Usage rules:**
- Always place on a dark background. If document background is light, wrap the logo in a dark `#0A0B0D` block.
- Do not invert the logo colors.
- Do not add drop shadows, strokes, or effects.
- Minimum size: 32 px for screen, 0.375 in for print.

---

## Colors

| Role | Name | Hex | CSS Token |
|---|---|---|---|
| Page background | Core Dark | `#0A0B0D` | `--tb-bg` |
| Primary accent | NV Green | `#00E474` | `--tb-accent` |
| Body text (dark bg) | White | `#FFFFFF` | `--tb-fg` |
| Body text (light bg) | Near Black | `#151515` | `--tb-fg-on-light` |
| Muted / secondary text | Gray 400 | `#9CA3AF` | `--tb-muted` |
| Card / panel surface | Dark Gray | `#111318` | `--tb-surface` |
| Borders / hairlines | Dark Border | `#1F2933` | `--tb-border` |
| Hover / active button fill | NV Green | `#00E474` | *(same as accent)* |

---

## Typography

| Role | Family | Weights | Fallback stack |
|---|---|---|---|
| Display / Headings | Barlow Condensed | 400, 600, 700 (500 for print titles) | Arial Narrow, Arial, sans-serif |
| Body / UI | Inter | 400, 500, 600 | system-ui, -apple-system, Arial, sans-serif |
| Code / Tags / Labels | JetBrains Mono | 400, 600 | ui-monospace, Menlo, Consolas, monospace |

**Google Fonts CDN link (for HTML):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
```

**Heading style conventions:**
- H1–H3: Barlow Condensed, `uppercase`, `letter-spacing: 0.03–0.08em`
- Body: Inter, normal case, comfortable line height (`1.5–1.65`)
- Technical tags / section IDs: JetBrains Mono, all-caps or small-caps

---

## CSS Tokens & Base Styles

```css
:root {
  --tb-bg:           #0A0B0D;
  --tb-accent:       #00E474;
  --tb-fg:           #FFFFFF;
  --tb-fg-on-light:  #151515;
  --tb-muted:        #9CA3AF;
  --tb-surface:      #111318;
  --tb-border:       #1F2933;

  --tb-font-display: 'Barlow Condensed', Arial Narrow, Arial, sans-serif;
  --tb-font-body:    'Inter', system-ui, -apple-system, Arial, sans-serif;
  --tb-font-mono:    'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
}

body {
  margin: 0;
  background: var(--tb-bg);
  color: var(--tb-fg);
  font-family: var(--tb-font-body);
  font-size: 16px;
  line-height: 1.6;
}

h1, h2, h3, h4 {
  font-family: var(--tb-font-display);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 0;
}

code, pre, .tag {
  font-family: var(--tb-font-mono);
}

a {
  color: var(--tb-accent);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}
```

---

## Components

### Button / CTA

```css
.btn {
  display: inline-block;
  padding: 0.5rem 1.4rem;
  border-radius: 9999px;          /* pill */
  border: 1px solid var(--tb-accent);
  color: var(--tb-fg);
  background: transparent;
  font-family: var(--tb-font-body);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.btn:hover {
  background: var(--tb-accent);
  color: #000000;
}
```

### Card / Panel

```css
.card {
  background: var(--tb-surface);
  border: 1px solid var(--tb-border);
  border-radius: 0.5rem;
  padding: 1.5rem 2rem;
}
.card h3 {
  font-family: var(--tb-font-display);
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tb-fg);
  margin-bottom: 0.5rem;
}
```

### Header Bar

```css
.site-header {
  background: var(--tb-bg);
  border-bottom: 1px solid var(--tb-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 2rem;
}
.site-header .logo {
  height: 36px;
  width: auto;
}
.site-header nav a {
  color: var(--tb-fg);
  font-family: var(--tb-font-body);
  font-size: 0.875rem;
  font-weight: 500;
  margin-left: 1.5rem;
}
.site-header nav a:hover {
  color: var(--tb-accent);
}
```

---

## HTML Email Template Shell

> Use inline styles only — most email clients strip `<style>` blocks.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Twilight Biathlon</title>
</head>
<body style="margin:0; padding:0; background:#0A0B0D; color:#FFFFFF; font-family:Arial, sans-serif;">

  <!-- Wrapper -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0A0B0D">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Content block (600px) -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0"
               style="max-width:600px; width:100%;">

          <!-- Header with logo -->
          <tr>
            <td style="padding:0 0 24px; border-bottom:1px solid #1F2933;">
              <!-- Replace src with inline base64 or hosted URL -->
              <img src="favicon.svg" alt="Twilight Biathlon" width="40" height="40"
                   style="display:block;">
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:32px 0 24px;">
              <h1 style="margin:0 0 8px; font-family:'Barlow Condensed', Arial Narrow, Arial, sans-serif;
                          font-size:2rem; font-weight:700; text-transform:uppercase;
                          letter-spacing:0.06em; color:#FFFFFF;">
                Twilight Biathlon
              </h1>
              <p style="margin:0; font-size:15px; line-height:1.6; color:#9CA3AF;">
                The original nighttime run-and-gun biathlon in Pawnee, Oklahoma.
              </p>
            </td>
          </tr>

          <!-- Body copy slot -->
          <tr>
            <td style="padding:0 0 24px; font-size:15px; line-height:1.65; color:#FFFFFF;">
              <!-- Insert body content here -->
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="padding:0 0 32px;">
              <a href="https://twilightbiathlon.com/register"
                 style="display:inline-block; padding:10px 24px; border-radius:9999px;
                         border:1px solid #00E474; color:#FFFFFF; font-family:Arial, sans-serif;
                         font-size:14px; font-weight:600; text-decoration:none;">
                Register Now
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0; border-top:1px solid #1F2933;
                        font-size:12px; color:#9CA3AF; line-height:1.5;">
              Twilight Biathlon · Pawnee, Oklahoma ·
              <a href="https://twilightbiathlon.com" style="color:#00E474; text-decoration:none;">
                twilightbiathlon.com
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
```

---

## Presentation Slide Conventions

| Slide type | Background | Heading font | Body font | Accent use |
|---|---|---|---|---|
| Title / cover | `#0A0B0D` full bleed | Barlow Condensed 700, white, uppercase | Inter 400, `#9CA3AF` | `#00E474` rule/line under title |
| Section divider | `#0A0B0D` | Barlow Condensed 600, white | — | `#00E474` large rule |
| Content slide | `#0A0B0D` or white | Barlow Condensed 600, white / `#151515` | Inter 400 | `#00E474` bullets, icons, callouts |
| Table / data slide | White, dark header row | Inter 600 (header) | Inter 400 | `#00E474` header row background |

**Logo placement:** Top-left corner, 32–40 px tall, every slide.

---

## Tagline

> **Run the Dark. Shoot the Dark.**

- All-caps optional for display use.
- Do not alter or paraphrase for branded materials.

---

## Site References

- Production: [https://twilightbiathlon.com](https://twilightbiathlon.com)
- Facebook: [https://www.facebook.com/profile.php?id=61572093187778](https://www.facebook.com/profile.php?id=61572093187778)
