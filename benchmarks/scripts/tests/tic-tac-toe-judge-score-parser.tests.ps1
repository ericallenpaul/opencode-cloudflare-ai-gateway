<#
.SYNOPSIS
  Regression test for labeled tic-tac-toe score text in the functional judge.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..\..")).Path
$specPath = Join-Path $repoRoot "benchmarks\scripts\judge\tests\tic-tac-toe.spec.js"
$source = Get-Content $specPath -Raw -Encoding utf8

$match = [regex]::Match($source, 'function parseScoreText\(text\) \{[\s\S]*?\n\}')
if (-not $match.Success) {
    throw "Expected tic-tac-toe judge to define parseScoreText(text)."
}

if ($source -match 'parseInt\(txt,\s*10\)\s*\|\|\s*0') {
    throw "R7 must not parse labeled score text with parseInt(txt, 10)."
}

$nodeCode = @'
__FUNCTION__
const cases = [
  ['0', 0],
  ['1', 1],
  ['X: 1', 1],
  ['O wins: 12', 12],
  ['Draws: 3', 3],
  ['', 0],
  ['no score', 0],
];
for (const [input, expected] of cases) {
  const actual = parseScoreText(input);
  if (actual !== expected) {
    throw new Error(input + ' parsed as ' + actual + ', expected ' + expected);
  }
}
'@
$nodeCode = $nodeCode.Replace('__FUNCTION__', $match.Value)

& node -e $nodeCode
if ($LASTEXITCODE -ne 0) {
    throw "parseScoreText behavior check failed."
}

Write-Host "PASS tic-tac-toe judge score parser regression" -ForegroundColor Green
