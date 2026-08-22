# Pinnacle Management Ventures - Brand Book

The brand as the code actually implements it. Every colour, size, and usage
rule below is read out of the file that renders it: the palette from
`tailwind.config.js`, the faces from the Google Fonts link in `index.html`, and
each logo's "used by" line from a search of this repository.

`tests/brandBook.test.ts` pins the hex values here to `tailwind.config.js`, so
changing a brand colour in one place without the other fails CI. That is the
point of keeping this file in the repo rather than only in a folder somewhere.

---

## The mark

One crest, recoloured for the surface it sits on. It is the same drawing every
time: a five-point crown over a shield, a mountain roundel inside, flourishes
beneath.

**The single rule that matters:** the navy version goes on light surfaces, the
gold version goes on dark ones. Putting navy on navy is the one mistake that
makes the mark disappear, and it is the reason two versions exist at all.

---

## Logos in this kit

### For light backgrounds

| File | Size | Background | Where the site uses it |
|---|---|---|---|
| `public/logo-crest-transparent.png` | 1568 x 1568 | transparent | The primary mark. Site header and auth pages in light mode, and the audit certificate PDF. |
| `public/logo-crest.png` | 1568 x 1568 | **solid white, no transparency** | Generated PDFs: vendor application records, report exports, service applications. |

Reach for the transparent one unless you specifically need a white block behind
the mark. The white-background file has no alpha channel at all, so it will
show as a white square on any colour other than white.

### For dark backgrounds

| File | Size | Background | Where the site uses it |
|---|---|---|---|
| `public/logo-crest-on-dark.png` | 815 x 1049 | transparent | Every dark surface: HQ, the client portal, dark-mode public pages, and the social sharing image. |

Gold crown, shield, and flourishes; the mountain roundel stays blue.

### Email and print

| File | Size | Notes |
|---|---|---|
| `public/logo-crest-letterhead.png` | 146 x 188 | Small file for email. Renders at **73 x 94** in the letterhead and in staff email signatures; it is embedded in the message rather than hotlinked so it survives image blocking. |

### App icons

| File | Size | Used for |
|---|---|---|
| `public/favicon.ico` | multi | Browser tab, legacy path |
| `public/favicon.png` | 64 x 64 | Browser tab, modern path |
| `public/apple-touch-icon.png` | 180 x 180 | iOS home screen |

### Present but unused

| File | Size | Notes |
|---|---|---|
| `public/logo-crest-white-gold.png` | 783 x 1017 | A pale cream-and-gold outline treatment. **Nothing in the site currently references this file.** It is here because it exists in the project, not because it is in service. Very low contrast: it needs a dark ground, and works better as a watermark than as a logo. |

---

## Colour

Straight out of `tailwind.config.js`.

### Core

| Name | Hex | Role |
|---|---|---|
| Navy | `#0B1F3A` | The brand colour |
| Navy 700 | `#132B4D` | Raised surfaces, gradient top |
| Navy 800 | `#0E2340` | Panels |
| Navy 900 | `#081525` | Page ground, gradient middle |
| Navy 950 | `#050E19` | Deepest ground, gradient base |
| Navy 100 | `#C9D8EC` | Light tint |
| Navy 50 | `#EAF0F7` | Lightest tint |
| Gold | `#C9A227` | The accent. Primary buttons, active nav, focus rings |
| Gold 300 | `#E3CC7A` | Light gold |
| Gold 400 | `#D9B84A` | Hover state |
| Gold 600 | `#A9861B` | Pressed state |

### Secondary

Used sparingly, so the site gains warmth without losing the navy-and-gold core.

| Name | Hex | Role |
|---|---|---|
| Sea | `#2FA39B` | Reads clean and fresh; carries the cleaning line |
| Sea 300 / 400 / 600 / 700 | `#7FD3CB` / `#46BDB2` / `#1F857E` / `#166B65` | |
| Coral | `#E8765A` | Warms the navy |
| Coral 300 / 400 / 600 / 700 | `#F4A892` / `#F0906F` / `#C85A42` / `#A24631` | |
| Sand | `#EFE7D6` | Paper-toned neutral |
| Sand 100 / 300 / 500 | `#F6F1E6` / `#E3D6BC` / `#CDB98F` | |

### The signature gradient

```css
radial-gradient(120% 120% at 50% 0%, #132B4D 0%, #081525 55%, #050E19 100%)
```

Light falls from the top. This is the dark ground behind most of the site.

### Glass shadow

```css
box-shadow: 0 8px 32px rgba(5, 14, 25, 0.35);
```

---

## Type

Both faces load from Google Fonts.

| Role | Face | Weights loaded | Used for |
|---|---|---|---|
| Display | **Manrope** | 500, 600, 700, 800 | Headlines, the wordmark, anything that carries the voice |
| Body | **DM Sans** | 400, 500, 600, 700 | Everything else |
| Serif fallback | Georgia, Times New Roman, Times | - | Documents and letterhead |

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
```

### The wordmark

Two lines, set in the display face, locked up to the right of the crest:

- **PINNACLE** - Manrope 600, 15px, letter-spacing `.03em`, white
- **Management Ventures** - 9px, uppercase, letter-spacing `.16em`, gold 400

Note the case difference: the top line is set in caps as typed; the second is
lowercase text transformed to uppercase with wide tracking. Keep both.

---

## Voice

Drawn from the content rules the site is actually built against.

**Do**

- Say what will happen and who does it
- Name things the way a client would recognise them
- Active voice; a control says exactly what it does
- Errors explain what went wrong and how to fix it

**Never**

- Claim any provider is licensed, insured, vetted, bonded, background-checked,
  or government-approved unless that specific claim is documented
- Call an independent provider or vendor a Pinnacle employee
- Invent prices, dates, policies, deadlines, service areas, or availability
- Promise a guaranteed outcome
- Manufacture urgency
- Use emoji

---

## Firm details

| | |
|---|---|
| Legal name | Pinnacle Management Ventures |
| Phone | (561) 388-7879 |
| Public site | https://www.pinnaclemanagementventures.com |
| Booking link | https://pinnaclemanagementventures.com/book |
| Client portal | https://client.pinnaclemanagementventures.com |
| HQ | https://hq.pinnaclemanagementventures.com |

---

## Clear space and minimum size

The crest is a detailed drawing - a crown with five finials, a roundel, and
fine flourishes. Two practical limits:

- **Clear space:** leave at least the height of the crown on all four sides.
- **Minimum size:** below roughly 40px tall the flourishes and the mountain
  roundel stop resolving. Under that, use the app icon instead of the crest.

These are guidance drawn from how the artwork behaves at size, not measurements
recorded anywhere in the original design.

---

## The distributable kit

A zipped folder of these same assets, sorted by the background each belongs on
and paired with a visual version of this document, can be rebuilt from `public/`
at any time. It is not committed: the logos already live in `public/`, and a
second copy in the repository would be one more thing to keep in sync.
