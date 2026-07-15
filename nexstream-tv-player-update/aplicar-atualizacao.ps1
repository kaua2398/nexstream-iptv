$ErrorActionPreference = 'Stop'

$ProjectRoot = (Get-Location).Path
$PackageJson = Join-Path $ProjectRoot 'package.json'

if (-not (Test-Path $PackageJson)) {
    throw 'Execute este script na raiz do projeto NexStream, onde está o package.json.'
}

$FilesRoot = Join-Path $PSScriptRoot 'files'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $ProjectRoot ".nexstream-backups\tv-player-$Timestamp"

$RelativeFiles = @(
    'apps\api\src\infrastructure\http\xtream-client.ts',
    'apps\api\src\routes\catalog-routes.ts',
    'apps\web\app\dashboard\tv\page.tsx',
    'apps\web\components\media\live-catalog-page.tsx',
    'apps\web\components\media\live-channel-card.tsx',
    'apps\web\components\player\video-player.tsx',
    'apps\web\hooks\use-browse-catalog.ts',
    'packages\shared\src\index.ts'
)

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

foreach ($RelativeFile in $RelativeFiles) {
    $Source = Join-Path $FilesRoot $RelativeFile
    $Destination = Join-Path $ProjectRoot $RelativeFile

    if (-not (Test-Path $Source)) {
        throw "Arquivo da atualização não encontrado: $Source"
    }

    if (Test-Path $Destination) {
        $BackupFile = Join-Path $BackupRoot $RelativeFile
        $BackupDirectory = Split-Path $BackupFile -Parent
        New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
        Copy-Item $Destination $BackupFile -Force
    }

    $DestinationDirectory = Split-Path $Destination -Parent
    New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
    Copy-Item $Source $Destination -Force
    Write-Host "Atualizado: $RelativeFile" -ForegroundColor Green
}

Write-Host ''
Write-Host "Backup salvo em: $BackupRoot" -ForegroundColor Yellow
Write-Host 'Atualização aplicada com sucesso.' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Agora execute os typechecks e reinicie api/web conforme o README.'
