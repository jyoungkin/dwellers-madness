$VENV_PYTHON = "C:\Users\JohnYoungkin\Downloads\NCAA tourney predictor\.venv\Scripts\python.exe"
$PREDICTOR_DIR = "C:\Users\JohnYoungkin\Downloads\NCAA tourney predictor"
$SCRIPTS_DIR = $PSScriptRoot

if (-not (Test-Path $VENV_PYTHON)) {
    Write-Host "ERROR: venv not found at $VENV_PYTHON" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 1 of 3 - Fetch real bracket from ESPN" -ForegroundColor Cyan
Push-Location $PREDICTOR_DIR
& $VENV_PYTHON fetch_real_bracket.py
Pop-Location

Write-Host ""
Write-Host "Step 2 of 3 - Fetch player stats from ESPN" -ForegroundColor Cyan
Push-Location $PREDICTOR_DIR
& $VENV_PYTHON fetch_players.py
Pop-Location

Write-Host ""
Write-Host "Step 3 of 3 - Seed Supabase players table" -ForegroundColor Cyan
& $VENV_PYTHON "$SCRIPTS_DIR\seed_players.py"

Write-Host ""
if ($LASTEXITCODE -eq 0) {
    Write-Host "All done!" -ForegroundColor Green
} else {
    Write-Host "Seed step failed - check the error above." -ForegroundColor Red
}
