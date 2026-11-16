# Eco-System

**EcoRoute – Smart Eco-Friendly Navigation.** Compare routes by estimated CO₂, navigate turn by turn, record journeys and
find EV chargers on a **real OpenStreetMap map**, in a browser, as an installable web app or as an **Android app (APK)**.

| Folder | What it is |
|---|---|
| [`EcoRoute`](EcoRoute) | The mobile-first app (HTML, CSS, vanilla JavaScript + the bundled Leaflet map). Works alone: a profile on the device, real map, real routes, real chargers. |
| [`EcoRoute-Backend`](EcoRoute-Backend) | Optional Java 21+ / Spring Boot / MyBatis (XML mappers) / **MySQL** backend: accounts, vehicles, journeys with their real route, and your real-time location in your own database. It also serves the front-end. |
| [`EcoRoute-Android`](EcoRoute-Android) | The Android app: one script builds a signed `.apk` you can send to anybody; it works on their own internet. |

**Real or estimated?** The map (OpenStreetMap), routes and turn-by-turn instructions (OSRM), place search (Nominatim),
chargers (OpenStreetMap data) and your position (GPS) are real. CO₂ and the Eco Score are estimates, there is no live
traffic and no live charger availability, and the free public map services are best-effort. Details and limits:
[`EcoRoute/README.md`](EcoRoute/README.md).

## Quick start

**Just try the app** (no database needed): serve the `EcoRoute` folder and open it.

```
cd EcoRoute
python -m http.server 8080        # open http://localhost:8080
```

**With accounts and a database** (JDK 21+ and MySQL on `localhost:3306`):

```
cd EcoRoute-Backend
copy config\application.example.properties config\application.properties     (then put your MySQL password in it)
start.cmd              (macOS / Linux: ./start.sh)
```

Open **http://localhost:8090** and use **Continue with demo account**, or register your own account. The password file is
git-ignored; the database `ecoroute` is created for you. See [`EcoRoute-Backend/README.md`](EcoRoute-Backend/README.md)
(settings, API, privacy, hosting it for other people, troubleshooting).

**Build the Android app** (Android SDK + a JDK; no Gradle):

```
cd EcoRoute-Android
powershell -ExecutionPolicy Bypass -File .\build.ps1        ->  dist\EcoRoute-1.0.0.apk
```

Send the `.apk` to a phone, open it, allow installing from that source once, and it runs on the phone's own internet.
See [`EcoRoute-Android/README.md`](EcoRoute-Android/README.md) for sharing, the signing key and the limits.

## Repository notes

* Secrets are not in git: the MySQL password lives in `EcoRoute-Backend/config/application.properties` and the APK signing key in
  `%USERPROFILE%\.ecoroute\`; both paths are git-ignored, and so are build outputs (`target/`, `build/`, `dist/`).
* Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Please respect the usage policies of the
  public OSM services (tiles, Nominatim, OSRM, Overpass) if you share the app widely, or run your own.
