#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

Write-Host "Linting..." -ForegroundColor Cyan
npm run lint
if ($LASTEXITCODE -ne 0) { throw "Lint failed" }

Write-Host "Typechecking..." -ForegroundColor Cyan
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }

Write-Host "Testing..." -ForegroundColor Cyan
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='tests/'
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

Write-Host "All passed." -ForegroundColor Green

Write-Host "Compiling scratch..." -ForegroundColor Cyan
$mddFiles = Get-ChildItem -Path "$PSScriptRoot\scratch" -Filter '*.mdd' -File -ErrorAction SilentlyContinue
foreach ($f in $mddFiles) {
  $out = [IO.Path]::ChangeExtension($f.FullName, '.html')
  Write-Host "  $($f.Name) -> $([IO.Path]::GetFileName($out))" -ForegroundColor DarkCyan
  node "$PSScriptRoot\dist\cli.cjs" $f.FullName --single -o $out
}

Write-Host "Done." -ForegroundColor Green
