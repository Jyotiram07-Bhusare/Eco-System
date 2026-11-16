#!/usr/bin/env sh
# EcoRoute: starts the backend (and the app it serves) on http://localhost:8090
#   First run builds the jar (needs internet once). Later runs start straight away.
#   Change the port or database with environment variables, e.g.:  PORT=9000 ./start.sh
cd "$(dirname "$0")" || exit 1

# The MySQL password is kept out of git: it lives in config/application.properties (or the DB_PASSWORD variable).
if [ ! -f config/application.properties ] && [ -z "${DB_PASSWORD+x}" ]; then
  echo "No MySQL password is configured yet."
  echo "Copy config/application.example.properties to config/application.properties, put your MySQL password in it,"
  echo "then run ./start.sh again. (Or set the DB_PASSWORD environment variable.)"
  exit 1
fi

JAR="target/ecoroute-backend-1.0.0.jar"
if [ ! -f "$JAR" ]; then
  echo "First run: building the backend. This needs internet once and takes about a minute..."
  ./mvnw -B -q -DskipTests package || { echo "The build failed. See README.md, section Troubleshooting."; exit 1; }
fi

echo "Starting EcoRoute on http://localhost:${PORT:-8090}  (press Ctrl+C to stop)"
exec java -jar "$JAR" "$@"
