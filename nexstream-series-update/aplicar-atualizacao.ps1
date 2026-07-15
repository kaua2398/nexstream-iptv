param(
    [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$PatchRoot = Join-Path $PSScriptRoot 'files'
$PackageJson = Join-Path $ProjectRoot 'package.json'

if (-not (Test-Path -LiteralPath $PackageJson)) {
    throw "A pasta informada não parece ser a raiz do NexStream: $ProjectRoot"
}

$Files = @(
    'apps/api/src/infrastructure/http/xtream-client.ts',
    'apps/api/src/routes/catalog-routes.ts',
    'apps/web/app/dashboard/page.tsx',
    'apps/web/app/dashboard/series/[id]/page.tsx',
    'apps/web/components/media/catalog-page.tsx',
    'apps/web/components/media/media-card.tsx',
    'apps/web/components/media/media-row.tsx',
    'apps/web/components/navigation/back-button.tsx',
    'apps/web/components/player/video-player.tsx',
    'apps/web/hooks/use-series-details.ts',
    'packages/shared/src/index.ts'
)

$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $ProjectRoot ".nexstream-backups\series-ui-$Timestamp"

foreach ($RelativePath in $Files) {
    $Source = Join-Path $PatchRoot $RelativePath
    $Destination = Join-Path $ProjectRoot $RelativePath

    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Arquivo do pacote não encontrado: $Source"
    }

    if (Test-Path -LiteralPath $Destination) {
        $BackupPath = Join-Path $BackupRoot $RelativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $BackupPath) -Force | Out-Null
        Copy-Item -LiteralPath $Destination -Destination $BackupPath -Force
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Force
    Write-Host "Atualizado: $RelativePath" -ForegroundColor Green
}

$NextCache = Join-Path $ProjectRoot 'apps/web/.next'
Remove-Item -LiteralPath $NextCache -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host 'Atualização aplicada.' -ForegroundColor Cyan
Write-Host "Backup: $BackupRoot" -ForegroundColor Yellow
Write-Host ''
Write-Host 'Execute agora:' -ForegroundColor Cyan
Write-Host 'docker compose -f docker-compose.dev.yml exec api pnpm --filter @nexstream/api typecheck'
Write-Host 'docker compose -f docker-compose.dev.yml exec web pnpm --filter @nexstream/web typecheck'
Write-Host 'docker compose -f docker-compose.dev.yml restart api web'
