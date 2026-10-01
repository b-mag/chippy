# Future work

Ideas parked so the tracker stays a common-denominator Order → Patterns editor across chips. Ship chip modes and shared columns first; LSDJ-specific hierarchy and flash-cart formats come later.

## Mobile web tracker

Make Chippy work well in a phone browser (LSDJ-on-Game-Boy energy on the device you already carry):

- Touch-sized targets and portrait-friendly layout
- No hover-only controls
- Web Audio unlock on a user gesture
- Safe-area / viewport handling
- Acceptable performance on mid-range phones

## LSDJ depth (UI deferred)

Chains, tables, and grooves are LSDJ-flavored, not the shared tracker model. Keep flat Song Order + 16-row patterns for every chip.

When wanted later:

- Optional Chains UI (order → chains → phrases)
- Tables / instrument macros
- Grooves (swing / timing patterns)

## LSDJ `.SAV` / `.lsdsng`

Exporter that maps Chippy’s flat Song Order + patterns into LSDJ’s chain/phrase layout **synthetically** (for example one chain per channel whose phrase list mirrors Song Order). No Chains editor required for export. Import after export is proven.

## More chips and tools

- Dedicated YM Player (full-file listen beyond snip)
- Deeper NES (DMC channel, NES VGM export)
- Deeper SID (6581 vs 8580, accurate filter, `.sid` dump, C64 snip)

## Chippy-owned YM Radio

Submit → approve → rotation, thumbs up/down, own streaming library. The Radio tab today only plays third-party streams.

## Real donor sign-in

Replace auth stubs so donors get ad-free sessions and premium presets without `presets.unlockAll`.

## Tracker consistency wins (ahead of Chains)

Shipped: richer shared FX (`U` / `C` / `P`), Radio reconnect, CORS-gated viz, Rainwave now-playing.

Still open:

- More chip-specific FX beyond the shared column
- Additional station HTTPS mirrors / now-playing APIs beyond Rainwave
