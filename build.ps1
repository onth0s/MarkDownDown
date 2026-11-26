#!/usr/bin/env pwsh
param(
  [Alias("lip")]
  [switch]$LetItRip
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($LetItRip) {
  Write-Host ">>> LET IT RIP MODE (-lip) - Maximum Speed <<<" -ForegroundColor Magenta
}

Write-Host "Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

if (-not $LetItRip) {
  Write-Host "Linting..." -ForegroundColor Cyan
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw "Lint failed" }

  Write-Host "Typechecking..." -ForegroundColor Cyan
  npm run typecheck:all
  if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }
} else {
  Write-Host "Skipping lint and typecheck (--LetItRip)..." -ForegroundColor Yellow
}

Write-Host "Testing..." -ForegroundColor Cyan
if ($LetItRip) {
  node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='tests/' --maxWorkers=50%
} else {
  node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='tests/'
}
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

Write-Host "Regenerating index.html and showcase.html..." -ForegroundColor Cyan
node dist/cli.cjs .\README.md --single -o .\index.html -F
if ($LASTEXITCODE -ne 0) { throw "index.html generation failed" }
node dist/cli.cjs .\showcase\showcase.mdd --single -o .\showcase\showcase.html -F
if ($LASTEXITCODE -ne 0) { throw "showcase.html generation failed" }

Write-Host "All passed." -ForegroundColor Green
Write-Host "Done." -ForegroundColor Green

if (-not $LetItRip -and [Environment]::UserInteractive) {
  Read-Host -Prompt "Press Enter to close this window"
}
