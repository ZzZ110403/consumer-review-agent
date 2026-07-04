param(
  [string]$RepoName = "consumer-review-agent",
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

function Find-Gh {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  $candidates = @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\gh.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\GitHub.cli_Microsoft.Winget.Source_8wekyb3d8bbwe\bin\gh.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "GitHub CLI was not found. Run: winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements --scope user"
}

function Invoke-Gh {
  & $script:Gh @args
}

function Upload-FileToRepo {
  param(
    [string]$Owner,
    [string]$Repo,
    [string]$FullPath,
    [string]$RelativePath
  )

  $relativeForGitHub = $RelativePath.Replace("\", "/")
  $bytes = [System.IO.File]::ReadAllBytes($FullPath)
  $base64 = [System.Convert]::ToBase64String($bytes)
  $apiPath = "repos/$Owner/$Repo/contents/$relativeForGitHub"

  $sha = $null
  try {
    $shaOutput = Invoke-Gh "api" $apiPath "--jq" ".sha"
    if ($shaOutput) {
      $sha = "$shaOutput".Trim()
    }
  } catch {
    $sha = $null
  }

  $body = @{
    message = "Deploy $relativeForGitHub"
    content = $base64
    branch = "main"
  }

  if ($sha) {
    $body.sha = "$sha".Trim()
  }

  $json = $body | ConvertTo-Json -Depth 4 -Compress
  $tempJson = New-TemporaryFile
  Set-Content -LiteralPath $tempJson -Value $json -Encoding UTF8

  try {
    Invoke-Gh "api" "--method" "PUT" $apiPath "--input" $tempJson | Out-Null
  } finally {
    Remove-Item -LiteralPath $tempJson -Force -ErrorAction SilentlyContinue
  }
}

$script:Gh = Find-Gh
Write-Host "GitHub CLI: $script:Gh"

$authOk = $true
try {
  Invoke-Gh "auth" "status" | Out-Null
} catch {
  $authOk = $false
}
if (-not $authOk) {
  Write-Host "Please log in to GitHub in the browser. The script will continue after login."
  Invoke-Gh "auth" "login" "--hostname" "github.com" "--web" "--git-protocol" "https"
}

$owner = (Invoke-Gh "api" "user" "--jq" ".login").Trim()
Write-Host "GitHub user: $owner"

$repoExists = $true
try {
  Invoke-Gh "repo" "view" "$owner/$RepoName" | Out-Null
} catch {
  $repoExists = $false
}

if (-not $repoExists) {
  Write-Host "Creating public repo: $owner/$RepoName"
  Invoke-Gh "repo" "create" "$RepoName" "--public" "--description" "LLM consumer review sentiment and purchase advice agent" "--add-readme" | Out-Null
} else {
  Write-Host "Repo already exists, updating files: $owner/$RepoName"
}

$files = Get-ChildItem -LiteralPath $SourceDir -Recurse -File |
  Where-Object {
    $_.FullName -notmatch "\\.git\\" -and
    $_.Name -ne "consumer-review-agent-github-pages.zip"
  }

foreach ($file in $files) {
  $root = (Resolve-Path -LiteralPath $SourceDir).Path.TrimEnd("\")
  $relative = $file.FullName.Substring($root.Length + 1)
  Write-Host "Uploading: $relative"
  Upload-FileToRepo -Owner $owner -Repo $RepoName -FullPath $file.FullName -RelativePath $relative
}

$pagesExists = $true
try {
  Invoke-Gh "api" "repos/$owner/$RepoName/pages" | Out-Null
} catch {
  $pagesExists = $false
}

if (-not $pagesExists) {
  Write-Host "Enabling GitHub Pages"
  $pagesBody = @{
    source = @{
      branch = "main"
      path = "/"
    }
  } | ConvertTo-Json -Depth 4 -Compress

  $tempPagesJson = New-TemporaryFile
  Set-Content -LiteralPath $tempPagesJson -Value $pagesBody -Encoding UTF8
  try {
    Invoke-Gh "api" "--method" "POST" "repos/$owner/$RepoName/pages" "--input" $tempPagesJson | Out-Null
  } finally {
    Remove-Item -LiteralPath $tempPagesJson -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "GitHub Pages is already enabled"
}

$url = "https://$owner.github.io/$RepoName/"
Write-Host ""
Write-Host "Deployment finished. Pages URL: $url"
Write-Host "If Pages was just enabled, first build may take 1-3 minutes."
