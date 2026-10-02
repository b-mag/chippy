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

Game Boy mode ships **LSDJ phrase FX**, **`.sav` import** (flatten chains → Song Order for editing), and **`.sav` export** (greenfield synthetic chains, or **patch-in-place** when a `.sav` was opened). The niche that cares most is people who already write on a physical Game Boy + flash cart and want Chippy as a second editor.

### Round-trip principles (standing rules)

These are correctness requirements, not backlog items. Feature work that breaks them is a regression.

1. **Patch-in-place** — When a `.sav` was opened, re-export must write Chippy-owned edits into the original phrase/tempo slots and **never rebuild** sequence, chains, allocations, tables, grooves, wave bank, kits/speech bytes, or file slots from the flattened Song Order. Synthetic chain rebuild from Song Order is allowed **only** for greenfield Chippy→`.sav` exports (no opened base).
2. **Identity invariant** — Import `.sav` → make **no** modifications in Chippy → export `.sav` must be **byte-for-byte identical** to the file that was opened (128 KiB), regardless of which LSDJ features Chippy can edit or preview today.

### Burn down (editability)

Preserve-on-reexport and format-version reporting are in place. Remaining work deepens what Chippy can *edit*, not whether unsupported data survives the trip:

1. **Chains UI** — real chain/phrase hierarchy (edit shared phrases / transpose in Chippy, not only flattened view + patch-in-place)
2. **Tables** — editor + alloc; unlocks `A` and table-driven timbre from imported saves
3. **Grooves** — beyond default `6,6`; unlocks `G` from imported saves
4. **Synth / wave frames** — softsynth + wave bank; deeper `F` / wave instruments from saves
5. **Kit instruments** — kits, kit note names, kit-specific `S` (bytes are preserved today; not editable as kits)
6. **Speech instrument** — words / allophones
7. **File slots / `.lsdsng`** — read/write compressed projects in the upper 96KB; multi-song from one cart dump
8. **Arduinoboy commands** — **Ask Brandon before implementing.** Do not add `N` / `X` / `Q` / `Y` until he confirms he wants sync/hardware support.
9. **Engine preview gaps** — keep honest any phrase command that exports/imports but is still approximate in Web Audio (`A` / `G` / deep `F` today; `B` vibrato semantics)
10. **Greenfield empty-song bump** — vendored work-song template is still libLSDJ format **v7** (LSDJ 9.x loads it). When a verified LSDJ 9.x empty dump is available, replace the template; opened saves already keep their own format version on patch-in-place re-export.
11. **Instrument merge on preserve path** — write Chippy pulse/wave/noise field edits back into opened `.sav` instrument slots without wiping table/kit bits (phrase/tempo patch-in-place ships; instrument panel edits stay local until this lands)

## More chips and tools

- Dedicated YM Player (full-file listen beyond snip)
- Deeper NES (DMC channel, NES VGM export)
- Deeper SID (6581 vs 8580, accurate filter, `.sid` dump, C64 snip)

## Chippy-owned YM Radio

Submit → approve → rotation, thumbs up/down, own streaming library. The Radio tab today only plays third-party streams.

## Real donor sign-in

Replace auth stubs so donors get ad-free sessions and premium presets without `presets.unlockAll`.

## Tracker consistency wins

Shipped: richer shared FX on non-GB chips, Game Boy LSDJ FX + `.sav` export/import with patch-in-place preserve, Radio reconnect, CORS-gated viz, Rainwave now-playing.

Still open:

- Additional station HTTPS mirrors / now-playing APIs beyond Rainwave
