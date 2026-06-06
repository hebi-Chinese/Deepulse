@echo off
chcp 65001 >nul
title Claudio Dev Server
cd /d "%~dp0"

rem ============================================
rem  CONFIG -- fork users edit only these lines
rem    BRAIN: claude / deepseek / ollama / openai
rem    TTS  : mock / gpt-sovits / voxcpm
rem ============================================
set "BRAIN=deepseek"
set "TTS=mock"

rem ---- only preset matching brain's key placeholder ----
if /I "%BRAIN%"=="deepseek" if not defined DEEPSEEK_API_KEY set "DEEPSEEK_API_KEY=sk-PUT-YOUR-DEEPSEEK-KEY-HERE"
if /I "%BRAIN%"=="openai"   if not defined OPENAI_API_KEY   set "OPENAI_API_KEY=sk-PUT-YOUR-OPENAI-KEY-HERE"

rem ---- wipe stale brain envs before re-injecting (no cross-brand leak) ----
set "BRAIN_TYPE="
set "DEEPSEEK_URL="
set "OLLAMA_URL="
set "OPENAI_BASE_URL="
set "OPENAI_MODEL="

rem ---- per-brain mapping (brand-exclusive URL env, no fallback) ----
if /I "%BRAIN%"=="claude" (
    set "BRAIN_TYPE=claude"
)
if /I "%BRAIN%"=="deepseek" (
    set "BRAIN_TYPE=deepseek"
    set "DEEPSEEK_URL=https://api.deepseek.com/v1"
    set "OPENAI_MODEL=deepseek-chat"
    set "OPENAI_API_KEY=%DEEPSEEK_API_KEY%"
)
if /I "%BRAIN%"=="ollama" (
    set "BRAIN_TYPE=ollama"
    set "OLLAMA_URL=http://localhost:11434/v1"
    set "OPENAI_MODEL=qwen2.5:7b"
)
if /I "%BRAIN%"=="openai" (
    set "BRAIN_TYPE=openai-compat"
    set "OPENAI_BASE_URL=https://api.openai.com/v1"
    set "OPENAI_MODEL=gpt-4o-mini"
)

set "TTS_TYPE=%TTS%"

echo ============================================
echo   Claudio  -  AI Music Radio
echo --------------------------------------------
echo   BRAIN_TYPE   = %BRAIN_TYPE%
echo   DEEPSEEK_URL = %DEEPSEEK_URL%
echo   OLLAMA_URL   = %OLLAMA_URL%
echo   OPENAI_URL   = %OPENAI_BASE_URL%
echo   OPENAI_MODEL = %OPENAI_MODEL%
echo   OPENAI_KEY   = %OPENAI_API_KEY:~0,8%...
echo   TTS_TYPE     = %TTS_TYPE%
echo --------------------------------------------
echo   PWA      http://localhost:3000
echo   Server   http://localhost:8787
echo   Press Ctrl+C to stop (PWA + Server)
echo ============================================
echo.

call pnpm dev

echo.
echo --------------------------------------------
echo   Stopped.  Press any key to close...
echo --------------------------------------------
pause >nul
