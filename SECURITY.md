# Security

Report vulnerabilities privately to the Mapsource maintainers. Do not include live API keys, account data, or exploit traffic against the public service in an issue.

## Credential model

`MAPSOURCE_API_KEY` is a server credential. The browser communicates only with same-origin `/api/*` and `/map/*` routes. The server never returns the credential, places it in a redirect, appends it to an upstream URL, or logs it.

For the adjacent local development stack, the server can acquire the quota-bound, origin-bound site demonstration key in memory. Production installations should provide a dedicated scoped key through a root-owned environment file or secret manager.

## Proxy model

Map, terrain, glyph, and satellite proxy routes accept only typed path segments. Zoom, row, and column bounds are checked before upstream construction. Responses are capped at 8 MiB, time-bounded, and redirects are rejected.

## Browser policy

The production server emits CSP, frame denial, MIME sniffing protection, a strict referrer policy, and a constrained permissions policy. The app does not load third-party scripts.

## Release checks

Every release must pass:

```bash
npm run validate
npm audit --audit-level=high
```
