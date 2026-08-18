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
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern='tests/' --testPathIgnorePatterns='template|frontmatter|end-to-end'
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

Write-Host "All passed." -ForegroundColor Green
