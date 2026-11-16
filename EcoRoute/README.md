# EcoRoute – Smart Eco-Friendly Navigation

**Travel Smarter. Drive Greener. Live Better.**

A mobile-first, installable (PWA) route-planning app built with **only HTML5, CSS3 and vanilla JavaScript** (plus the
bundled [Leaflet](https://leafletjs.com) map library). It compares routes by estimated CO₂, navigates turn by turn,
records journeys and finds EV chargers, on a **real map**. It runs

* **on its own** (everything stays on the device),
* **with the Java + MySQL backend** in [`../EcoRoute-Backend`](../EcoRoute-Backend) (accounts, vehicles, journeys and
  your real-time location in your own database), and
* **as an Android app** (an APK, see [`../EcoRoute-Android`](../EcoRoute-Android)) that works on anybody's phone and internet.

> **What is real**
>
> * **Map** – OpenStreetMap tiles (Leaflet). **Routes** – real road routing from the public OSRM service (up to three
>   alternatives, real turn-by-turn instructions). **Place search / addresses** – OpenStreetMap Nominatim.
>   **EV chargers** – OpenStreetMap `charging_station` data (via Overpass, with Nominatim as a backup).
> * **Your location** – the device's GPS (Geolocation API). During a journey the vehicle moves only when *you* move
>   (**Live GPS**, the default) or, on a PC without GPS, while you hold the **Demo drive** button. Nothing moves by itself.
>
> **What is an estimate, and what the app does not know**
>
> * CO₂, the Eco Score and the "Eco" route are **estimates** worked out from the distance, the route's average speed and
>   number of turns, and the vehicle's fuel use (see *How the numbers are made*). There is **no live traffic**, no road
>   gradient and no measured emissions.
> * Chargers: OpenStreetMap volunteers map them, so coverage varies by area, and there is **no live availability**
>   (the app says "Availability isn't live" instead of showing free / busy ports).
> * The public OSM services are free, best-effort and rate-limited (about one search per second). They are fine for a
>   demo and for personal use; for real traffic run your own services and put their addresses into `js/config.js`.

---

## Run it

### With the backend (accounts and journeys in MySQL)

```bash
cd EcoRoute-Backend
start.cmd              # Windows   (macOS / Linux: ./start.sh)
# open http://localhost:8090
```

Needs JDK 21+ and MySQL on `localhost:3306` (your MySQL password goes into the git-ignored `config/application.properties`); see
[`../EcoRoute-Backend/README.md`](../EcoRoute-Backend/README.md). The backend serves this front-end too, so there is
nothing else to start, and `http://localhost` lets the browser share your location.

Sign in with **Continue with demo account** (`alex.morgan@example.com` / `Demo@1234`, with sample vehicles and journeys) or
**Register** a real account (8+ characters, letters and a number): the password is stored as a BCrypt hash in MySQL.

### Without a backend (everything stays on the device)

Any static file server works:

```bash
cd EcoRoute
python -m http.server 8080        # or: npx serve .   /   VS Code "Live Server"
# open http://localhost:8080
```

The app notices that no backend answers and keeps a **local profile** in the browser (`localStorage`): register with any
valid e-mail (nothing is sent anywhere; passwords are not stored at all), start with an empty garage and no journeys.
**Continue with demo account** fills it with sample vehicles and about five months of sample journeys (clearly marked
as samples, without maps). The map, routes, search and chargers still come from the OpenStreetMap services, so you
need an internet connection. Opening `index.html` from disk (`file://`) also works, only the service worker is skipped.

**Use my own server** (login screen): type the address of an EcoRoute backend and the app stores your account and
journeys there instead. This is also how the Android app can talk to a server.

### As an Android app

See [`../EcoRoute-Android`](../EcoRoute-Android): one script builds `EcoRoute-<version>.apk`, which you can send to anybody.
It needs nothing but the phone's own internet connection. Or: open the served URL in Chrome on the phone → menu →
*Install app*. Location needs `https://` or `http://localhost`.

**On desktop** the app is shown inside a centred phone-sized frame (it is a mobile app, not a website).

---

## The 14 screens

| # | Screen | Highlights |
|---|--------|-----------|
| 1 | Splash | Logo, name, *Travel Smarter. Drive Greener.*, animated loader |
| 2 | Onboarding | 3 swipeable slides: Find Smart Routes · Reduce Carbon Emissions · Discover EV Charging Stations |
| 3 | Login / Register | Validation, password strength meter, show/hide password, Forgot password sheet, **Use my own server** |
| 4 | Home | Greeting, profile + notifications, **live map with your position**, location card (address, coordinates, accuracy), **place search** (OpenStreetMap), vehicle + battery, **Find Eco Route**, impact summary, recent journeys |
| 5 | Vehicle selection | 5 selectable types (Petrol Bike, Petrol Car, Diesel Car, Electric Bike, Electric Car) + saved garage |
| 6 | Add vehicle | Company, model, fuel type, mileage, battery capacity (EV), estimated range, live emissions preview |
| 7 | Route planner (Explore) | Real map you can pan and zoom, **tap the map to drop a destination pin**, search, **editable start** (your position or any place), vehicle, battery |
| 8 | Route comparison | Up to 3 real routes drawn on the map with distance, time, CO₂, Eco Score and **Shortest** / **Eco-Friendly** / **Fastest** badges. The **shortest route is selected first**; change it by tapping a card or a line on the map |
| 9 | Live navigation | Follow-me map, route line, **real turn-by-turn instructions** with distance to the next turn, travelled / remaining / ETA / CO₂, **Start · Pause · Resume · End**, automatic **new route when you leave the road** |
| 10 | EV charging finder | Real chargers around you from OpenStreetMap: map + list, connectors, power, ports, fee, filters, battery %, range, **Navigate** |
| 11 | Journey summary | From → To, distance, duration, CO₂, carbon saved, Eco Score, the **real route on a map**, and (Live GPS journeys) the track your device recorded |
| 12 | Journey history | Grouped by day, vehicle filter, per-journey details (the route is fetched from the server when needed) |
| 13 | Eco analytics | Weekly / monthly charts (bars, trend line, ranked vehicle emissions), table views, monthly goal |
| 14 | Profile & settings | Edit profile, saved vehicles, light / dark / auto theme, notification toggles, **privacy & data** (save location history on/off, delete location history, delete account), install, about, reset, logout |

A fixed bottom navigation (Home · Explore · Charging · History · Profile) with green active icons and animated
screen transitions ties them together. Browser / Android **back** works (history API) and a running journey
cannot be left accidentally.

---

## How the real map works

All the external services are configured in [`js/config.js`](js/config.js); nothing else in the code knows their addresses.

| What | Service (default) | Notes |
|---|---|---|
| Map tiles | `tile.openstreetmap.org` | shown with [Leaflet](https://leafletjs.com) 1.9.4, bundled in `assets/vendor/leaflet` (BSD-2). Dark mode darkens the tiles with a CSS filter. The OSM [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) applies (no bulk downloading, keep the credit visible) |
| Routing | OSRM: `routing.openstreetmap.de/routed-car`, fallback `router.project-osrm.org` | `alternatives=3&steps=true&overview=full`; driving profile; no live traffic |
| Place search, addresses | OpenStreetMap Nominatim | requests are queued to at most one per second and cached; results are biased to where you are |
| EV chargers | Overpass API (`amenity=charging_station`) | the public servers are often slow: the first is asked, the next one is added after 3.5 s if there is no answer (several mirrors, first good answer wins). If there is no complete answer after 8 s, or all of them fail, Nominatim's "charging station" search gives a clearly labelled shorter list meanwhile, and the full list replaces it when it arrives |
| Street address of your position (with the backend) | Nominatim, called by the **server** | cached by ~100 m cell; `GEOCODING_ENABLED=false` switches it off |

Every one of these is a third party that sees what is sent to it: tiles reveal roughly which area you look at, routing
sees the two end points, search sees what you type, chargers see your approximate position. Their own privacy
policies apply. The app sends them nothing else, and no account data.

### Routes and the three labels

OSRM returns one to three alternatives. For the selected vehicle the app labels them:

* **Shortest** – the least distance (selected first, always; you can change it),
* **Fastest** – the least driving time,
* **Eco-Friendly** – the least *estimated* CO₂.

When one route wins several labels (very common) it is shown once with several badges. **The public OSRM servers often
return just one route** (for four city trips of 1 – 12 km in Pune they returned exactly one each time), and then there is only one
card and the app says "One route found"; it never invents routes. More choice would need a routing service with better
alternative routes, or extra OSRM requests through additional waypoints (not implemented yet).

### Following you along the route

* **Live GPS** – your position is matched onto the route (never counting backwards). Standing still adds exactly 0 m,
  GPS wobble inside the accuracy radius is ignored, fixes worse than ±30 m (typical on a PC) are ignored with a
  "Weak GPS signal" message, obvious glitches (a jump faster than 250 km/h) are ignored.
* **Off the route** – more than max(45 m, 1.5 × accuracy) away for 3 fixes in a row, and a new route from where you are is
  requested automatically ("New route found"). If you press Start while you are more than 150 m from where the route
  begins, it is re-planned from your position first. The screen is kept awake during a journey.
* **Demo drive** (PC without GPS) – hold the drive button (or the ↑ key) and the vehicle drives along the real route at
  its pace; let go and it stops. The scale chip (5×, 10×, 20×, 40×) is how much faster than real time it covers ground while held.
* A journey needs at least 300 m to be recorded, unless you arrive.

### How the numbers are made

* **CO₂** – fuel vehicles: `2310 g (petrol) / 2680 g (diesel) ÷ km-per-litre`; EVs: `battery kWh ÷ range × 0.45 g/Wh`
  (a sample grid mix). It is multiplied by a **flow factor** for the route: `0.80 + 0.11 × turns per km (max 3.5)
  + 0.0045 × |average speed − 55 km/h|`, limited to 0.82 – 1.35, so steady driving at about 55 km/h with few turns counts
  as cleaner than stop-and-go. That factor is a model, not a measurement.
* **Eco Score** = `100 − g/km ÷ 3.2` (clamped 6 – 99). **Carbon saved** is measured against an average petrol car (170 g/km).
* **Journey time** is OSRM's driving time; there is no traffic data in it.

### Where the data lives

* **With the backend:** MySQL (accounts, vehicles, journeys including the route that was driven, saved positions) and
  `localStorage` only keeps the login token and a cached copy. **Save my location history** (Profile) off = no position,
  address or route is sent to the server (journeys are still saved, without coordinates).
* **Without it:** `localStorage` holds the local profile, vehicles, settings and journeys (with their route). Nothing
  leaves the device except the requests to the map services above.

---

## Folder structure

```
EcoRoute/
├── index.html                 all 14 screens + bottom nav + overlay roots
├── manifest.json              PWA manifest (192/512/maskable icons)
├── service-worker.js          offline app-shell cache (stale-while-revalidate; never touches /api/ or the map services)
├── css/
│   ├── style.css              design tokens (light + dark), layout, components, map and marker styles
│   ├── responsive.css         phone frame on desktop, small phones, short screens, landscape
│   └── animations.css         transitions, splash, rings, chart motion (respects reduced-motion)
├── js/
│   ├── config.js              addresses of the map services, app / server switches (the Android build replaces it)
│   ├── icons.js               inline Lucide icons (bundled, offline)                         [support]
│   ├── data.js                vehicle types, emission maths, sample-journey generator       [support]
│   ├── ui.js                  toast, confirm dialog, bottom sheet, rings…                    [support]
│   ├── app.js                 store (localStorage + server data), theme, stats, PWA, boot
│   ├── api.js                 backend connection: server address, token, requests, settings sync, journey outbox [support]
│   ├── location.js            real-time device location (shared Geolocation stream, address, saving) [support]
│   ├── geo.js                 OpenStreetMap services: search, reverse, OSRM routes, chargers; route maths and labels [support]
│   ├── map.js                 the Leaflet map wrapper (markers, route lines, follow mode)   [support]
│   ├── navigation.js          screen router, transitions, back-button guard
│   ├── auth.js                splash, onboarding, login/register (server or local), Use my own server
│   ├── dashboard.js           Home (map + live location card + search)
│   ├── vehicles.js            vehicle selection + add vehicle + battery state
│   ├── routes.js              destination search, planner, route comparison
│   ├── tracking.js            live navigation (GPS / demo drive, turn-by-turn, re-routing) + journey summary
│   ├── charging.js            EV charging finder
│   ├── analytics.js           history + analytics charts
│   └── profile.js             profile & settings
└── assets/
    ├── vendor/leaflet/        Leaflet 1.9.4 (BSD-2)
    ├── logo/                  logo.svg, logo-mark.svg
    ├── icons/                 PNG app icons, maskable icon, favicon
    ├── images/                install-dialog screenshots referenced by the manifest
    └── fonts/                 Inter (variable, latin) + licence
```

Files marked *[support]* are small shared modules added to keep each feature file focused. Scripts are plain `<script>`
tags sharing one `Eco` namespace (no ES-module loader), so the app also opens from `file://`.

## Backend mode

At start-up the app asks `GET api/health`. If an EcoRoute backend answers (the one that served the page, or the address
chosen with **Use my own server** / `serverUrl` in `config.js`), the app uses it; if not, it runs with the local profile.

* **Sign in** – the server checks the BCrypt hash and returns a token; the app keeps only the token (`localStorage`)
  and the whole account arrives in one request (`GET api/bootstrap`).
* **Saved as you go** – vehicles, profile edits, journeys and *Clear history* are written to the database straight away;
  settings (theme, notifications, goal, battery, active vehicle, movement mode) are synced a moment after each change.
* **Journeys keep their route** – start and end coordinates plus the road route as an encoded polyline; the history list
  does not carry the (big) route, `GET api/journeys/{id}/route` fetches it when you open a journey.
* **Location** – see `js/location.js`: one `watchPosition` shared by Home and navigation, batched to `POST api/location/pings`
  while *Save my location history* is on; the street address comes from the server (`GET api/geo/reverse`).
* **Server unreachable** – a finished journey is kept in an outbox and sent later (the server ignores a repeated
  `clientRef`, so a retry can never duplicate it). If the app *starts* while the server is down, it shows the last saved data,
  refuses changes that would not reach the database, and reconnects by itself.
* **Session ends** (token expired or removed) – the app returns to the login screen.

## Charts

Hand-built SVG, following a small set of rules: single series = single validated hue (`#237B50` light / `#35A56F`
dark), thin bars with 4 px rounded data ends, hairline solid grid, only the extreme is labelled, crosshair / tooltip on
hover **and** keyboard focus, and a **Table** twin for every chart. Part-to-whole uses ranked bars rather than a pie.

## Accessibility & quality notes

* Labels on every input, `aria-live` toasts (which never block taps), focus-visible rings, ≥ 44 px touch targets,
  `prefers-reduced-motion` support, table-view twins for every chart, keyboard navigation in search and charts.
* Light, dark and auto themes (auto follows the OS live; dark has its own validated chart colours and a darkened map).
* The app shell works offline once loaded over http(s); the map, routing and search of course need the internet
  (the map then says so, and tiles already seen stay in the browser cache for a while).
* Back navigation is deterministic: the in-app Back button pops the app's own screen stack, and the browser / Android
  back button is honoured too (a running journey asks before it can be left).

## How it was tested

Automated checks ran in headless Chrome (Puppeteer) against the real Spring Boot + MySQL backend and against a plain static
server, with the public map services replaced by recorded-style stubs (so the tests are fast and polite to the free
services, and can simulate failures). The scripts were temporary and are not part of the project, so this is a record of
what was checked:

* **Standalone, no backend (79 checks)** – login note and *Use my own server* validation, an empty local account,
  the real map with the blue dot, place search, three different routes with the correct shortest / fastest / eco
  extremes and the shortest preselected, choosing by card and by map line, a demo drive along the real route with a
  summary map and a stored route, History, a Live GPS journey (standing still = 0 m, jitter ignored, a 300 m walk = about
  300 m, weak positions ignored), **leaving the route finds a new one**, arriving completes the journey with the full
  distance, **starting far from the route re-plans from your position**, chargers (listed nearest first, name falls back to
  the operator, "availability isn't live", filters, error with retry, none found / search wider, **a slow server does not hold
  things up: after 8 s a labelled shorter list from Nominatim is shown and the full list replaces it when it arrives**),
  tapping the map to drop a pin, a typed start place, failing routing / search services, no JavaScript errors.
* **Android Back button (23 checks)** – what `window.EcoAppBack` answers on every kind of screen: the intro and login
  screens and Home let the app close, a tab or a screen opened from Home goes back to Home, an open question or bottom sheet is
  closed first, a running journey asks "End this journey?" (and "Keep going" on the next press), the summary goes back to Home.
* **With the backend (44 checks)** – the database upgrade in place, the journeys API (route stored and returned, list never
  carries it, other users get 404, validation, idempotent `clientRef`), CORS for the Android origin and refusal of a
  stranger, Home with the position saved to MySQL, a demo journey and a Live GPS journey saved with their route, start / end and
  linked GPS points, the route fetched from the server after a reload, **Save my location history off** (no coordinates,
  address, route or track stored), and the app served from another address using *Use my own server*.
* **Live services** – runs in Chrome against the real OpenStreetMap tile server, Nominatim, OSRM and Overpass (also used to
  take the screenshots in `assets/images`): tiles, search, routes with real turn instructions and real chargers around
  Pune all worked. The public Overpass servers took 20 – 35 s to answer (some refused), which is what the multi-server,
  8-second backup list and "full list replaces it" logic is for. OSRM returned a single route for every city trip tried.
* **Android emulator (Android 16)** – the APK installs and starts, serves its files from inside the APK, shows the intro and
  creates the local profile, and the Android location dialog hands a GPS fix to the page. On this PC the emulator could
  **not** load the map or search: a security program here re-signs HTTPS traffic with its own certificate, which the emulator
  does not trust, so map, routes and chargers inside the APK have not been seen working on a device (the same code works in
  Chrome, and the services answer with the right CORS headers for the app's address).
* **Not covered by automation:** two-finger pinch zoom, the Java side of the Back button and the screen-on flag on a device,
  a real phone's GPS while moving, traffic, and long-term use of the free services.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL). Map library: [Leaflet](https://leafletjs.com)
(BSD-2). Routing: [OSRM](https://project-osrm.org). Icons: [Lucide](https://lucide.dev) (ISC). Typeface:
[Inter](https://rsms.me/inter/) (SIL OFL 1.1), bundled locally.
