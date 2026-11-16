<#
  Builds the EcoRoute Android app (an .apk file) without Gradle, straight from the Android SDK tools:
  aapt2 (resources) -> javac (the one Activity) -> d8 (dex) -> zipalign -> apksigner.

  Usage (PowerShell, from this folder):
      powershell -ExecutionPolicy Bypass -File .\build.ps1
      powershell -ExecutionPolicy Bypass -File .\build.ps1 -ServerUrl https://my-ecoroute-server.example.com
      powershell -ExecutionPolicy Bypass -File .\build.ps1 -Debug        # inspectable from chrome://inspect (for testing only)

  Result: dist\EcoRoute-<version>.apk  (+ a .sha256 file)

  What goes into the app: the web app from ..\EcoRoute (index.html, css, js, fonts, icons, Leaflet) with js\config.js
  switched to "app: true". -ServerUrl bakes in the address of your EcoRoute backend, so nobody has to type it; without
  it the app keeps everything on the phone and uses the public OpenStreetMap services.

  Needs: the Android SDK (Android Studio installs it; or set ANDROID_HOME) with build-tools and platform android-34 or
  newer, and a JDK (javac, keytool). Signing key: created on the first run in %USERPROFILE%\.ecoroute\ (NOT in this
  repository). Keep that folder safe: updates of the app must be signed with the same key to install over the old one.
#>
param(
    [switch]$Debug,
    [string]$ServerUrl = '',
    [string]$VersionName = '1.0.0',
    [int]$VersionCode = 1,
    [string]$Keystore = ''
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$webSrc = Join-Path (Split-Path $here -Parent) 'EcoRoute'
$build = Join-Path $here 'build'
$dist = Join-Path $here 'dist'
$minSdk = 24
$targetSdk = 34

function Run([string]$exe, [string[]]$arguments) {
    & $exe @arguments
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed with exit code $LASTEXITCODE" }
}
function Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Green }

# ---------- find the tools ----------
$sdk = $null
foreach ($c in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
    if ($c -and (Test-Path (Join-Path $c 'build-tools'))) { $sdk = $c; break }
}
if (-not $sdk) { throw 'Android SDK not found. Install Android Studio, or set ANDROID_HOME to the SDK folder.' }

$bt = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Where-Object { (Test-Path (Join-Path $_.FullName 'aapt2.exe')) -and (Test-Path (Join-Path $_.FullName 'd8.bat')) } |
    Sort-Object { [version]($_.Name -replace '[^\d.].*$', '') } -Descending | Select-Object -First 1
if (-not $bt) { throw 'No usable build-tools found in the Android SDK (need aapt2, d8, zipalign, apksigner).' }
$bt = $bt.FullName

$platforms = Get-ChildItem (Join-Path $sdk 'platforms') -Directory | Where-Object { $_.Name -match '^android-(\d+)$' } |
    ForEach-Object { [pscustomobject]@{ Api = [int]($_.Name -replace '\D', ''); Path = $_.FullName } } | Where-Object { $_.Api -ge $targetSdk } | Sort-Object Api
if (-not $platforms) { throw "Android platform $targetSdk or newer is not installed (SDK Manager -> SDK Platforms)." }
$androidJar = Join-Path (($platforms | Where-Object { $_.Api -eq $targetSdk } | Select-Object -First 1).Path) 'android.jar'
if (-not (Test-Path $androidJar)) { $androidJar = Join-Path $platforms[0].Path 'android.jar' }

$javaBin = if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) { Join-Path $env:JAVA_HOME 'bin' } else { Split-Path (Get-Command javac -ErrorAction Stop).Source }
$javac = Join-Path $javaBin 'javac.exe'
$keytool = Join-Path $javaBin 'keytool.exe'
if (-not (Test-Path $keytool)) {                       # the "javapath" shim folder only has java and javac: look for the real JDK
    $kt = Get-Command keytool -ErrorAction SilentlyContinue
    if ($kt) { $keytool = $kt.Source }
    else {
        $kt = Get-ChildItem 'C:\Program Files\Java', 'C:\Program Files\Eclipse Adoptium', 'C:\Program Files\Microsoft' -Filter keytool.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($kt) { $keytool = $kt.FullName } else { throw 'keytool not found: install a JDK or set JAVA_HOME.' }
    }
}
$aapt2 = Join-Path $bt 'aapt2.exe'
$d8 = Join-Path $bt 'd8.bat'
$zipalign = Join-Path $bt 'zipalign.exe'
$apksigner = Join-Path $bt 'apksigner.bat'
Write-Host "SDK: $sdk`nbuild-tools: $(Split-Path $bt -Leaf)   android.jar: $(Split-Path (Split-Path $androidJar -Parent) -Leaf)   JDK: $javaBin"

# ---------- the web app goes into assets/www ----------
Step 'Copying the web app'
if (-not (Test-Path (Join-Path $webSrc 'index.html'))) { throw "Web app not found at $webSrc" }
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
$www = Join-Path $build 'assets\www'
New-Item -ItemType Directory -Force $www | Out-Null
# not needed inside the app: the service worker (the app is already local), the store screenshots of the PWA manifest, docs
& robocopy $webSrc $www /E /XD images /XF service-worker.js README.md /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

$cfg = [IO.File]::ReadAllText((Join-Path $webSrc 'js\config.js'))
if ($cfg -notmatch 'app:\s*false') { throw 'js\config.js: expected "app: false"' }
$cfg = $cfg -replace 'app:\s*false', 'app: true'
if ($ServerUrl) {
    if ($ServerUrl -notmatch '^https?://[^\s/]+') { throw '-ServerUrl must start with http:// or https://' }
    if ($cfg -notmatch "serverUrl:\s*''") { throw 'js\config.js: expected serverUrl: ''''' }
    $cfg = $cfg -replace "serverUrl:\s*''", ("serverUrl: '" + $ServerUrl.TrimEnd('/') + "'")
    Write-Host "Default server baked in: $($ServerUrl.TrimEnd('/'))"
}
[IO.File]::WriteAllText((Join-Path $www 'js\config.js'), $cfg, (New-Object Text.UTF8Encoding($false)))
Write-Host ("Web app: {0} files, {1:N1} MB" -f (Get-ChildItem $www -Recurse -File).Count, ((Get-ChildItem $www -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))

# ---------- resources + manifest ----------
Step 'Compiling resources (aapt2)'
$resZip = Join-Path $build 'res.zip'
Run $aapt2 @('compile', '--dir', (Join-Path $here 'res'), '-o', $resZip)

Step 'Linking the package (aapt2)'
$base = Join-Path $build 'base.apk'
$linkArgs = @('link', '-o', $base, '-I', $androidJar, '--manifest', (Join-Path $here 'AndroidManifest.xml'),
    '--min-sdk-version', $minSdk, '--target-sdk-version', $targetSdk, '--version-code', $VersionCode, '--version-name', $VersionName,
    $resZip)       # (the web files are added below: aapt2 -A would store their names with Windows back-slashes)
if ($Debug) { $linkArgs += '--debug-mode' }
Run $aapt2 $linkArgs

# ---------- code ----------
Step 'Compiling Java (javac)'
$classes = Join-Path $build 'classes'
New-Item -ItemType Directory -Force $classes | Out-Null
$sources = Get-ChildItem (Join-Path $here 'java') -Recurse -Filter *.java | ForEach-Object { $_.FullName }
Run $javac (@('--release', '11', '-Xlint:-options', '-classpath', $androidJar, '-d', $classes) + $sources)

Step 'Converting to Android bytecode (d8)'
$dex = Join-Path $build 'dex'
New-Item -ItemType Directory -Force $dex | Out-Null
$classFiles = Get-ChildItem $classes -Recurse -Filter *.class | ForEach-Object { $_.FullName }
Run $d8 (@('--release', '--min-api', $minSdk, '--lib', $androidJar, '--output', $dex) + $classFiles)

Step 'Adding classes.dex and the web app (assets/www/...) to the package'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$wwwRoot = (Resolve-Path $www).Path.TrimEnd('\')
$zip = [IO.Compression.ZipFile]::Open($base, [IO.Compression.ZipArchiveMode]::Update)
try {
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $dex 'classes.dex'), 'classes.dex', [IO.Compression.CompressionLevel]::Optimal)
    foreach ($f in Get-ChildItem $www -Recurse -File) {
        $rel = $f.FullName.Substring($wwwRoot.Length).TrimStart('\').Replace('\', '/')       # entry names must use forward slashes
        [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, "assets/www/$rel", [IO.Compression.CompressionLevel]::Optimal)
    }
}
finally { $zip.Dispose() }

# ---------- align + sign ----------
Step 'Aligning (zipalign)'
$aligned = Join-Path $build 'aligned.apk'
Run $zipalign @('-f', '4', $base, $aligned)
Run $zipalign @('-c', '4', $aligned)

Step 'Signing (apksigner)'
$keyDir = Join-Path $env:USERPROFILE '.ecoroute'
if ($Keystore) { $ks = $Keystore; $pwFile = "$Keystore.pass" } else { $ks = Join-Path $keyDir 'ecoroute-release.p12'; $pwFile = Join-Path $keyDir 'keystore.pass' }
if (-not (Test-Path $ks)) {
    if ($Keystore) { throw "Keystore not found: $Keystore (the password goes into $pwFile)" }
    Write-Host "No signing key yet: creating one in $keyDir (outside this repository; back it up!)"
    New-Item -ItemType Directory -Force $keyDir | Out-Null
    $pw = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    [IO.File]::WriteAllText($pwFile, $pw)
    Run $keytool @('-genkeypair', '-keystore', $ks, '-storetype', 'PKCS12', '-alias', 'ecoroute', '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-storepass:file', $pwFile, '-dname', 'CN=EcoRoute, OU=Android, O=EcoRoute, C=IN')
}
if (-not (Test-Path $pwFile)) { throw "Keystore password file not found: $pwFile" }
New-Item -ItemType Directory -Force $dist | Out-Null
$name = if ($Debug) { "EcoRoute-$VersionName-debug.apk" } else { "EcoRoute-$VersionName.apk" }
$out = Join-Path $dist $name
if (Test-Path $out) { Remove-Item $out -Force }
Run $apksigner @('sign', '--ks', $ks, '--ks-key-alias', 'ecoroute', '--ks-pass', "file:$pwFile", '--out', $out, $aligned)
Run $apksigner @('verify', '--verbose', $out)

$hash = (Get-FileHash $out -Algorithm SHA256).Hash.ToLower()
[IO.File]::WriteAllText("$out.sha256", "$hash  $name`n")
Step 'Done'
Write-Host ("{0}`n{1:N2} MB   sha256 {2}" -f $out, ((Get-Item $out).Length / 1MB), $hash)
Write-Host "`nInstall on a phone: copy the .apk to it (WhatsApp / Drive / cable), open it and allow 'install unknown apps' for that app once."
Write-Host "Or with a cable and USB debugging:  adb install -r `"$out`""
