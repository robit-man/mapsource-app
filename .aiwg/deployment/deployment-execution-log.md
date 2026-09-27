# Deployment execution log — v0.1.0

Date: 2026-09-26  
Operator: Codex under user-authorized deployment request

## Artifact

- Repository: `https://github.com/robit-man/mapsource-app`
- Initial release commit: `fbe9f69`
- Branch: `main`
- Build command: `npm run build`
- Validation command: `npm run validate`

## Execution

1. Completed the local release and security gates.
2. Published the new public GitHub repository and pushed `main`.
3. Installed `infra/systemd/mapsource-app.service` as `/etc/systemd/system/mapsource-app.service`.
4. Reloaded systemd and enabled/started the service.
5. Verified the process bound only to `127.0.0.1:3220`.
6. Verified loopback health, style, real routing, and satellite imagery.
7. Added remote Cloudflare Tunnel ingress for `app.mapsource.io` to `http://127.0.0.1:3220`, preserving the existing `mapsource.io` route and terminal 404 rule.
8. Created a proxied CNAME for `app.mapsource.io` to the existing healthy tunnel.
9. Verified public DNS, TLS, headers, API behavior, desktop/mobile rendering, Satellite, and replay.

## Result

- systemd: active/running, enabled, zero restarts
- public application: HTTP/2 200
- production regression gate: pass
- rollback invoked: no

## Rollback boundary

Application rollback is the previous verified Git commit followed by rebuild and service restart. Edge rollback removes only the `app.mapsource.io` ingress entry and DNS record; it must preserve `mapsource.io` and the tunnel fallback. Full commands and verification order are in `docs/runbook.md`.

