# UseHourly for Android

A Trusted Web Activity: a thin Android shell that opens https://usehourly.app full screen. No app code lives here; the website is the app, so every deploy reaches Android users at once.

- `twa-manifest.json` is the Bubblewrap project description (package `app.usehourly.twa`).
- `public/.well-known/assetlinks.json` proves the app and the site belong together (without it the app shows a browser bar). It lists the SHA-256 fingerprints of the signing keys: the upload key, and, once the app is in Play Console, the **Play app signing key** (Play Console > Test and release > App integrity > App signing). Add that second fingerprint or the Play Store build shows the bar.
- The upload keystore and its password are NOT in the repo (`~/.config/usehourly-android/`). Losing the keystore is recoverable through Play (upload key reset), but keep a backup.

Build (needs JDK 17 and the Android SDK with build-tools 36.1.0; see `~/.bubblewrap/config.json`):

    cd <folder with twa-manifest.json>
    export BUBBLEWRAP_KEYSTORE_PASSWORD=... BUBBLEWRAP_KEY_PASSWORD=...
    npx @bubblewrap/cli update --skipVersionUpgrade
    npx @bubblewrap/cli build --skipPwaValidation

It writes `app-release-bundle.aab` (upload this to Play) and `app-release-signed.apk` (sideload for testing). Raise `appVersionCode` for every upload.

## Gotchas (found on a real phone)
- `enableSiteSettingsShortcut` must stay `true`: the browser-helper library always switches its `ManageDataLauncherActivity` on or off at start-up, and the manifest only declares it when this is true. With `false` the app crashes on launch with "Component class ...ManageDataLauncherActivity does not exist" (the test in `android-assetlinks.test.ts` guards it).
- Bubblewrap needs `minSdkVersion` 24 or higher (the browser-helper library requires it).
- Until `assetlinks.json` is live and lists the signing key in use, the app shows a browser bar at the top. Play re-signs the app, so add Play's app-signing fingerprint too.
