@echo off
chcp 65001 >nul 2>&1
title StoryForge

set DEFAULT_PORT=999
set P=%~1
if not defined P set P=%DEFAULT_PORT%

echo.
echo  ==================================================
echo    StoryForge Quick Start
echo  ==================================================
echo.
echo  Port: %P%
echo.
echo  URL: http://localhost:%P%/storyforge/
echo.
echo  Press Ctrl+C or close window to stop.
echo  ==================================================
echo.

call npm install
call npx vite --port %P%
