# Future work

Ideas parked so the tracker stays a common-denominator Order → Patterns editor across chips. Ship chip modes and shared columns first; deeper LSDJ hierarchy comes next.

## Mobile web tracker

The Tracker tab is **desktop-only** for now: mobile browsers see a message and no tracker controls (Radio and other tabs still work).

A real mobile tracker remains backlog if Brandon wants it later:

- Touch-sized targets and portrait-friendly layout
- No hover-only controls
- Web Audio unlock on a user gesture
- Safe-area / viewport handling
- Acceptable performance on mid-range phones

## LSDJ gaps

Game Boy mode ships **LSDJ phrase FX**, **`.sav` export** (synthetic chains from flat Song Order), and **`.sav` import** that flattens chains → Song Order (lossy for shared phrases / transpose). The niche that cares most is people who already write on a physical Game Boy + flash cart and want Chippy as a second editor.

### Next / in progress

Import is the flagship path: open a cart dump, edit what Chippy can represent, export `.sav` back. Remaining work below deepens fidelity so less data is dropped.

### Then burn down

1. **Chains UI** — real chain/phrase hierarchy (import + edit, not only synthetic export / flattened import)
2. **Tables** — editor + alloc; unlocks `A` and table-driven timbre from imported saves
3. **Grooves** — beyond default `6,6`; unlocks `G` from imported saves
4. **Synth / wave frames** — softsynth + wave bank; deeper `F` / wave instruments from saves
5. **Kit instruments** — kits, kit note names, kit-specific `S`
6. **Speech instrument** — words / allophones
7. **File slots / `.lsdsng`** — read/write compressed projects in the upper 96KB; multi-song from one cart dump
8. **Arduinoboy commands** — **Ask Brandon before implementing.** Do not add `N` / `X` / `Q` / `Y` until he confirms he wants sync/hardware support.
9. **Engine preview gaps** — keep honest any phrase command that exports/imports but is still approximate in Web Audio (`A` / `G` / deep `F` today; `B` vibrato semantics)
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

Shipped: richer shared FX on non-GB chips, Game Boy LSDJ FX + `.sav` export/import, Radio reconnect, CORS-gated viz, Rainwave now-playing.

Still open:

- Additional station HTTPS mirrors / now-playing APIs beyond Rainwave
