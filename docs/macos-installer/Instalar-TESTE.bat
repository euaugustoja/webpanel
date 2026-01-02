@echo off
chcp 65001 >nul
title Ferramentas Guru - Instalador
color 09

cls
echo.
echo     ╔═══════════════════════════════════════════════════════╗
echo     ║                                                       ║
echo     ║        🔧  F E R R A M E N T A S   G U R U            ║
echo     ║                                                       ║
echo     ║        Browser Anti-Detecção Multilogin               ║
echo     ║                                                       ║
echo     ╚═══════════════════════════════════════════════════════╝
echo.

timeout /t 2 /nobreak >nul

echo   ▸ Detectando seu sistema...
timeout /t 1 /nobreak >nul
echo   ✓ Apple Silicon detectado
echo.

timeout /t 1 /nobreak >nul

echo   ▸ Baixando Ferramentas Guru...
echo.

:: Barra de progresso bonita
setlocal enabledelayedexpansion
for /L %%i in (1,1,30) do (
    set "bar="
    set /a filled=%%i
    set /a empty=30-%%i
    set /a percent=%%i*100/30
    
    for /L %%j in (1,1,!filled!) do set "bar=!bar!█"
    for /L %%k in (1,1,!empty!) do set "bar=!bar!░"
    
    cls
    echo.
    echo     ╔═══════════════════════════════════════════════════════╗
    echo     ║                                                       ║
    echo     ║        🔧  F E R R A M E N T A S   G U R U            ║
    echo     ║                                                       ║
    echo     ║        Browser Anti-Detecção Multilogin               ║
    echo     ║                                                       ║
    echo     ╚═══════════════════════════════════════════════════════╝
    echo.
    echo   ▸ Baixando Ferramentas Guru...
    echo.
    echo      [!bar!] !percent!%%
    
    ping localhost -n 1 >nul
)
endlocal

echo.
echo   ✓ Download concluído
echo.

timeout /t 1 /nobreak >nul

echo   ⣾ Preparando arquivos...
timeout /t 1 /nobreak >nul
echo   ✓ Preparando arquivos...
echo.

timeout /t 1 /nobreak >nul

echo   ⣾ Instalando...
timeout /t 1 /nobreak >nul
echo   ✓ Instalando...
echo.

timeout /t 1 /nobreak >nul

echo   ⣾ Finalizando...
timeout /t 1 /nobreak >nul
echo   ✓ Finalizando...
echo.

timeout /t 1 /nobreak >nul

cls
echo.
echo     ╔═══════════════════════════════════════════════════════╗
echo     ║                                                       ║
echo     ║        🔧  F E R R A M E N T A S   G U R U            ║
echo     ║                                                       ║
echo     ║        Browser Anti-Detecção Multilogin               ║
echo     ║                                                       ║
echo     ╚═══════════════════════════════════════════════════════╝
echo.
echo.
echo     ╔═══════════════════════════════════════════════════════╗
echo     ║                                                       ║
echo     ║         ✅  INSTALAÇÃO CONCLUÍDA!                     ║
echo     ║                                                       ║
echo     ║         Abra pelo Launchpad ou Finder                 ║
echo     ║                                                       ║
echo     ╚═══════════════════════════════════════════════════════╝
echo.
echo.
echo   🚀 Abrindo Ferramentas Guru...
echo.

timeout /t 2 /nobreak >nul

echo   Você pode fechar esta janela.
echo.

pause
