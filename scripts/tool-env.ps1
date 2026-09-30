# Shared locator for the portable JDK 21 and Maven used by the Chippy scripts.
$root = Split-Path -Parent $PSScriptRoot
$tools = Join-Path $root '.tools'

function Expand-ZipOnce($zipName, $markerFile) {
    $zip = Join-Path $tools $zipName
    if (-not (Test-Path $zip)) { return }
    $found = Get-ChildItem -Path $tools -Recurse -Filter $markerFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return }
    Expand-Archive -Path $zip -DestinationPath $tools -Force
}

Expand-ZipOnce 'jdk21.zip' 'javac.exe'
Expand-ZipOnce 'maven.zip' 'mvn.cmd'

function Test-NodeReady {
    $raw = $null
    try { $raw = & node -p "process.versions.node" 2>$null } catch { return $false }
    if (-not $raw) { return $false }
    $parts = "$raw".Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    if ($major -ge 26) { return $true }
    if ($major -eq 24 -and $minor -ge 15) { return $true }
    if ($major -eq 22 -and $minor -ge 22) { return $true }
    return $false
}

if (-not (Test-NodeReady)) {
    $nodeZip = Join-Path $tools 'node.zip'
    if (-not (Test-Path $nodeZip)) {
        New-Item -ItemType Directory -Force -Path $tools | Out-Null
        Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.21.0/node-v24.21.0-win-x64.zip' -OutFile $nodeZip
    }
    Expand-ZipOnce 'node.zip' 'node.exe'
}

$javac = Get-ChildItem -Path $tools -Recurse -Filter 'javac.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$mvn = Get-ChildItem -Path $tools -Recurse -Filter 'mvn.cmd' -ErrorAction SilentlyContinue | Select-Object -First 1

if ($javac) {
    $env:JAVA_HOME = Split-Path -Parent (Split-Path -Parent $javac.FullName)
    $env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$env:Path"
}
if ($mvn) {
    $env:Path = "$(Split-Path -Parent $mvn.FullName);$env:Path"
}
$node = Get-ChildItem -Path $tools -Recurse -Filter 'node.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($node -and -not (Test-NodeReady)) {
    $env:Path = "$($node.DirectoryName);$env:Path"
}

Set-Location $root
