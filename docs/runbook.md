# Operations runbook

## Service contract

- Unit: `mapsource-app.service`
- Bind: `127.0.0.1:3220`
- Public hostname: `app.mapsource.io`
- Health: `/health/live`, `/health/ready`
- Dependency: Mapsource gateway at `127.0.0.1:8787`

## Build and verify

```bash
cd /home/roko/Documents/Projects/Utilities/maps/mapsource-app
npm ci
npm run validate
npm audit --audit-level=high
```

The build is complete only when `dist/` and `dist-server/server/index.js` both exist.

## Install or update the service

```bash
sudo install -m 0644 infra/systemd/mapsource-app.service /etc/systemd/system/mapsource-app.service
sudo systemctl daemon-reload
sudo systemctl enable --now mapsource-app.service
```

If a dedicated Mapsource key is needed, write only variable assignments to `/etc/mapsource-app.env`, set ownership to root, mode `0600`, and restart the unit. Never print the value during diagnostics.

## Pre-edge checks

```bash
curl --fail --silent --show-error http://127.0.0.1:3220/health/live
curl --fail --silent --show-error http://127.0.0.1:3220/health/ready
curl --fail --silent --show-error http://127.0.0.1:3220/map/style.json >/dev/null
npm run deploy:check
```

Then verify `https://app.mapsource.io` and one actual route in a desktop and phone viewport.

## Public edge inventory

The existing remotely managed Cloudflare Tunnel named `mapsource` contains these ordered ingress rules:

1. `mapsource.io` → `http://127.0.0.1:3210`
2. `app.mapsource.io` → `http://127.0.0.1:3220`
3. terminal `http_status:404`

The proxied `app.mapsource.io` CNAME targets that tunnel's `cfargotunnel.com` hostname. Cloudflare configuration and DNS use separate scoped credentials held by the adjacent Mapsource repository; neither credential belongs in this repository or service environment. When changing ingress, fetch the current remote configuration first and preserve every unrelated hostname plus the terminal fallback.

## Logs

```bash
journalctl -u mapsource-app.service --since '30 minutes ago'
systemctl status mapsource-app.service
```

The unit writes only to journald. It creates no application log files, tile caches, downloaded imagery archives, or snapshots.

## Rollback

1. Record the failing commit and request IDs.
2. Return the repository to the previously verified commit without deleting uncommitted user work.
3. Run `npm ci`, `npm run build`, and `npm run validate`.
4. Restart `mapsource-app.service`.
5. Repeat loopback and public checks.

If only the Cloudflare route is faulty, remove exactly the `app.mapsource.io` ingress entry and its CNAME while preserving `mapsource.io`, every other hostname, and the terminal fallback. Leave the healthy loopback service running and verify `mapsource.io` after the edge rollback.
