@echo off
chcp 65001 >nul
title Deepulse Dev Server
cd /d "%~dp0"

rem ============================================
rem  CONFIG -- fork users edit only these lines
rem    BRAIN: claude / deepseek / ollama / openai
rem    TTS  : mock / gpt-sovits / voxcpm
rem  KEY: PRD-002 (2026-06-14) -- one AI_KEY slot for all brands
rem  Put your real key here, no brand-specific aliases anymore
rem ============================================
set "BRAIN=deepseek"
set "TTS=voxcpm"
if not defined AI_KEY set "AI_KEY=sk-PUT-YOUR-AI-KEY-HERE"

rem ---- wipe stale brain envs before re-injecting ----
set "BRAIN_TYPE="
set "AI_URL="
set "AI_MODEL="

rem ---- per-brain mapping (all share AI_URL + AI_MODEL + AI_KEY) ----
if /I "%BRAIN%"=="claude" (
    set "BRAIN_TYPE=claude"
)
if /I "%BRAIN%"=="deepseek" (
    set "BRAIN_TYPE=deepseek"
    set "AI_URL=https://api.deepseek.com/v1"
    set "AI_MODEL=deepseek-chat"
)
if /I "%BRAIN%"=="ollama" (
    set "BRAIN_TYPE=ollama"
    set "AI_URL=http://localhost:11434/v1"
    set "AI_MODEL=qwen2.5:7b"
)
if /I "%BRAIN%"=="openai" (
    set "BRAIN_TYPE=openai-compat"
    set "AI_URL=https://api.openai.com/v1"
    set "AI_MODEL=gpt-4o-mini"
)

rem ---- TTS: wipe stale, then per-tts mapping ----
set "TTS_TYPE="
set "VOXCPM_URL="
if /I "%TTS%"=="mock" (
    set "TTS_TYPE=mock"
)
if /I "%TTS%"=="gpt-sovits" (
    set "TTS_TYPE=gpt-sovits"
    rem TTS_URL default 127.0.0.1:8000 in shared/config, leave unset to inherit
)
if /I "%TTS%"=="voxcpm" (
    set "TTS_TYPE=voxcpm"
    set "VOXCPM_URL=http://127.0.0.1:8001"
    rem local model path: avoid HF download if VPN is off; ModelScope-downloaded snapshot lives here
    set "VOXCPM_MODEL=%~dp0tools\voxcpm-server\VoxCPM2"
    rem optional: set "VOXCPM_VOICE_DESIGN=gentle female, 25, neutral mood"
)

rem ---- voxcpm auto-launch: start :8001 server in own window if not already up ----
rem skip launch if 8001 already listening (re-running bat won't double-start)
if /I "%TTS%"=="voxcpm" (
    netstat -ano | findstr ":8001 " | findstr LISTENING >nul 2>&1
    if errorlevel 1 (
        echo Launching VoxCPM server in separate window...
        rem prefer venv python if present, else fall back to global python
        if exist "%~dp0tools\voxcpm-server\.venv\Scripts\python.exe" (
            start "VoxCPM TTS Server" /D "%~dp0tools\voxcpm-server" .venv\Scripts\python.exe app.py
        ) else (
            start "VoxCPM TTS Server" /D "%~dp0tools\voxcpm-server" python app.py
        )
        echo VoxCPM launching... first DJ chat may wait ~30s while model loads.
    ) else (
        echo VoxCPM already running on :8001, skip launch.
    )
)

echo ============================================
echo   Deepulse  -  AI Music Radio
echo --------------------------------------------
echo   BRAIN_TYPE   = %BRAIN_TYPE%
echo   AI_URL       = %AI_URL%
echo   AI_MODEL     = %AI_MODEL%
echo   AI_KEY       = %AI_KEY:~0,8%...
echo   TTS_TYPE     = %TTS_TYPE%
echo   VOXCPM_URL   = %VOXCPM_URL%
echo   VOXCPM_MODEL = %VOXCPM_MODEL%
echo --------------------------------------------
echo   PWA      http://localhost:3000
echo   Server   http://localhost:8787
echo   Press Ctrl+C to stop (PWA + Server)
if /I "%TTS%"=="voxcpm" echo   TIP: VoxCPM server runs in its own window, close it separately on shutdown
echo ============================================
echo.

call pnpm dev

echo.
echo --------------------------------------------
echo   Stopped.  Press any key to close...
echo --------------------------------------------
pause >nul
