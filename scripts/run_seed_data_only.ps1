# Run ONLY fetch_players + seed_players (skip bracket fetch).
# Use this to test St. John's, name variants, and First Four with your EXISTING bracket.
# Does not overwrite bracket_2026.json.

$VENV_PYTHON = "C:\Users\JohnYoungkin\Downloads\NCAA tourney predictor\.venv\Scripts\python.exe"
$PREDICTOR_DIR = "C:\Users\JohnYoungkin\Downloads\NCAA tourney predictor"
$SCRIPTS_DIR = $PSScriptRoot

if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "ERROR: venv not found at $VENV_PYTHON" -ForegroundColor Red
    exit 1
}

$playerStats = "$PREDICTOR_DIR\data\player_stats.csv"
$partialCache = "$PREDICTOR_DIR\data\player_stats_partial.csv"

Write-Host ""
Write-Host "Data-only seed (skipping bracket fetch)" -ForegroundColor Yellow
Write-Host "  Using existing: $PREDICTOR_DIR\data\bracket_2026.json" -ForegroundColor Gray
Write-Host ""

# Clear caches so we re-fetch with new name mappings
if (Test-Path $playerStats) {
    Remove-Item $playerStats -Force
    Write-Host "Cleared player_stats.csv (will re-fetch)" -ForegroundColor Cyan
}
if (Test-Path $partialCache) {
    Remove-Item $partialCache -Force
    Write-Host "Cleared player_stats_partial.csv" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Step 1 of 2 - Fetch player stats from ESPN" -ForegroundColor Cyan
Push-Location $PREDICTOR_DIR
& $VENV_PYTHON fetch_players.py
$fetchExit = $LASTEXITCODE
Pop-Location

if ($fetchExit -ne 0) {
    Write-Host "Fetch failed." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 2 of 2 - Seed Supabase players table" -ForegroundColor Cyan
& $VENV_PYTHON "$SCRIPTS_DIR\seed_players.py"

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "Done! Check Supabase for St. John's and other teams." -ForegroundColor Green
} else {
    Write-Host "Seed step failed." -ForegroundColor Red
}
