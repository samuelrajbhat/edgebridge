# Monitor Portals

A GNOME Shell extension for configurable navigation between monitors of different
sizes. **Current milestone: an opt-in, single-route cursor portal prototype.**

The inspector shows each logical monitor's position, size, scale, and shared or
blocked intervals along its four edges. It refreshes on display-layout changes
and provides a panel menu and Shell log report. The panel also offers one route
between adjacent displays with a shared seam and blocked edge sections. Turn on
**Enable prototype portal** to rescue outward movement at those blocked sections.
It preserves native crossings and suppresses transfers during dragging, Overview,
and Shell modal dialogs. The portal starts disabled and turns off on layout changes.

Targets **GNOME Shell 50 on Wayland**, implemented in JavaScript/GJS. Development
and isolated integration testing were performed on GNOME Shell 50.1, GJS 1.88.0,
and Ubuntu 26.04.1.

## Test the prototype

From this directory:

```bash
make check   # Syntax, metadata, and 61 unit tests
make demo    # Inspect the plan's illustrative ultrawide/laptop geometry
make pack    # Build and validate an installable extension ZIP
make smoke   # Test the extension in an isolated, headless GNOME session
make portal-test # Test actual cursor transfers between two virtual monitors
```

The local workflow uses GJS, Make, Python 3, and GNOME's extension tools. Node.js
is optional; `npm test` runs the same portable unit tests when it is installed.
No third-party JavaScript dependencies are needed.

The package is `.build/monitor-portals@monitormap.local.shell-extension.zip`.
See [installation](docs/installation.md) for installing it on your desktop and
opening the monitor icon in the top panel and testing your displays. The UUID is provisional for local
development; choose a permanent publishing identity before release.

## Example result

For a 3440 × 1440 ultrawide at `(0, 0)` above a 1920 × 1080 laptop at
`(760, 1440)`, the ultrawide's bottom edge contains:

| Portion | Logical x interval |
| --- | --- |
| Blocked left | `[0, 760)` |
| Native shared boundary | `[760, 2680)` |
| Blocked right | `[2680, 3440)` |

Intervals are half-open and coordinates are already logical desktop units.
Scaling is reported separately. “Blocked” describes monitor geometry; pointer
barriers and application confinement remain separate from geometric analysis.
Transfers use verified steps through the native seam and stop on refusal.

## Progress

- Implemented monitor discovery, edge analysis, reporting, and cleanup.
- Passed 61 unit tests covering geometry, mapping, safety, routes, and transport paths.
- Passed real GNOME 50.1 headless geometry and repeated enable/disable checks.
- Verified both blocked-edge transfers, native crossings, drag suppression, and
  layout invalidation using two virtual monitors.
- Verified timeout and no repeated retry with an injected non-moving seat.
- Built and validated the installable archive.
- Pending: physical monitor trials, mixed scaling, real application confinement,
  and performance measurements. This is a prototype, not the v0.1 MVP.

The [roadmap](docs/roadmap.md) keeps the project in checkpoint order and records
the next acceptance gate. See [architecture](docs/architecture.md),
[validation results](docs/validation.md), and [troubleshooting](docs/troubleshooting.md).
The supplied project plan is preserved in [docs/source-plan.txt](docs/source-plan.txt).

## License

GPL-3.0-or-later; see [LICENSE](LICENSE). Cursor Wrap was studied as a technical
reference for future work; no source from that project was copied into this
checkpoint.
