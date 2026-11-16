@echo off
rem ---------------------------------------------------------------------------
rem EcoRoute: starts the backend (and the app it serves) on http://localhost:8090
rem   First run builds the jar (needs internet once). Later runs start straight away.
rem   Change the port or database with environment variables, e.g.:  set PORT=9000
rem ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

rem The MySQL password is kept out of git: it lives in config\application.properties (or the DB_PASSWORD variable).
if not exist "config\application.properties" if "%DB_PASSWORD%"=="" (
  echo No MySQL password is configured yet.
  echo Copy config\application.example.properties to config\application.properties, put your MySQL password in it,
  echo then run start.cmd again. ^(Or set the DB_PASSWORD environment variable.^)
  exit /b 1
)

if not exist "target\ecoroute-backend-1.0.0.jar" (
  echo First run: building the backend. This needs internet once and takes about a minute...
  rem Some Windows JDKs do not trust the certificates Maven Central uses; this makes Maven use the Windows certificate store.
  set "MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT %MAVEN_OPTS%"
  call mvnw.cmd -B -q -DskipTests package
  if errorlevel 1 (
    echo.
    echo The build failed. See README.md, section Troubleshooting.
    exit /b 1
  )
)

if "%PORT%"=="" set "PORT=8090"
echo Starting EcoRoute on http://localhost:%PORT%  ^(press Ctrl+C to stop^)
java -jar "target\ecoroute-backend-1.0.0.jar" %*
