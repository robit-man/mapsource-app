# ADR-001: Server-side Mapsource credential boundary

Status: Accepted — 2026-09-26.

## Context

MapLibre needs browser-readable style and tile resources while Mapsource route, search, vector tile, and terrain requests are quota-bearing. Shipping a reusable key would make a public example an unrestricted credential distributor.

## Decision

Run a small loopback-only Node server. Use the official `mapsource` npm client for JSON operations. Expose exact same-origin renderer routes for style, vector tiles, terrain, glyphs, and one allowlisted satellite provider. Validate coordinates, reject redirects, cap payloads, and keep keys in process memory/environment only.

## Consequences

The app requires a server and health supervision, but the browser has no secret. All public ingress terminates through Cloudflare Tunnel, and resource policies can evolve without changing client credentials.
