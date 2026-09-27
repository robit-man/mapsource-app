# Solution profile

- Profile: Production
- Tailoring: compact artifacts appropriate to a single-service public example, with full release gates because it is internet-facing and carries a service credential.
- Security: threat boundaries documented; no credential in browser; audit must show zero high/critical advisories.
- Reliability: systemd supervision, readiness checks, Cloudflare ingress, rollback runbook.
- Process: requirements-to-test traceability, architecture decision, deployment evidence, live smoke verification.
- Data: public geospatial data only; no durable user records.
