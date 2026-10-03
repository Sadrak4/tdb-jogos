@echo off
title TDB - Desenvolvimento Local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERRO: Node.js nao foi encontrado.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando TDB v7.2.2...
echo.
node server.js
pause
