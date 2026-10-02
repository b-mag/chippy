# Future work

Ideas parked so the tracker stays a common-denominator Order → Patterns editor across chips. Ship chip modes and shared columns first; deeper LSDJ hierarchy comes next.

## Mobile web tracker

Make Chippy work well in a phone browser (LSDJ-on-Game-Boy energy on the device you already carry):

- Touch-sized targets and portrait-friendly layout
- No hover-only controls
- Web Audio unlock on a user gesture
- Safe-area / viewport handling
- Acceptable performance on mid-range phones

## LSDJ gaps

Game Boy mode already ships **LSDJ phrase FX** and **`.sav` export** (synthetic chains from flat Song Order). The niche that cares most is people who already write on a physical Game Boy + flash cart and want Chippy as a second editor.

### Flagship follow-up: import `.sav` (Game Boy only)

Open an LSDJ `.sav` (work memory and, where present, file slots / projects) exclusively for Game Boy, and populate Chippy with as much of that song as the app can represent.

- Round-trip: compose on cart → dump `.sav` → edit in Chippy → export `.sav` back to cart (and the reverse).
- Map notes, instruments, phrase FX, tempo, and chain→order/pattern views as the model allows.
- As Chains / tables / grooves / kits / speech land, import should grow to fill those structures instead of dropping data.
- UI: Game Boy–only import path; clear messaging when a feature in the file has no Chippy home yet.

### Then burn down

1. **Chains UI** — real chain/phrase hierarchy (import + edit, not only synthetic export)
2. **Tables** — editor + alloc; unlocks `A` and table-driven timbre from imported saves
3. **Grooves** — beyond default `6,6`; unlocks `G` from imported saves
4. **Synth / wave frames** — softsynth + wave bank; deeper `F` / wave instruments from saves
5. **Kit instruments** — kits, kit note names, kit-specific `S`
6. **Speech instrument** — words / allophones
7. **File slots / `.lsdsng`** — read/write compressed projects in the upper 96KB; multi-song from one cart dump
8. **Arduinoboy commands** — `N` `X` `Q` `Y` if wanted for sync/hardware users
9. **Engine preview gaps** — keep honest any phrase command that exports/imports but is still approximate in Web Audio (`A` / `G` / deep `F` today)
10. **Format version targeting** — verify empty-song / import against current LSDJ 9.x ROMs; bump template as needed
11. **Preserve unknown bytes** — on import→edit→export, avoid clobbering unsupported regions when possible

## More chips and tools

- Dedicated YM Player (full-file listen beyond snip)
- Deeper NES (DMC channel, NES VGM export)
- Deeper SID (6581 vs 8580, accurate filter, `.sid` dump, C64 snip)

## Chippy-owned YM Radio

Submit → approve → rotation, thumbs up/down, own streaming library. The Radio tab today only plays third-party streams.

## Real donor sign-in

Replace auth stubs so donors get ad-free sessions and premium presets without `presets.unlockAll`.

## Tracker consistency wins

Shipped: richer shared FX on non-GB chips, Game Boy LSDJ FX + `.sav` export, Radio reconnect, CORS-gated viz, Rainwave now-playing.

Still open:

- Additional station HTTPS mirrors / now-playing APIs beyond Rainwave
