# Architecture

Chippy is one Angular application and one Spring Boot WAR. A new chip adds a `ChipDefinition` (channels, instrument fields, engine) and an exporter. It does not add a new screen flow. Game Boy, Vectrex (AY), C64 (soft SID), Atari ST (YM2149 / AY path), and NES (soft 2A03) share the same Order → Patterns tracker with note / instrument / volume / FX columns.

## Libraries

- `frontend/projects/domain` has the song, the pattern, and the editing commands. It does not import Angular.
- `frontend/projects/engines` turns a song into Game Boy, AY, soft-SID, or soft-NES register frames.
- `frontend/projects/files` writes `.chippy.json`, WAV, YM6, VGM, and AKY. Export code is loaded when Export is opened.
- `src/app/tracker` and `src/app/listen` are lazy routes and do not import each other.
- ESLint rejects an Angular import inside `domain` or `files`, and a files import inside `engines`.

Song state is a signal. NgRx is not used. The audio oscillators run on the audio thread. The playhead signal updates once per pattern row.

A `.chippy.json` **Project** (v2) holds `chip`, shared `instruments`, and one or more `songs`. Engines still render a flat active-song view. Legacy v1 single-song files migrate on open.

## Files

The editable file is `.chippy.json`. Vectrex download is WAV, uncompressed YM6, and little-endian 6809 AKY plus a player config for Malban's player. Atari ST download is WAV and YM6 (2 MHz header). Game Boy download is WAV and VGM. C64 and NES download is WAV (soft engines). A YM opened on the snip page does not change the song until "Use in this song".

## Runtimes

One codebase.

| Output | How |
| --- | --- |
| WAR | `mvn -B package`, then Liberty or `java -jar chippy.war` |
| JAR | `mvn -B -Pjar package` |
| Container | `deploy/Containerfile` |

The container listens on 8080 as a non-root user. OpenShift may assign any UID in group 0.

## Security

Spring Security is on the classpath and permits every request. `ChippyAuthorization` is the seam for a later sign-in. Responses send a content security policy (widened when coffee/ads are enabled), frame denial, a referrer policy, and a permissions policy. HSTS is added only on HTTPS. Uploads are size-capped, parsed, and re-serialized. Validate endpoints are rate-limited per IP in memory. Optional Buy Me a Coffee and AdSense flags are served from `/config.json` (see `MONETIZATION_SETUP.md`). The server does not store songs.
