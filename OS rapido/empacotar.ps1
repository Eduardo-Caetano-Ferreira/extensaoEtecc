# Gera as duas versões da extensão em .\dist
#   dist\chromium  -> Chrome, Edge, Opera, Brave, Vivaldi, Arc (e outros baseados em Chromium)
#   dist\firefox   -> Firefox 128+
# e os respectivos .zip. Uso:  powershell -ExecutionPolicy Bypass -File .\empacotar.ps1
$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $raiz "extensao"
$dist = Join-Path $raiz "dist"

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory -Path $dist | Out-Null

function Copiar($destino) {
  New-Item -ItemType Directory -Path $destino | Out-Null
  Get-ChildItem $src -Force | Where-Object { $_.Name -ne "logo.png" } | Copy-Item -Destination $destino -Recurse -Force
}

$manifest = Get-Content (Join-Path $src "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json

# --- Chromium (manifest como está) ---
$chromium = Join-Path $dist "chromium"
Copiar $chromium

# --- Firefox (sem chaves exclusivas do Chromium; com o id exigido pelo Firefox) ---
$firefox = Join-Path $dist "firefox"
Copiar $firefox
$mf = $manifest | ConvertTo-Json -Depth 20 | ConvertFrom-Json
$mf.PSObject.Properties.Remove("minimum_chrome_version")
$mf | Add-Member -NotePropertyName "browser_specific_settings" -NotePropertyValue ([pscustomobject]@{
  gecko = [pscustomobject]@{ id = "os-rapido@etecc.local"; strict_min_version = "128.0" }
})
$mf | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $firefox "manifest.json") -Encoding UTF8

foreach ($nome in "chromium", "firefox") {
  $zip = Join-Path $dist "os-rapido-$nome.zip"
  Compress-Archive -Path (Join-Path (Join-Path $dist $nome) "*") -DestinationPath $zip -Force
  Write-Host ("OK  " + $zip)
}
