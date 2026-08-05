$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ports = @(3000, 3001)
$ownerIds = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object { $ports -contains $_.LocalPort } |
  Select-Object -ExpandProperty OwningProcess -Unique

if (-not $ownerIds) {
  Write-Output 'CarRadioWeb development services are not running.'
  exit 0
}

$stopped = @()
foreach ($ownerId in $ownerIds) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId" -ErrorAction SilentlyContinue
  if (-not $process -or $process.CommandLine -notlike "*$projectRoot*") {
    Write-Warning "Port owner $ownerId does not belong to CarRadioWeb; it was not stopped."
    continue
  }

  & taskkill.exe /PID $ownerId /T /F | Out-Null
  if ($LASTEXITCODE -eq 0) { $stopped += $ownerId }
}

if ($stopped.Count -gt 0) {
  Write-Output "Stopped CarRadioWeb development services (PID: $($stopped -join ', '))."
} else {
  Write-Output 'No CarRadioWeb development service was stopped.'
}
