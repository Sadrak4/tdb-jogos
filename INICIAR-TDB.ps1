Set-Location $PSScriptRoot
npm install
if ($LASTEXITCODE -ne 0) { Read-Host 'Falha; Enter para sair'; exit 1 }
npm start
