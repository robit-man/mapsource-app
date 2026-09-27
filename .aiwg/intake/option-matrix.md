# Option matrix

| Dimension | Selection | Rationale |
|---|---|---|
| Audience | Public developers and prospective customers | The app is both a usable trail planner and package proof. |
| Scale | Initial public demo, globally reachable | Edge ingress with a single local origin; Mapsource quotas remain the main capacity boundary. |
| Deployment | Client-server, single supervised host | A backend is required to protect the Mapsource key. |
| Persistence | Stateless | Routes and searches are ephemeral; no user database is needed. |
| Frontend | React + TypeScript + MapLibre | Strong interaction model and direct vector-map control. |
| Backend | Node + Fastify + `mapsource` | Minimal typed credential boundary with bounded binary relays. |
| Hosting | Existing host + Cloudflare Tunnel | Reuses current Mapsource origin and avoids opening a public port. |
| Security | Strong | Public app holds a service credential and proxies paid resources. |
| Reliability | Production | Public hostname, health probes, supervision, rollback. |
| Delivery | Direct to `main` after gates | Small greenfield repository with owner authorization. |

Rejected alternatives:

- Browser-direct Mapsource key: rejected because it exposes a reusable subscription credential.
- General upstream proxy: rejected because it creates SSRF and quota-abuse risk.
- Static-only deployment: rejected because authenticated routing and tiles require a server boundary.
- Satellite tile archive: rejected because it creates storage, freshness, and licensing problems; interactive relay only.
