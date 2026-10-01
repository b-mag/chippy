# Chippy

A web tracker for writing Game Boy, Vectrex, and C64 chiptunes.  I'd like to keep it as simple as LSDJ and support various 8 bit chips.  PS just in case one of the guys from the other day reads this... yes an Index can speed up deletes.

Current state: Tracker and on the other tab a full internet streaming radio - I was thinking in my head I could eventually set it up where people could submit their chip tune creations and I can have this project also stream chiptunes created with the app... allowing users to thumb up or thumb down to further refine song plays/distribution.

<img width="2531" height="1292" alt="Screenshot 2026-09-30 195058" src="https://github.com/user-attachments/assets/1a517183-9b50-4276-93df-ea7d896d6c83" />

Also did some UI tweaking and refinements.

<img width="2551" height="1347" alt="Screenshot 2026-09-30 195152" src="https://github.com/user-attachments/assets/69994e65-a0e3-40f8-9949-bbfdcb14d830" />




## What it can do

- One screen with Song Order, every channel, and the instrument studio.
- A project holds one chip, a shared instrument bank, and one or more songs.
- Game Boy (PU1/PU2/WAV/NOI), Vectrex (three tone channels), and C64 (three SID voices).
- Pattern grid columns: note, instrument, volume, and a shared FX column (`A` volume slide, `D` note delay, `R` retrigger).
- Instrument studio: rename/type/delete, pitch audition, chip-specific hardware controls, free and premium presets (`presets.unlockAll` in config unlocks premium for local/dev).
- Changing chip starts a new blank project after confirm. Opening a project warns when the session is dirty.
- The keyboard plays a note as you write it. Undo, mute, and solo are on that screen.
- Vaporwave, dark, and plain paint, chosen from a Paint dropdown (defaults to vaporwave).
- A short opening animation. Set `splashEnabled` to `false` in `frontend/public/config.json`, or `chippy.splash.enabled` in `chippy-api/src/main/resources/application.yml`.
- Save a `.chippy.json` project (v2) and open one again. Legacy v1 song files migrate on open. Uploads are parsed and rejected when they are not a project or a YM file.
- Create a random song after a warning and typing YES.
- Export WAV (all chips), YM6 and Vectrex AKY (Vectrex), Game Boy VGM.
- Open a YM beside the song, play a range, and keep it as an instrument.
- Optional Buy Me a Coffee prompt and Google AdSense slot, both off until you configure them. See [MONETIZATION_SETUP.md](MONETIZATION_SETUP.md).
- API rate limits on upload validation to reduce abuse.

## Later

See [FUTURE.md](FUTURE.md) for the backlog: mobile phone browser compatibility, LSDJ `.SAV` / `.lsdsng` export (synthetic chains from flat order), Chains/tables/grooves UI, NES / Atari ST, Chippy-owned YM Radio, and real donor sign-in.

## Run it locally

You need Java 21 and Node 22.22 or 24.15 or newer. The scripts in `scripts/` use a portable JDK and Maven under `.tools` when those archives are present, and they download Node 24 into `.tools` when the installed Node is older than that.

- `scripts/dev.cmd` or `scripts/dev.sh` starts the API on port 8080 and the Angular app on port 4200, waits until the UI answers, then opens `http://localhost:4200` in your browser. Logs: `logs/dev-api.log` and `logs/dev-ui.log`.
- `scripts/dev-ui.cmd` / `scripts/dev-ui.sh` starts only Angular.
- `scripts/dev-api.cmd` / `scripts/dev-api.sh` starts only Spring Boot.
- `scripts/build.cmd` / `scripts/build.sh` packages the WAR and writes `logs/build.log`.

IntelliJ and VS Code both open this repository. Java lives in `chippy-api`. Angular lives in `frontend`.

Frontend tests (`npm test`) and API tests (`mvn -pl chippy-api test`) enforce about 80% coverage on the libraries and API code under test.

## Hosting

The same Spring Boot app is packaged three ways.

- **WebSphere Liberty.** `mvn -B package` writes `chippy-api/target/chippy.war`. Drop it on Liberty with `deploy/liberty/server.xml` (`servlet-6.0`). `java -jar` also runs that WAR. Traditional WebSphere 8.5 and 9 cannot run it.
- **OpenShift.** Build `deploy/Containerfile`, then `oc apply -f deploy/openshift`. There is no Jenkinsfile. Probes use `/api/health`.
- **Oracle ARM VM.** Copy the WAR to an Ampere A1 instance and run it with Temurin 21. Stay at or under 2 CPUs and 12 GB. Put Caddy or nginx on port 443 and forward to `127.0.0.1:8080`. Details are in `deploy/arm/README.md`.

## Architecture

```mermaid
flowchart LR
  subgraph ui [Angular]
    Shell[Shell]
    Tracker[Order pattern instrument]
    Listen[YM snip]
    Domain[Domain]
    Engines[GB AY and soft SID]
  end
  subgraph api [Spring Boot]
    Validate[Upload checks]
    Security[Headers auth stub rate limit]
  end
  Shell --> Tracker
  Shell --> Listen
  Tracker --> Domain
  Domain --> Engines
  Engines --> Exports[WAV YM6 VGM AKY]
  Tracker --> Validate
```

Sound is rendered in the browser. The server checks uploads and serves the page. See `ARCHITECTURE.md`.
