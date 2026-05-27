<#
.SYNOPSIS
  Installs an idempotent PowerShell profile hook that keeps OPENCODE_APP_TAG
  aligned to the nearest git-root basename.

.DESCRIPTION
  Writes a marked block into the current user's PowerShell profile. The block:
  - defines Get-OpencodeAppTag
  - updates OPENCODE_APP_TAG once for the current shell
  - registers LocationChangedAction so future `cd` operations keep the tag current

  Safe to run multiple times. If the managed block already exists, the script
  leaves the profile unchanged and just refreshes OPENCODE_APP_TAG in the
  current process.

.EXAMPLE
  .\install-opencode-app-tag.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$profilePath = $PROFILE
$profileDir = Split-Path -Parent $profilePath

if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $profilePath)) {
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
}

$beginMarker = "# >>> opencode-app-tag >>>"
$endMarker = "# <<< opencode-app-tag <<<"

$managedBlock = @'
# >>> opencode-app-tag >>>
function Get-OpencodeAppTag {
    $p = $PWD.Path
    while ($p -and $p -ne (Split-Path $p -Parent)) {
        if (Test-Path -LiteralPath (Join-Path $p ".git")) {
            return Split-Path -Leaf $p
        }
        $p = Split-Path $p -Parent
    }
    return Split-Path -Leaf $PWD.Path
}

function Update-OpencodeAppTag {
    $env:OPENCODE_APP_TAG = Get-OpencodeAppTag
}

$invokeCommand = $ExecutionContext.SessionState.InvokeCommand
if ($invokeCommand.PSObject.Properties['LocationChangedAction']) {
    $invokeCommand.LocationChangedAction = {
        Update-OpencodeAppTag
    }
}

Update-OpencodeAppTag
# <<< opencode-app-tag <<<
'@

$profileContent = Get-Content -LiteralPath $profilePath -Raw
$alreadyInstalled = $false
if (-not [string]::IsNullOrEmpty($profileContent)) {
    $alreadyInstalled = $profileContent.Contains($beginMarker)
}

if (-not $alreadyInstalled) {
    if (-not [string]::IsNullOrEmpty($profileContent) -and -not $profileContent.EndsWith("`r`n") -and -not $profileContent.EndsWith("`n")) {
        Add-Content -LiteralPath $profilePath -Value ""
    }
    Add-Content -LiteralPath $profilePath -Value $managedBlock
    $installed = $true
}
else {
    $installed = $false
}

. ([scriptblock]::Create($managedBlock))

Write-Host "Profile: $profilePath"
if ($installed) {
    Write-Host "Installed PowerShell OPENCODE_APP_TAG hook."
}
else {
    Write-Host "PowerShell OPENCODE_APP_TAG hook already present."
}
Write-Host "Current OPENCODE_APP_TAG: $env:OPENCODE_APP_TAG"
Write-Host "Open a new terminal to make the hook available in future shells."
