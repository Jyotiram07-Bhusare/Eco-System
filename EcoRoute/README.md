# EcoRoute – Smart Eco-Friendly Navigation

**Travel Smarter. Drive Greener. Live Better.**

A complete, mobile-first, installable (PWA) front-end for an eco-friendly route-optimisation app, built with
**only HTML5, CSS3 and vanilla JavaScript**. No frameworks, no build step, no external APIs, no CDNs.
It runs **with the Java + MySQL backend** in [`../EcoRoute-Backend`](../EcoRoute-Backend) (accounts, vehicles, journeys and
your real-time location are saved in a database), or **on its own** with local sample data.

> **The city is simulated.** The map, routes, travel times, charging-station availability and CO₂ figures are
> realistic *sample data*. The app never claims real routing, live charger availability or measured emissions, and
> the UI labels simulated content ("Simulated map", "Sample data").
>
> **Your location is real.** Home shows where your device is (the browser's Geolocation API: street address,
> coordinates, accuracy, live updates). During a journey the vehicle moves only when *you* move (**Live GPS**, the
> default) or, on a PC without GPS, while you hold the **Demo drive** button. Nothing ever moves by itself.
> With the backend, positions are saved to *your own* MySQL database while **Save my location history** is on (Profile),
> and the street address is looked up by the server. Without the backend nothing is stored or sent anywhere.

---

## Run it

### With the backend (recommended)

```bash
cd EcoRoute-Backend
start.cmd              # Windows   (macOS / Linux: ./start.sh)
# open http://localhost:8090
```

Needs JDK 21+ and MySQL on `localhost:3306` (your MySQL password goes into the git-ignored `config/application.properties`); see
[`../EcoRoute-Backend/README.md`](../EcoRoute-Backend/README.md). The backend serves this front-end too, so there is
nothing else to start, and `http://localhost` lets the browser share your location.

Sign in with **Continue with demo account** (`alex.morgan@example.com` / `Demo@1234`) or **Register** a real account
(8+ characters, letters and a number): the password is stored as a BCrypt hash in MySQL.

### Without a backend (local sample data only)

Any static file server works. The service worker (offline / install) needs `http://localhost` or HTTPS:

```bash
cd EcoRoute
python -m http.server 8080        # or: npx serve .   /   VS Code "Live Server"
# open http://localhost:8080
```

You can also just double-click `index.html` (`file://`): the whole app works, only the service worker (offline
cache + install prompt) is skipped. The app notices that no backend answers and falls back to the local demo:
**Continue with demo account**, or register with any valid email; nothing leaves the browser.

**On Android:** open the served URL in Chrome → menu → *Install app* / *Add to Home screen*.
**On desktop:** the app is shown inside a centred phone-sized frame (it is a mobile app, not a website).

---

## The 14 screens

| # | Screen | Highlights |
|---|--------|-----------|
| 1 | Splash | Logo, name, *Travel Smarter. Drive Greener.*, animated loader |
| 2 | Onboarding | 3 swipeable slides: Find Smart Routes · Reduce Carbon Emissions · Discover EV Charging Stations |
| 3 | Login / Register | Validation, password strength meter, show/hide password, **Forgot password** sheet |
| 4 | Home | Greeting, profile + notifications, **live location card** (address, coordinates, accuracy), **destination search**, vehicle + battery, **Find Eco Route**, impact summary (distance, CO₂, Eco Score), recent journeys |
| 5 | Vehicle selection | 5 selectable types (Petrol Bike, Petrol Car, Diesel Car, Electric Bike, Electric Car) + saved garage |
| 6 | Add vehicle | Company, model, fuel type, mileage, battery capacity (EV), estimated range, live emissions preview |
| 7 | Route planner (Explore) | Pannable / pinch-zoomable map, tap-a-pin destinations, search, vehicle, battery, **Find Route** |
| 8 | Route comparison | 3 routes with distance, time, CO₂, Eco Score, **Shortest** / **Eco-Friendly** / Fastest badges, **Select Route** |
| 9 | Live navigation | Large map, route line, vehicle + destination + EV charger markers, travelled / remaining / ETA / CO₂, **Start · Pause · Resume · End Journey** |
| 10 | EV charging finder | Map + list, connector type, power, sample availability, battery %, filters, **Navigate** |
| 11 | Journey summary | From → To, distance, duration, CO₂, carbon saved, Eco Score, completion status, "Saved to database" and (Live GPS journeys) the **route your device recorded** |
| 12 | Journey history | Grouped by day, vehicle filter, per-journey details |
| 13 | Eco analytics | Weekly / monthly charts (bars, trend line, ranked vehicle emissions), table views, monthly goal |
| 14 | Profile & settings | Edit profile, saved vehicles, light / dark / auto theme, notification toggles, **privacy & data** (save location history on/off, delete location history, delete account), install, about, reset, logout |

A fixed bottom navigation (Home · Explore · Charging · History · Profile) with green active icons and animated
screen transitions ties them together. Browser / Android **back** works (history API) and a running journey
cannot be left accidentally.

---

## Folder structure

```
EcoRoute/
├── index.html                 all 14 screens + bottom nav + overlay roots
├── manifest.json              PWA manifest (192/512/maskable icons)
├── service-worker.js          offline app-shell cache (stale-while-revalidate; never touches /api/)
├── css/
│   ├── style.css              design tokens (light + dark), layout, components, per-screen styles
│   ├── responsive.css         phone frame on desktop, small phones, short screens, landscape
│   └── animations.css         transitions, splash, rings, chart motion (respects reduced-motion)
├── js/
│   ├── icons.js               inline Lucide icons (bundled, offline)           [support]
│   ├── data.js                places, vehicle types, stations, emission maths  [support]
│   ├── ui.js                  toast, confirm dialog, bottom sheet, rings…      [support]
│   ├── app.js                 store (localStorage + server data), theme, stats, PWA, boot
│   ├── api.js                 backend connection: token, requests, settings sync, journey outbox [support]
│   ├── location.js            real-time device location (shared Geolocation stream, address, saving) [support]
│   ├── map.js                 route geometry + pan/zoom SVG map engine         [support]
│   ├── navigation.js          screen router, transitions, back-button guard
│   ├── auth.js                splash, onboarding, login/register (server or local demo), forgot password
│   ├── dashboard.js           Home (live location card)
│   ├── vehicles.js            vehicle selection + add vehicle + battery state
│   ├── routes.js              destination search, planner, route comparison
│   ├── tracking.js            live navigation (GPS / demo drive) + journey summary
│   ├── charging.js            EV charging finder
│   ├── analytics.js           history + analytics charts
│   └── profile.js             profile & settings
└── assets/
    ├── logo/                  logo.svg, logo-mark.svg
    ├── icons/                 PNG app icons, maskable icon, favicon
    ├── images/                install-dialog screenshots referenced by the manifest
    └── fonts/                 Inter (variable, latin) + licence
```

Files marked *[support]* are small shared modules added to the requested structure to keep each feature file focused.
Scripts are plain `<script>` tags sharing one `Eco` namespace (no ES-module loader), so the app also opens from `file://`.

---

## How the simulation works

* **Map** – a stylised, fictional city drawn as SVG (roads, blocks, parks, river, lake). Places sit on road
  intersections. Pan, pinch / wheel zoom, double-tap zoom, tap pins.
* **Routes** – three axis-aligned route variants are generated between any two places (Z-shaped *shortest*,
  ring-road *fastest*, green-corridor *eco*). Distance, time and CO₂ are derived from the geometry, a per-route
  speed and a "flow" factor (steady driving emits less than stop-and-go).
* **CO₂** – fuel vehicles: `2310 g (petrol) / 2680 g (diesel) ÷ km-per-litre`; EVs: `battery kWh ÷ range × 0.45 g/Wh`.
  **Eco Score** = `100 − g/km ÷ 3.2` (clamped). **Carbon saved** is measured against an average petrol car (170 g/km).
* **Live journey** – two movement sources, switched with the **GPS / DEMO** chip on the navigation screen:
  * **GPS (default):** the browser's Geolocation API reports your position; the real distance you move (× the scale
    chip: 1×, 5×, 10×, 20×) advances the vehicle along the route. Standing still adds nothing, GPS wobble inside the
    accuracy radius is ignored, and fixes worse than ±30 m (typical on a PC) are ignored with a "Weak GPS signal"
    message. Speed, CO₂ and battery drain follow the distance actually moved. Pausing ignores movement.
    *Location needs HTTPS or `http://localhost` and your permission.* To try it on a phone: serve over HTTPS, or use
    Chrome remote debugging (`chrome://inspect` → port forwarding → open `http://localhost:8090` on the phone).
    The position stream is shared with the Home card (`js/location.js`); with the backend, the positions of a Live GPS
    journey are saved and linked to the journey, so its summary can draw the route the device really recorded.
  * **DEMO:** hold the drive button (or the ↑ key) and the vehicle drives at the route's pace; let go and it stops. The
    scale chip (5×, 10×, 20×, 40×) is how much faster than real time it covers ground while held.
  CO₂ and battery drain follow the distance moved, and a journey needs at least 300 m to be recorded.
* **History** – ~130 sample journeys (about five months, 0–3 trips a day) are generated once (deterministic seed) so Home, History, Analytics and Profile
  always agree. Finished journeys are appended. *Profile → Reset demo data* restores the samples.
* **Persistence** – with the backend, everything lives in MySQL (see below) and `localStorage` only keeps the login
  token and a cached copy. Without it, `localStorage` holds user, vehicles, battery, settings and journeys; no credentials are stored.

## Backend mode

At start-up the app asks `GET api/health`. If the EcoRoute backend answers, the app uses it; if not, it runs the local demo
(a plain static server answers 404 once, which is harmless).

* **Sign in** – the server checks the BCrypt hash and returns a token; the browser keeps only the token (`localStorage`)
  and the whole account arrives in one request (`GET api/bootstrap`).
* **Saved as you go** – vehicles, profile edits, journeys and *Clear history* are written to the database straight away;
  settings (theme, notifications, goal, battery, active vehicle, movement mode) are synced a moment after each change.
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
* Light, dark and auto themes (auto follows the OS live; dark has its own validated chart/map colours).
* Works offline once loaded over http(s), and also when `index.html` is simply opened from disk.
* Back navigation is deterministic: the in-app Back button pops the app's own screen stack, and the browser / Android
  back button is honoured too (a running journey asks before it can be left).

## How it was tested

Automated checks were run in headless Chrome (Puppeteer), plus a manual look at screenshots of every screen in light
and dark mode. The scripts were temporary and are not part of the project, so this is a record of what was checked:

**With the backend (real browser + Spring Boot + MySQL, 188 checks)**
* **Accounts** – register / login through the UI, wrong password, duplicate e-mail, a weak password refused by the
  server itself, BCrypt hash and hashed token in MySQL (never the password in the browser), login after clearing the
  browser, logout removes the token row, delete account (a wrong password keeps you signed in; the right one cascades),
  a made-up or removed token ends at the login screen.
* **Location** – live card on Home (accuracy, *Live* / *Approx.*, address looked up by the server), positions saved to
  `location_points` and `users.last_*`, refresh button, blocked permission, "position unavailable", no geolocation
  support, **Save my location history off** (nothing stored, no address, journeys saved without coordinates),
  delete location history.
* **Journeys** – Live GPS journey (20× distance scale) saved with start / end / address, its positions linked, EV battery
  saved, summary draws the recorded route, History and reload, server unreachable → outbox → saved later without a
  duplicate, session ending while running or while saving → journey kept and saved after signing in again, one account
  never sends another's queued journey, one user cannot read another user's track.
* **Data** – vehicles added / removed in MySQL, settings synced, sample data reset, clear history, charging refresh,
  server unreachable at start-up (last saved data, changes refused, automatic reconnect).

**Without the backend (the original app, plain static server)** – the earlier suites, re-run on the final code:
* **Flows** – onboarding → registration/login validation → destination search → route comparison (shortest route
  pre-selected, switching by card or map line) → live journey (start / pause / resume / end early / arrive) → summary →
  history → analytics (hover, table view, goal) → charging filters & battery input → planner → vehicles (select /
  add / delete) → profile (edit, theme, notifications) → logout.
* **Movement** – with Chrome's geolocation emulation: standing still gives exactly 0 m / 0 km/h / 0 g, GPS wobble of a
  few metres is ignored, real movement advances the vehicle, stopping brings speed back to 0, movement while paused
  is ignored, weak (±500 m) positions are ignored, and a denied permission offers the demo drive. In demo mode nothing
  moves until the drive button (or ↑) is held.
* **Sizes** – 320×568, 360×640, 360×800, 390×844, 412×915, 430×932, tablet 768×1024, desktop 1280×800 and landscape
  844×390: every screen was checked for horizontal overflow, spilled elements and clipped text.
* **PWA** – service worker registers and controls the page, the 31-file app shell is precached (API calls are never
  cached), the app reloads offline, and Chrome reports no installability errors for the manifest.
* **Edge cases** – blocked `localStorage`, opening from `file://`, OS dark-mode switching, reduced motion, swipe and
  drag gestures on onboarding and the map, wheel and button zoom. (Two-finger pinch-zoom is implemented but was not
  exercised by an automated gesture, so try it on a real touch device.)

## Credits

Icons: [Lucide](https://lucide.dev) (ISC). Typeface: [Inter](https://rsms.me/inter/) (SIL OFL 1.1), bundled locally.
