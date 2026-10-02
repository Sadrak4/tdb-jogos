Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js nao encontrado."
    Read-Host "Pressione Enter"
    exit 1
}

if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) {
        Read-Host "Falha no npm install. Pressione Enter"
        exit 1
    }
}

node server.js
