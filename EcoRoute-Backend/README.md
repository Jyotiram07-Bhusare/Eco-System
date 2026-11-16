# EcoRoute backend

Java + XML backend for the EcoRoute app: **Spring Boot 3.5**, **MyBatis with XML mapper files**, **MySQL 8**.
It stores accounts, vehicles, journeys, charging stations and the **real-time location** of the user, and it
**serves the front-end too** (`../EcoRoute`), so the whole app is one address: **http://localhost:8090**.

```
 Browser (EcoRoute PWA) ──►  Spring Boot  ──►  MySQL  (database "ecoroute")
   Geolocation API              /api/...          users, vehicles, journeys, location_points ...
                                │
                                └──►  OpenStreetMap Nominatim   (street address for a position; optional, cached)
```

## Run it

You need: **JDK 21 or newer** and **MySQL** running on `localhost:3306`.
First time only: copy `config/application.example.properties` to `config/application.properties` and put your MySQL user and
password in it. That file is git-ignored, so the password never reaches the repository.
The database `ecoroute` is created automatically; nothing else on the MySQL server is touched.

| Windows | macOS / Linux |
|---|---|
| double-click or run `start.cmd` | `./start.sh` |

Then open **http://localhost:8090**. The first run builds the jar (internet needed once, about a minute).

* **Demo account:** press **Continue with demo account** on the login screen
  (`alex.morgan@example.com` / `Demo@1234`, with 3 vehicles and about 115 sample journeys).
* **Your own account:** use the **Register** tab. Passwords are stored as BCrypt hashes.
* Allow **location** when the browser asks. It works on `http://localhost` and on `https://` addresses only.

Manual commands, if you prefer (run them inside the `EcoRoute-Backend` folder, because the front-end path
`../EcoRoute` is relative to it): `mvnw.cmd package` then `java -jar target\ecoroute-backend-1.0.0.jar`,
or `mvnw.cmd spring-boot:run` while developing. Tests: `mvnw.cmd test`.

## Settings (environment variables)

Defaults are in [`src/main/resources/application.properties`](src/main/resources/application.properties).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8090` | HTTP port (8080 is often used by other software) |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | MySQL server |
| `DB_NAME` | `ecoroute` | Database name (created if missing) |
| `DB_USER` / `DB_PASSWORD` | `root` / (none) | MySQL login (or set `spring.datasource.*` in `config/application.properties`) |
| `ECOROUTE_FRONTEND` | `../EcoRoute` | Folder with the front-end files that are served |
| `GEOCODING_ENABLED` | `true` | `false` = never contact OpenStreetMap; the app then shows coordinates instead of an address |

Any other property can be overridden the same way (Spring "relaxed binding"), for example
`ECOROUTE_DEMO_ENABLED=false` (no demo account) or `ECOROUTE_LOCATION_RETENTION_DAYS=30`.

## What is stored (MySQL tables)

| Table | Content |
|---|---|
| `users`, `user_settings` | account, BCrypt password hash, profile, theme / notifications / goal / battery / active vehicle, "save my location history" switch, last known position |
| `auth_tokens` | one row per signed-in device; only the **SHA-256 hash** of the token is stored; 30-day expiry |
| `vehicles` | the user's garage (CO₂ per km is computed on the server) |
| `journeys` | finished journeys (distance, duration, CO₂, saved CO₂, Eco Score, start / end position and address) |
| `location_points` | recorded GPS positions (latitude, longitude, accuracy, speed, heading, time); the ones recorded during a Live GPS journey are linked to it |
| `charging_stations` | the 12 sample EV stations (availability is simulated) |
| `geocode_cache` | addresses already looked up (about 100 m grid), so the same place is never asked twice |

Times are stored in UTC. Deleting a user removes everything that belongs to them (`ON DELETE CASCADE`).

## API

JSON over HTTP. Everything except the first group needs the header `Authorization: Bearer <token>`.
Errors look like `{ "error": "validation", "message": "...", "fields": { "email": "..." } }`.

| | |
|---|---|
| `GET /api/health` | status of the server and the database (public) |
| `POST /api/auth/register`, `/login`, `/forgot` | create account / sign in (returns the token) / password reset stub (public) |
| `POST /api/auth/logout` | ends this device's session |
| `GET /api/bootstrap` | user, settings, vehicles, journeys and stations in one request (used at start-up) |
| `GET` / `PUT /api/me`, `PUT /api/me/settings` | profile and settings |
| `POST /api/me/sample-data` | replace vehicles and journeys with the sample set |
| `DELETE /api/me/location-history` | delete every saved GPS position |
| `DELETE /api/me` | delete the account (body: `{ "password": "..." }`) |
| `GET` / `POST /api/vehicles`, `DELETE /api/vehicles/{id}` | garage |
| `GET` / `POST /api/journeys`, `DELETE /api/journeys`, `GET /api/journeys/{id}/track` | journeys and the recorded route of one |
| `POST /api/location/pings`, `GET /api/location/last` | real-time location: batches of positions in, latest position out |
| `GET /api/geo/reverse?lat=&lon=` | street address for a position |
| `GET /api/stations`, `POST /api/stations/refresh` | charging stations |

## How location works, and what leaves your computer

1. The browser asks the device for its position (Geolocation API) and shows it on **Home**
   (address, coordinates, accuracy, "Live").
2. While **Save my location history** (Profile → Privacy & data) is **on**, positions are sent to *your own* server
   in small batches and stored in MySQL. When it is **off** the app sends no position, address or route to the
   server (journeys are still saved, just without coordinates), and the server refuses to store location pings.
3. The **server** (not the browser) looks the street address up at **OpenStreetMap Nominatim**: only the
   coordinates are sent, results are cached, and calls are limited to about one per second.
   Set `GEOCODING_ENABLED=false` to turn this off completely.
4. Positions older than 90 days are removed every night. **Delete location history** and **Delete my account**
   in Profile remove them on demand.

The city map, routes and charging availability in the app are still a simulated city; only the position,
accounts, vehicles and journeys are real data.

## Security notes

* Passwords: BCrypt. Login tokens: 256-bit random, stored only as a hash. After 6 failed logins for the same
  email and address, further attempts are refused for 15 minutes.
* Every query is a parameterised MyBatis statement; every request body is validated on the server;
  every record is looked up by the signed-in user's id (nobody can read another user's journeys or track).
* The app runs on plain HTTP on `localhost`, which is fine on your own computer. To use it from other devices
  put it behind HTTPS (a reverse proxy); browsers only share location on `https://` or `localhost`.
* There is no e-mail service, so **Forgot password** only shows the screen flow; resetting a password is not implemented.

## Project layout

```
pom.xml                          Maven build (XML)
src/main/resources/
  application.properties         settings
  schema.sql                     tables (created on start, safe to re-run)
  logback-spring.xml             logging (XML)
  mapper/*.xml                   MyBatis mapper files: all SQL lives here
src/main/java/com/ecoroute/
  auth  user  vehicle  journey  location  station  geo  bootstrap  health  demo   one package per feature
  config  common                 shared configuration, errors, helpers
src/test/java/...                unit tests
```

## Troubleshooting

* **`Communications link failure` / `Access denied for user`**: MySQL is not running on `DB_HOST:DB_PORT`, or the
  user / password differ. Set `DB_USER` and `DB_PASSWORD`.
* **`Port 8090 was already in use`**: set another port, e.g. `set PORT=9000` (Windows) or `PORT=9000 ./start.sh`.
* **`PKIX path building failed` while building**: this JDK does not trust the certificates of Maven Central.
  `start.cmd` already works around it; by hand use
  `set MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT` before `mvnw.cmd`.
  (The server's own address lookup already trusts the Windows certificate store.)
* **The address shows as coordinates**: the server could not reach OpenStreetMap (offline, firewall, or
  `GEOCODING_ENABLED=false`). Everything else keeps working.
* **You still see the old app without accounts / database**: if you opened EcoRoute on the same address
  (`http://localhost:8090`) before, the browser keeps an old offline copy. Press **Ctrl+Shift+R** once
  (or: browser menu → site settings → clear data for localhost).
* **"Location is blocked"** in the app: allow location for the site in the browser's address-bar settings, then press refresh on the Home card.
* **Desktop browsers give a rough position** (Wi-Fi / IP based, sometimes kilometres off). The Home card shows the
  accuracy; a phone with GPS is much more precise.
