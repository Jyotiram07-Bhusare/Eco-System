/* ==========================================================================
   EcoRoute - config.js
   Settings that differ between "the web app served by the backend", "a plain static copy" and the
   Android app. The Android build replaces this file; everything else is the same code.

   serverUrl : '' = no remote server (same-origin backend if there is one, otherwise the local demo).
               'https://your-server' = use that EcoRoute backend (accounts and data in its MySQL database).
               The user can also type a server address on the login screen ("Use my own server").
   The map, routing, search and charger services below are free public OpenStreetMap services. They are fine for a
   demo; for real traffic use your own tile / routing server or a commercial provider and put its URLs here.
   ========================================================================== */
window.ECOROUTE_CONFIG = {
  app: false,
  serverUrl: '',
  tiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  routers: ['https://routing.openstreetmap.de/routed-car', 'https://router.project-osrm.org'],
  nominatim: 'https://nominatim.openstreetmap.org',
  overpass: [
    'https://overpass.openstreetmap.fr/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ]
};
