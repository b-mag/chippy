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

Game Boy mode ships **LSDJ phrase FX**, **`.sav` import** (full LSDJ hierarchy), and **`.sav` export** (greenfield synthetic or hierarchy encode, or **patch-in-place** when a `.sav` was opened). **LSDJ mode** gives the Game Boy its own Song / Chain / Phrase screens; switching it off falls back to Chippy's flat Song Order + Pattern grid over the same phrases. The niche that cares most is people who already write on a physical Game Boy + flash cart and want Chippy as a second editor.

### Round-trip principles (standing rules)

These are correctness requirements, not backlog items. Feature work that breaks them is a regression.

1. **Patch-in-place** — When a `.sav` was opened, re-export must write Chippy-owned edits into the original phrase/tempo/chain/sequence/table/groove slots and merge pulse/wave/noise instrument panel fields into those slots (without wiping kit/vibrato/length/panning bits), and **never rebuild** unsupported allocations, kits/speech bytes, or file slots from a flattened Song Order alone. Synthetic chain rebuild from Song Order is allowed **only** for greenfield Chippy→`.sav` exports without hierarchy (no opened base, never used LSDJ mode).
2. **Identity invariant** — Import `.sav` → make **no** modifications in Chippy → export `.sav` must be **byte-for-byte identical** to the file that was opened (128 KiB), regardless of which LSDJ features Chippy can edit or preview today.
3. **Slot fidelity** — Phrases, chains, and tables carry their real LSDJ slot numbers, and phrases are single-channel exactly as LSDJ stores them. Nothing may reintroduce id→slot indirection or 4-channel-wide phrases.

### Burn down (editability)

Preserve-on-reexport and format-version reporting are in place. **LSDJ mode** (Song / Chain / Phrase screens), **Tables**, and **Grooves** editors ship on this track. Remaining work:

1. ~~**Chains UI**~~ — LSDJ mode: Song screen (4 channel columns of chain numbers), Chain screen (phrase + transpose), Phrase screen; selection cascades Song → Chain → Phrase; auto-on for `.sav` open
2. ~~**Tables**~~ — editor + alloc; unlocks `A` and table-driven timbre from imported saves
3. ~~**Grooves**~~ — beyond default `6,6`; unlocks `G` from imported saves
4. **Synth / wave frames** — softsynth + wave bank; deeper `F` / wave instruments from saves
5. **Kit instruments** — kits, kit note names, kit-specific `S` (bytes are preserved today; not editable as kits)
6. **Speech instrument** — words / allophones
7. **File slots / `.lsdsng`** — read/write compressed projects in the upper 96KB; multi-song from one cart dump
8. **Arduinoboy commands** — **Ask Brandon before implementing.** Do not add `N` / `X` / `Q` / `Y` until he confirms he wants sync/hardware support.
9. **Engine preview gaps** — keep honest any phrase command that exports/imports but is still approximate in Web Audio (deep `F` today; `B` vibrato semantics; table/groove preview is approximate)
10. **Greenfield empty-song bump** — vendored work-song template is still libLSDJ format **v7** (LSDJ 9.x loads it). When a verified LSDJ 9.x empty dump is available, replace the template; opened saves already keep their own format version on patch-in-place re-export.

Shipped on the preserve path (not in the burn-down above): phrase/tempo/chain/table/groove patch-in-place, and **instrument merge** — pulse/wave/noise panel field edits write back into opened `.sav` slots without wiping table/kit/vibrato/length/panning bits. Kit/speech slots stay untouched.

## More chips and tools

- Dedicated YM Player (full-file listen beyond snip)
- Deeper NES (DMC channel, NES VGM export)
- Deeper SID (6581 vs 8580, accurate filter, `.sid` dump, C64 snip)

## Chippy-owned YM Radio

Submit → approve → rotation, thumbs up/down, own streaming library. The Radio tab today only plays third-party streams.

## Real donor sign-in

Replace auth stubs so donors get ad-free sessions and premium presets without `presets.unlockAll`.

## Tracker consistency wins

Shipped: richer shared FX on non-GB chips, Game Boy LSDJ FX + `.sav` export/import with patch-in-place preserve (including the LSDJ hierarchy, tables, grooves, and instrument panel merge), Radio reconnect, CORS-gated viz, Rainwave now-playing.

Still open:

- Additional station HTTPS mirrors / now-playing APIs beyond Rainwave
