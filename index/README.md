# Sukoon — Digital Tasbih & Dhikr

## Project goal

Sukoon is a calm, browser-based Islamic tasbih counter designed primarily for mobile use while remaining comfortable on desktop. The project is intentionally static and private: it uses vanilla HTML, CSS, and JavaScript with browser `localStorage` only.

This repository contains **Phase 1 — Core Counter** and **Phase 2 — Dua & Dhikr Library**. The counter remains the primary interaction while the new collection extends the page into a calm reading and recitation space.

## Design

The hero counter is an **Islamic geometric ornament** — an 8-point star (rub el hizb) built from two interlocking SVG squares — that doubles as the tap target and the visual identity of the site:

- Large serif numeral in the centre of a layered glass star with a gold gradient trim
- A necklace of **99 prayer beads** circles the ornament and lights up in gold as the milestone progress fills
- Gentle breathing glow when idle, slowly rotating dashed halo, star-shaped ripple on every tap
- Deep emerald + antique gold + warm ivory palette, glassmorphism surfaces, and a faint **zellige mosaic** page background — octagon-and-square Moroccan tilework with a khatim star glazed into each octagon, tinted with the live theme and vignetted so it never competes with the counter
- Light and dark themes tuned for a calm, premium feel

## Completed features

- Large, accessible tap/click counter target shaped as the ornament
- Prayer-bead progress ring that fills toward the selected milestone
- Tap ripple, number tick, breathing idle, and milestone celebration animations
- Keyboard counting with **Space** or **Enter** when no dialog or control has focus
- Separate session and all-time counts
- Automatic persistence of counts and preferences in `localStorage`
- Confirmation dialog before resetting the current session
- Separate, explicit confirmation before clearing the all-time count
- Configurable milestones: 33, 99, or 100
- Configurable milestone behavior:
  - Keep counting
  - Loop the session count to zero
  - Stop at the milestone
- Milestone progress indicator (bead ring), visual celebration, and optional device vibration
- Light and dark appearances
- Responsive mobile-first layout
- Accessible status announcements, focus styles, semantic controls, and reduced-motion support
- Scroll-snapped compact counter that remains available while browsing, with symmetrical
  assisted and choreographed transitions in both directions
- Hero trace of the active dua or dhikr that confirms the choice survived and reopens the
  collection with it expanded
- Expandable, filterable dua and dhikr cards loaded from category JSON files
- Persistent active dhikr pinned flush beneath the compact counter at every scroll position
- Global translation and transliteration visibility settings
- Three selectable, self-hosted Arabic typefaces: Amiri, Scheherazade New, and Noto Naskh Arabic

## Scroll transitions

The counter and the collection are joined by two deliberate, symmetrical transitions
rather than native scroll snapping.

| | Trigger | Result |
| --- | --- | --- |
| Enter compact | Scroll down past 10% of the hero (clamped to 56–96px) | Eased scroll to the library's resting offset |
| Leave compact | Scroll up past the same threshold below the library's resting offset | Eased scroll back to the top of the hero |

The upward assist is intentionally as generous as the downward one. The library's resting
offset is the position where the collection's top edge meets the compact counter, so the
only thing below it is the inert hero spacer — travelling there while scrolling up can
only mean the visitor wants the full counter back, and no reading position can be lost.
Someone reading further down the collection must first scroll back to that offset, so a
single gesture never pulls them out of the text.

Both directions pair the eased `window.scrollTo` flight with dedicated CSS choreography:
the compact bar, ornament, library, and pinned recitation animate into reading mode and
receive matching reverse treatment when the full hero returns.

Both transitions drive `window.scrollTo`, which keeps emitting scroll events for the
duration of the eased flight. Each of those events lands at an intermediate offset that
reads as the opposite gesture, so a programmatic-scroll latch suspends compact-state
changes until the movement settles. Without it the two assists retrigger each other and
the page oscillates.

Every entry into compact mode lands at the library's resting offset. Returning to the
hero never records or restores an earlier reading depth, so scrolling down again always
behaves exactly like the first downward transition.

## Entry URIs

| Path | Parameters | Purpose |
| --- | --- | --- |
| `/index.html` | None | Main and only Phase 1 counter screen |
| `/` | None | Static-host equivalent of the main counter screen |

There are no API endpoints or server routes.

## Data model and storage

All data is stored in the visitor's browser under the `localStorage` key:

```text
sukoon-tasbih-v1
```

Stored object fields:

| Field | Type | Description |
| --- | --- | --- |
| `session` | number | Current session count |
| `lifetime` | number | All-time count, unaffected by a session reset |
| `milestone` | number | Selected target: 33, 99, or 100 |
| `behavior` | string | `keep`, `loop`, or `stop` |
| `theme` | string | `light` or `dark` |
| `vibration` | boolean | Whether supported devices vibrate at milestones |
| `stopped` | boolean | Whether stop-at-milestone is currently active |
| `showTransliteration` | boolean | Whether card transliterations are visible |
| `showTranslation` | boolean | Whether card translations are visible |
| `arabicFont` | string | Selected self-hosted Arabic typeface |
| `activeRecitationId` | string or null | The dua or dhikr pinned beneath the compact counter |

No backend, database, cookies, analytics, authentication, or network data storage is used. Arabic fonts are self-hosted; the Latin UI font stylesheet remains an optional external request with system fallbacks.

## Files

```text
index.html            Semantic counter, library, cards, and dialog markup
css/style.css         Responsive styling, compact mode, cards, and themes
js/main.js            Counter state, JSON loading, filters, settings, and interactions
data/index.json       Dua and dhikr category taxonomy plus content-file manifest
data/duas.json        Dua entries using the dedicated dua category IDs
data/dhikr.json       Dhikr entries using the dedicated dhikr category IDs
assets/fonts/*.woff2  Self-hosted Arabic typefaces
README.md             Project documentation
../tests/scroll_flow_test.py  Browser tests for the compact scroll transitions
../tools/gen_zellige.py   Regenerates the zellige background tile in style.css
```

### Regenerating the background tile

The zellige background is a generated SVG tile embedded in `css/style.css` as the
`--zellige` custom property. To change its geometry, edit `tools/gen_zellige.py`,
run `python3 tools/gen_zellige.py`, and paste the printed `--zellige:` line back
over the existing one. The script also writes `tools/zellige.preview.svg` for a
quick look at a single tile.

## Run locally

Open `index.html` directly in a modern browser, or serve the folder with any static file server. No build step or package installation is required.

## Content schema

The browser first fetches `data/index.json`, which defines separate `dua` and `dhikr` category arrays and lists the content files to merge. Add a category by appending an `{ "id", "label", "description" }` object to the appropriate array, then use that ID on entries in `duas.json` or `dhikr.json`. Every recitation includes `id`, `type`, `arabic`, `transliteration`, `translation`, `source`, `category`, `recommendedCount`, and the future-ready nullable `audioUrl` field. The category carousel is generated entirely from this manifest, so no HTML or JavaScript changes are needed when the taxonomy grows.

Because the collection uses `fetch`, run the site through a static web server instead of opening `index.html` with a `file://` URL.

## Not yet implemented

- Audio recitation playback (the schema already reserves `audioUrl`)
- Favorites and saved collections
- Cloud sync, accounts, or cross-device synchronization

## Recommended next steps

1. Validate Phase 1 on physical iOS and Android devices, especially vibration behavior and safe-area spacing.
2. Review and expand the sample dua and dhikr content with a qualified source.
3. Add optional recitation audio and favorites in a later phase without changing the current content schema.

## Public URLs

- Production website: Not published yet
- API endpoints: None
