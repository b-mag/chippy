# Monetization setup

Chippy ships with Buy Me a Coffee and Google AdSense **framework support off by default**. Create the accounts below, then flip config when you are ready to go live.

Do **not** commit real publisher IDs or `enabled: true` into git. Keep the repo defaults disabled.

## 1. Create accounts

### Buy Me a Coffee (donation popup)

1. Sign up at [buymeacoffee.com](https://www.buymeacoffee.com).
2. Create your page and note the public URL, for example `https://www.buymeacoffee.com/yourname`.
3. Optional alternate: [Ko-fi](https://ko-fi.com) works the same way — put that page URL in `coffee.url`.

### Google AdSense (display ads)

1. Sign up at [Google AdSense](https://www.google.com/adsense).
2. Add your Chippy site and complete their site review (this can take days or weeks).
3. Create an ad unit and copy:
   - Publisher ID (`ca-pub-…`) → `ads.clientId`
   - Ad unit / slot ID → `ads.slotId`

## 2. Configure the application

Both paths must stay in sync with the same shape. When Spring serves the SPA, `/config.json` is generated from YAML / env and overrides the static file.

### Local Angular (`ng serve`)

Edit [`frontend/public/config.json`](frontend/public/config.json):

```json
{
  "splashEnabled": true,
  "coffee": {
    "enabled": true,
    "url": "https://www.buymeacoffee.com/yourname",
    "delayMinutes": 5,
    "title": "Hey! If you are enjoying this please consider buying me a coffee...",
    "body": "It will help pay server costs to keep this running and free for everyone!!!",
    "acceptLabel": "Alright!",
    "dismissLabel": "Maybe Later"
  },
  "ads": {
    "enabled": true,
    "provider": "adsense",
    "clientId": "ca-pub-XXXXXXXXXXXXXXXX",
    "slotId": "YYYYYYYYYY"
  }
}
```

You can enable coffee, ads, both, or neither. Empty `url` / `clientId` / `slotId` keeps that feature hidden even if `enabled` is true.

### Packaged WAR / Liberty / ARM VM

Edit [`chippy-api/src/main/resources/application.yml`](chippy-api/src/main/resources/application.yml) or set environment variables (Spring relaxed binding):

| Setting | YAML | Environment variable |
| --- | --- | --- |
| Coffee on/off | `chippy.coffee.enabled` | `CHIPPY_COFFEE_ENABLED` |
| Coffee URL | `chippy.coffee.url` | `CHIPPY_COFFEE_URL` |
| Delay (minutes) | `chippy.coffee.delay-minutes` | `CHIPPY_COFFEE_DELAY_MINUTES` |
| Ads on/off | `chippy.ads.enabled` | `CHIPPY_ADS_ENABLED` |
| AdSense client | `chippy.ads.client-id` | `CHIPPY_ADS_CLIENT_ID` |
| AdSense slot | `chippy.ads.slot-id` | `CHIPPY_ADS_SLOT_ID` |

Example:

```bash
export CHIPPY_COFFEE_ENABLED=true
export CHIPPY_COFFEE_URL=https://www.buymeacoffee.com/yourname
export CHIPPY_ADS_ENABLED=true
export CHIPPY_ADS_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
export CHIPPY_ADS_SLOT_ID=YYYYYYYYYY
```

Restart the API after changing YAML or env so `/config.json` refreshes.

## 3. Enable checklist

1. Hard-refresh the site (and confirm `/config.json` shows your flags).
2. With coffee enabled: wait `delayMinutes` in one browser session — the prompt should appear once; **Alright!** opens your URL; **Maybe Later** dismisses it for that session.
3. With ads enabled: a low-profile slot appears (bottom-left). AdSense may stay blank until the site is approved.
4. CSP widens automatically when coffee and/or ads are enabled (third-party script/frame hosts). With both off, CSP stays strict.
5. Future donor login: `AuthService.hasSupportPerk()` will hide ads (and the coffee prompt) for supporters. That login path is not wired yet.

## 4. What not to commit

- Live `enabled: true` in tracked `config.json` / `application.yml`
- Real `ca-pub-…` / slot IDs / personal coffee URLs you do not want public

Prefer env vars on the host for production secrets and enable flags.
