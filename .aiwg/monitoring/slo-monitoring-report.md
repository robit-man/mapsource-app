# Initial SLO monitoring — v0.1.0

Date: 2026-09-26  
Window: immediate post-deployment observation

## Service state

| Signal | Observation |
|---|---|
| systemd active state | `active/running` |
| restarts | 0 |
| resident memory | 56,991,744 bytes at final sample |
| warning-or-higher journal entries | 0 |
| public readiness availability | 5/5 successful |
| public readiness latency | 71.8–77.8 ms total |

The five public readiness samples were taken one second apart through Cloudflare. Initial representative production calls were 212 ms for route calculation and 200 ms for an uncached satellite tile.

## Threshold assessment

- Availability: healthy in the observation window.
- Readiness latency: below 100 ms for all five samples.
- Route latency: below the 1 second launch threshold.
- Error state: no service warnings or process restarts.

This is deployment verification, not a statistically meaningful long-term SLO window. Ongoing availability, latency percentile, saturation, and upstream error-rate monitoring should use the normal Mapsource telemetry stack.

