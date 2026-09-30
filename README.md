# Chippy

A web tracker for writing Game Boy and Vectrex chiptunes.  I'd like to keep it as simple as LSDJ and support various 8 bit chips.  PS just in case one of the guys from the other day reads this... yes an Index can speed up deletes.

<img width="1032" height="930" alt="Screenshot 2026-09-29 214528" src="https://github.com/user-attachments/assets/af8d5db2-d116-4e6b-ac23-c1782d78bf47" />




## What it can do

- One screen with Song Order, every channel, and the instrument studio.
- A project holds one chip, a shared instrument bank, and one or more songs.
- Game Boy (PU1/PU2/WAV/NOI) and Vectrex (three tone channels).
- Instrument studio: rename/type/delete, pitch audition, chip-specific hardware controls, free and premium presets (`presets.unlockAll` in config unlocks premium for local/dev).
- Changing chip starts a new blank project after confirm. Opening a project warns when the session is dirty.
- The keyboard plays a note as you write it. Undo, mute, and solo are on that screen.
- Vaporwave, dark, and plain paint, chosen from a Paint dropdown (defaults to vaporwave).
- A short opening animation. Set `splashEnabled` to `false` in `frontend/public/config.json`, or `chippy.splash.enabled` in `chippy-api/src/main/resources/application.yml`.
- Save a `.chippy.json` project (v2) and open one again. Legacy v1 song files migrate on open. Uploads are parsed and rejected when they are not a project or a YM file.
- Create a random song after a warning and typing YES.
- Export WAV, YM6, Game Boy VGM, and a Vectrex AKY assembly file plus player config.
- Open a YM beside the song, play a range, and keep it as an instrument.
- Optional Buy Me a Coffee prompt and Google AdSense slot, both off until you configure them. See [MONETIZATION_SETUP.md](MONETIZATION_SETUP.md).
- API rate limits on upload validation to reduce abuse.

## Later

- More chips (C64, NES, Atari ST), snip on those chips, and a dedicated YM Player.
- YM Radio (rotation, submit/approve, thumbs, visualization).
- Deeper tracker tools such as tables, grooves, and Chains. LSDJ `.SAV` / `.lsdsng` bridge.
- Real sign-in so donors can use an ad-free session and premium presets without `unlockAll`.

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
    Engines[GB and AY engines]
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
