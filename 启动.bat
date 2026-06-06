@echo off
title Claudio Dev Server
cd /d "%~dp0"

rem ============================================
rem  CONFIG �� fork �û��������м���
rem    BRAIN: claude / deepseek / ollama / openai
rem    TTS  : mock / gpt-sovits / voxcpm
rem ============================================
set BRAIN=deepseek
set TTS=mock

rem ---- API key ���� (ϵͳ env �Ѷ���������, ����������� key) ----
rem ---- ֻԤ�� BRAIN ��Ӧ�� key; ϵͳ env �Ѵ��� DEEPSEEK_API_KEY ʱ���ߵ� -----
if /I "%BRAIN%"=="deepseek" if not defined DEEPSEEK_API_KEY set "DEEPSEEK_API_KEY=sk-PUT-YOUR-DEEPSEEK-KEY-HERE"
if /I "%BRAIN%"=="openai"   if not defined OPENAI_API_KEY   set "OPENAI_API_KEY=sk-PUT-YOUR-OPENAI-KEY-HERE"

rem ---- ��� OPENAI_API_KEY ��ǰ�����޿� env �����, ��� :setDeepseek ��Ȧ ----
if /I "%BRAIN%"=="deepseek" set "OPENAI_API_KEY="
if /I "%BRAIN%"=="deepseek" set "OPENAI_BASE_URL="
if /I "%BRAIN%"=="deepseek" set "OPENAI_MODEL="

rem ---- Ԥ��ӳ�� (һ�㲻�ø�) ----
rem ---- �� set "VAR=val" ��ʽ���� ) ǰ�ո񱻳Խ� value ----
if /I "%BRAIN%"=="claude"   set "BRAIN_TYPE=claude"
if /I "%BRAIN%"=="deepseek" call :setDeepseek
if /I "%BRAIN%"=="ollama"   call :setOllama
if /I "%BRAIN%"=="openai"   call :setOpenai
set "TTS_TYPE=%TTS%"
goto :afterBrain

:setDeepseek
set "BRAIN_TYPE=deepseek"
set "OPENAI_MODEL=deepseek-chat"
set "OPENAI_API_KEY=%DEEPSEEK_API_KEY%"
goto :eof

:setOllama
set "BRAIN_TYPE=ollama"
set "OPENAI_MODEL=qwen2.5:7b"
goto :eof

:setOpenai
set "BRAIN_TYPE=openai-compat"
set "OPENAI_MODEL=gpt-4o-mini"
goto :eof

:afterBrain

echo ============================================
echo   Claudio  -  AI Music Radio
echo --------------------------------------------
echo   PWA      http://localhost:3000
echo   Server   http://localhost:8787
echo --------------------------------------------
echo   Press Ctrl+C to stop ^(PWA + Server^)
echo ============================================
echo.

call pnpm dev

echo.
echo --------------------------------------------
echo   Stopped.  Press any key to close...
echo --------------------------------------------
pause >nul
