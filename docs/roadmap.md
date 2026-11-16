# Stepwise implementation

Work follows the supplied plan's checkpoints. The first deliverable combines the
extension setup from phase 1 and the read-only geometry work from phase 2.
Checkpoint 2 now adds an opt-in, single-route prototype tested in isolation.

## Checkpoint 1 — Monitor Geometry Inspector

- [x] Initialize the Git repository on `main`.
- [x] Initialize a GNOME Shell 50 ES-module extension.
- [x] Verify logical-monitor, scale, and layout-change APIs against GNOME 50.1.
- [x] Research cursor-tracker, warp, and redraw APIs for later work.
- [x] Implement half-open rectangle validation and all-four-edge analysis.
- [x] Support several neighbors, offsets, gaps, and fractional logical coordinates.
- [x] Display snapshots in a panel menu and Shell logs.
- [x] Refresh on layout changes and disconnect signals on disable.
- [x] Verify geometry, lifecycle, error recovery, and report formatting in unit tests.
- [x] Package and validate an independently installable ZIP.
- [x] Run a private headless GNOME session and verify repeated enable/disable.
- [ ] Compare the report against the actual ultrawide/laptop layout.
- [ ] Verify physical monitor unplug/replug and supported scaling changes.

**Acceptance gate:** the inspector must agree with Settings → Displays on the
actual hardware, update when that layout changes, and disable cleanly. Automated
checks pass; physical acceptance remains open.

## Checkpoint 2 — One cursor portal

The user requested the next implementation step while physical geometry checks
remain open. Development and compositor validation therefore use virtual monitors;
hardware acceptance remains a separate gate before calling the tool an MVP.

- [x] Pointer tracking coalesced to at most one check per redraw.
- [x] Pure proportional mapping and landing-inset calculations.
- [x] Outward approach detection at a blocked segment, preserving native seams.
- [x] Button suppression and disarming after successful or refused attempts.
- [x] Event-driven, verified transport through an adjacent monitor seam.
- [x] Demonstrate both blocked regions of one directed route in isolated GNOME.
- [x] Verify menu opt-in, layout invalidation, and active-portal cleanup.
- [x] Verify a refused-warp timeout and no repeated attempts with an injected seat.
- [ ] Test physical monitors and real application confinement.
- [ ] Measure response time; the four-step prototype has no two-frame guarantee.

**Acceptance gate:** one route lands where expected, does not interfere with
native crossings or dragging, and does not repeatedly retry a refused warp.
These checks pass in the isolated session; hardware acceptance is still pending.

## Checkpoint 3 — Edge Equalizer MVP (v0.1)

Add bidirectional blocked-edge rescue, route invalidation on layout changes,
rearming, and cooldown behavior. Test the original ultrawide/laptop arrangement.

**Acceptance gate:** both outer ultrawide regions reach the laptop; the native
shared edge stays normal; return movement is predictable; dragging is unaffected;
disabling restores ordinary navigation without changing display configuration.

## Later milestones

| Milestone | Deliverable | Gate |
| --- | --- | --- |
| v0.2 | Surround mode and custom directed routes | Ambiguity, routing, and safety tests pass |
| v0.3 | GTK4/Libadwaita preferences and GSettings | Configure and persist routes without editing code |
| v0.4 | Hotplug, scaling, confinement, performance | Hardware and compositor regression matrix passes |
| v1.0 | Documentation, packaging, public release | Fresh-install acceptance and permanent UUID |
| Future | Full-edge interception and visual editor | Separate compositor feasibility investigation |

Stable hardware identity must be implemented before saving routes. Current
`monitor-N` IDs belong only to the current snapshot. Full-edge proportional
mapping is separate from the blocked-edge rescue MVP and remains unproven.
