@echo off
rem ---------------------------------------------------------------------------
rem  Distant Sectors - talk to Astra from any worktree.  See docs/astra-link.md
rem
rem    scripts\astra ask "message"      send to the standing thread
rem    scripts\astra ask --file b.md    send a brief from a file
rem    scripts\astra inbox              read what Astra has left for us
rem ---------------------------------------------------------------------------
node "%~dp0astra.mjs" %*
