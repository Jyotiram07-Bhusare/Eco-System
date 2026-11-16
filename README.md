# Eco-System

Two folders make one app:

| Folder | What it is |
|---|---|
| [`EcoRoute-Backend`](EcoRoute-Backend) | Java 21+ / Spring Boot / MyBatis (XML mappers) / **MySQL** backend. It also serves the front-end. |
| [`EcoRoute`](EcoRoute) | The mobile-first PWA (HTML, CSS, vanilla JavaScript). Also runs alone with local sample data. |

## Start it

```
cd EcoRoute-Backend
start.cmd              (macOS / Linux: ./start.sh)
```

Then open **http://localhost:8090** and use **Continue with demo account**, or register your own account.
You need JDK 21+ and MySQL on `localhost:3306`. Put your MySQL password in `EcoRoute-Backend/config/application.properties` (copy the `.example` file next to it; it is git-ignored). The database `ecoroute` is created for you.

Details: [`EcoRoute-Backend/README.md`](EcoRoute-Backend/README.md) (run, settings, API, privacy, troubleshooting)
and [`EcoRoute/README.md`](EcoRoute/README.md) (screens, how the simulation and the real location work).
