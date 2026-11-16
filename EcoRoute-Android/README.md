# EcoRoute for Android

An Android app (`.apk`) you can send to anybody: it shows the EcoRoute web app ([`../EcoRoute`](../EcoRoute)) full screen
in a WebView. The app files are inside the APK, and the **real map, routing, place search and chargers come from the
public OpenStreetMap services over the phone's own internet** (Wi-Fi or mobile data). There is no server of ours in the
middle, so it works for everyone, anywhere, as long as they are online.

```
 Phone  ┬─ EcoRoute app (inside the APK, 0.6 MB) ── profile + journeys stay on the phone
        ├─ OpenStreetMap tiles ........ the map
        ├─ OSRM ....................... routes + turn-by-turn instructions
        ├─ Nominatim .................. place search, addresses
        └─ Overpass ................... EV chargers
```

Optional: **Use my own server** on the login screen (or a build with the address baked in) keeps the account and the
journeys in an EcoRoute backend ([`../EcoRoute-Backend`](../EcoRoute-Backend)) instead of on the phone.

## Build the APK

Needs the Android SDK (Android Studio installs it) with *build-tools* and *platform android-34 or newer*, and a JDK.
Nothing else: no Gradle, no download.

```powershell
cd EcoRoute-Android
powershell -ExecutionPolicy Bypass -File .\build.ps1
# -> dist\EcoRoute-1.0.0.apk   (+ dist\EcoRoute-1.0.0.apk.sha256)
```

| Option | Meaning |
|---|---|
| `-ServerUrl https://my.server` | bake the address of your EcoRoute backend into the app (nobody has to type it) |
| `-VersionName 1.1.0 -VersionCode 2` | bump both for every release you hand out |
| `-Debug` | a build that can be inspected from `chrome://inspect` (testing only, don't share it) |
| `-Keystore path\to\your.p12` | sign with your own key (password in `path\to\your.p12.pass`) |

What the script does: copies `../EcoRoute` into the APK's `assets/www` with `js/config.js` switched to `app: true` →
`aapt2` (resources, manifest, icons) → `javac` + `d8` (the one Activity, `java/com/ecoroute/app/MainActivity.java`) →
`zipalign` → `apksigner`.

### The signing key

The first build creates a signing key in `%USERPROFILE%\.ecoroute\` (`ecoroute-release.p12` and its password file), **outside
this repository, and `.gitignore` also blocks `*.p12` / `*.jks`**. Keep a backup: an update of the app can only be installed
over an older version when it is signed with the **same** key. If you lose the key, people have to uninstall first
(and lose the data stored on their phone).

## Give the APK to someone

1. Send `dist\EcoRoute-1.0.0.apk` (Google Drive link, Telegram, e-mail, a cable…). Some messengers refuse `.apk` files: put it in
   a `.zip` first (the receiver unzips it) or share a Drive link. You can add the `.sha256` file so they can check it arrived intact.
2. They open the file on the phone. Android asks to allow **installing apps from this source** (the app they opened it
   from: *Files*, *WhatsApp*, *Chrome*…). Allow it once, tap **Install**. (Play Protect may say "unknown developer": that is
   normal for an app outside the Play Store; tap *Install anyway*.)
3. Open **EcoRoute**, choose *Skip* → *Register*, and allow **location** when asked ("While using the app").

Works on Android 7.0 (API 24) and newer, in portrait. It needs an up-to-date *Android System WebView*
(automatic on any phone with Google Play).

## What the app does on the phone

* Home shows a real map with your position; search any place by name; the app draws up to three real routes, **shortest first**,
  with distance, time and estimated CO₂; navigation follows your real GPS position with turn-by-turn instructions and finds a
  new route if you leave the road.
* **The vehicle never moves by itself**: in Live GPS it moves only when the phone really moves. (The *Demo drive* button,
  hold-to-drive, is there for trying the app at a desk.)
* The Charging tab lists OpenStreetMap EV chargers near you. OpenStreetMap has no live availability, and the app says so.
* The Android *Back* button is answered by the app itself (`window.EcoAppBack`): it closes an open question or sheet first,
  goes back one screen (a tab goes back to Home), asks "End this journey?" while a journey is running, and closes the app
  only from Home or the login screens. The screen stays on during a journey. Links such as the OpenStreetMap credit open
  in the phone's browser.
* **Location**: asked only when the app needs it (the Android permission dialog); it can be changed later in
  *Settings → Apps → EcoRoute → Permissions*. The app only receives positions while it is open on the screen (it has
  no background service), so keep EcoRoute in the foreground while navigating.

## Limits you should know

* The OpenStreetMap services are free and shared, with usage rules (about 1 search per second, no bulk map downloads); with
  many users at once they may slow down or refuse. Real traffic means running your own tile / routing / search servers or
  paying a provider, and then changing the addresses in `../EcoRoute/js/config.js`.
* **No live traffic, no live charger availability, CO₂ is an estimate** (see [`../EcoRoute/README.md`](../EcoRoute/README.md)).
* Without a server, the account is a **profile on that phone** (no password is stored, nothing is synced; uninstalling the app
  deletes it). A shared database between phones needs a backend that is reachable from the internet over HTTPS
  (see the hosting notes in [`../EcoRoute-Backend/README.md`](../EcoRoute-Backend/README.md)).
* The APK is signed with a self-made key, so it is not distributed through Google Play and phones will warn about
  installing it. Publishing on the Play Store would need a developer account, a privacy policy and a release signed with Play App Signing.
* Tested so far: the web app in Chrome with the real map services, and the APK in an Android 16 emulator (it installs, starts,
  serves its files, creates the local profile and receives the GPS fix after the Android permission dialog). The emulator on the
  development PC could not reach the map services (a security program there re-signs HTTPS traffic), so **map, routes and
  chargers inside the APK, the Back button and a real phone's GPS while moving are still to be confirmed on a real phone.**
  If something is wrong, `-Debug` builds can be inspected from `chrome://inspect` on a PC with the phone connected by USB.

## Project layout

```
AndroidManifest.xml                 permissions: internet, location; one Activity
java/com/ecoroute/app/MainActivity.java   the WebView shell (serves the app files from the APK, location permission, back button)
res/                                theme (green status bar), launcher icons (adaptive + legacy)
build.ps1                           the build script
build/  dist/                       generated (git-ignored)
```

How the app files are served: the WebView asks for `https://appassets.androidplatform.net/…`; `MainActivity` answers
those requests from the APK (the address never touches the network). That gives the page a secure origin (needed for
location and storage) and is the origin the backend allows for CORS. Every other address (map tiles, routing…) goes to the
real network.
