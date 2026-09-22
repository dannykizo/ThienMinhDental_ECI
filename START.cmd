@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\dev\start.ps1"
if errorlevel 1 (
  echo.
  echo Khong the khoi dong chuong trinh. Xem thong bao loi phia tren.
  pause
)
