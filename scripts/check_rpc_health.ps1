[CmdletBinding()]
param(
  [string]$EnvFile = "frontend/.env.local",
  [string]$ContractAddress = "",
  [int]$TimeoutSec = 4,
  [switch]$Watch,
  [int]$IntervalSec = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-WorkspacePath([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  if ([System.IO.Path]::IsPathRooted($p)) { return $p }
  return (Join-Path (Get-Location) $p)
}

function Mask-UrlCredentials([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $url }
  try {
    $u = [Uri]$url
    if (-not [string]::IsNullOrWhiteSpace($u.UserInfo)) {
      $prefix = "$($u.Scheme)://***@"
      $rest = $url.Substring(("$($u.Scheme)://$($u.UserInfo)@".Length))
      return $prefix + $rest
    }
  } catch {
    # ignore
  }
  return $url
}

function Split-RpcList([string]$raw) {
  return ($raw -split '[\s,]+' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Is-LocalRpc([string]$url) {
  if ([string]::IsNullOrWhiteSpace($url)) { return $false }
  try {
    $u = [Uri]$url
    return ($u.Host -eq '127.0.0.1' -or $u.Host -eq 'localhost')
  } catch {
    return $false
  }
}

function Unique-PreserveOrder([string[]]$items) {
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($i in $items) {
    if ([string]::IsNullOrWhiteSpace($i)) { continue }
    if ($seen.Add($i)) { [void]$out.Add($i) }
  }
  return $out.ToArray()
}

function Read-DotEnv([string]$path) {
  $vars = @{}
  if (-not (Test-Path -LiteralPath $path)) { return $vars }

  Get-Content -LiteralPath $path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) { return }
    if ($line.StartsWith('#')) { return }

    $m = [regex]::Match($line, '^(?<k>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<v>.*)$')
    if (-not $m.Success) { return }

    $k = $m.Groups['k'].Value
    $v = $m.Groups['v'].Value.Trim()

    # strip surrounding quotes
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }

    $vars[$k] = $v
  }

  return $vars
}

function Try-Read-ContractAddressFromConfig() {
  try {
    $cfg = Resolve-WorkspacePath 'frontend/src/configs/contractConfig.ts'
    if (-not (Test-Path -LiteralPath $cfg)) { return '' }
    $text = Get-Content -LiteralPath $cfg -Raw
    $m = [regex]::Match($text, 'export\s+const\s+CONTRACT_ADDRESS\s*=\s*"(?<addr>0x[a-fA-F0-9]{40})"')
    if ($m.Success) { return $m.Groups['addr'].Value }
  } catch {
    return ''
  }
  return ''
}

function Invoke-Rpc([string]$url, [string]$method, [object[]]$params) {
  $body = @{ jsonrpc = '2.0'; id = 1; method = $method; params = $params } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Method Post -Uri $url -ContentType 'application/json' -TimeoutSec $TimeoutSec -Body $body
}

$envPath = Resolve-WorkspacePath $EnvFile
$dotenv = Read-DotEnv $envPath

$rpcPrimary = if ($dotenv.ContainsKey('BDAG_RPC')) { $dotenv['BDAG_RPC'] } else { $env:BDAG_RPC }
$rpcFallbacks = if ($dotenv.ContainsKey('BDAG_RPC_FALLBACKS')) { $dotenv['BDAG_RPC_FALLBACKS'] } else { $env:BDAG_RPC_FALLBACKS }
$rpcDevFallback = if ($dotenv.ContainsKey('DEV_FALLBACK_RPC')) { $dotenv['DEV_FALLBACK_RPC'] } else { $env:DEV_FALLBACK_RPC }

$candidates = Unique-PreserveOrder ((Split-RpcList $rpcPrimary) + (Split-RpcList $rpcFallbacks) + (Split-RpcList $rpcDevFallback))

if (-not $ContractAddress) {
  $ContractAddress = Try-Read-ContractAddressFromConfig
}

if ($ContractAddress) {
  if (-not ($ContractAddress -match '^0x[a-fA-F0-9]{40}$')) {
    throw "ContractAddress '$ContractAddress' is not a valid 0x address."
  }
}

Write-Host "Env file: $envPath" -ForegroundColor DarkGray
Write-Host "Contract: $(if($ContractAddress){$ContractAddress}else{'(none)'})" -ForegroundColor DarkGray
Write-Host "Timeout: $TimeoutSec sec" -ForegroundColor DarkGray
Write-Host "" 

if ($candidates.Count -eq 0) {
  Write-Host "No RPCs configured. Set BDAG_RPC / BDAG_RPC_FALLBACKS / DEV_FALLBACK_RPC." -ForegroundColor Yellow
  exit 1
}

function Run-CheckOnce([string[]]$urls) {
  $results = @()
  foreach ($url in $urls) {
    $masked = Mask-UrlCredentials $url
    $row = [ordered]@{
      rpc = $masked
      okBlock = $false
      blockNumber = ''
      msBlock = $null
      chainId = ''
      okCode = if ($ContractAddress) { $false } else { $true }
      msCode = $null
      codeBytes = ''
      local = Is-LocalRpc $url
    }

    # blockNumber
    try {
      $sw = [System.Diagnostics.Stopwatch]::StartNew()
      $bn = Invoke-Rpc $url 'eth_blockNumber' @()
      $sw.Stop()
      $row.msBlock = [int]$sw.ElapsedMilliseconds
      $row.blockNumber = $bn.result
      $row.okBlock = ($row.blockNumber -is [string] -and $row.blockNumber.StartsWith('0x'))
    } catch {
      $row.okBlock = $false
    }

    # chainId (best-effort)
    try {
      $cid = Invoke-Rpc $url 'eth_chainId' @()
      $row.chainId = $cid.result
    } catch {
      $row.chainId = ''
    }

    # getCode
    if ($ContractAddress) {
      try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $code = Invoke-Rpc $url 'eth_getCode' @($ContractAddress, 'latest')
        $sw.Stop()
        $row.msCode = [int]$sw.ElapsedMilliseconds
        $hex = [string]$code.result
        $row.okCode = ($hex -and $hex -ne '0x')
        if ($hex -and $hex.StartsWith('0x') -and $hex.Length -gt 2) {
          $row.codeBytes = [int](($hex.Length - 2) / 2)
        } else {
          $row.codeBytes = '0'
        }
      } catch {
        $row.okCode = $false
      }
    }

    $results += [pscustomobject]$row
  }

  # Selection logic: pick first URL with okBlock && okCode. If none, pick first candidate.
  $selected = ($results | Where-Object { $_.okBlock -and $_.okCode } | Select-Object -First 1)
  if (-not $selected) { $selected = $results | Select-Object -First 1 }

  $results | ForEach-Object {
    $_ | Add-Member -NotePropertyName selected -NotePropertyValue ($_.rpc -eq $selected.rpc) -Force
  }

  $table = $results |
    Sort-Object -Property selected -Descending |
    Format-Table -AutoSize rpc,selected,local,okBlock,msBlock,blockNumber,chainId,okCode,msCode,codeBytes |
    Out-String -Width 250
  Write-Host $table

  Write-Host "" 
  Write-Host "Selected RPC (matches app failover intent): $($selected.rpc)" -ForegroundColor Green
  if ($ContractAddress) {
    if ($selected.okCode) {
      Write-Host "Contract code present (selected): yes" -ForegroundColor Green
    } else {
      Write-Host "Contract code present (selected): NO" -ForegroundColor Yellow
    }
  }

  return $results
}

do {
  if ($Watch) {
    Write-Host ("\n=== {0} ===" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) -ForegroundColor DarkGray
  }

  $results = Run-CheckOnce -urls $candidates

  if ($Watch -and $ContractAddress) {
    $localReady = $results | Where-Object { $_.local -and $_.okBlock -and $_.okCode } | Select-Object -First 1
    if ($localReady) {
      Write-Host "\nLocal RPC is now ready for the deployed contract: $($localReady.rpc)" -ForegroundColor Green
      break
    }
  }

  if ($Watch) {
    Start-Sleep -Seconds ([Math]::Max(2, $IntervalSec))
  }
} while ($Watch)
