# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Repository Purpose

Public one-page hiking, routing, and activity-map example for the `mapsource`
npm package, deployed at `app.mapsource.io`. The browser uses React and
MapLibre; a loopback-only Node server protects the Mapsource key and exposes
bounded same-origin API and renderer routes.

@AIWG.md

---

## Project-Specific Notes

Read `AGENTS.md` before changing code. Run `npm run typecheck` while debugging
and `npm run validate && npm audit --audit-level=high` before pushing main.
