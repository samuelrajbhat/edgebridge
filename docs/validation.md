# Validation record

## Checkpoint 2 — opt-in portal prototype (0.0.2)

Validated on 2026-11-16 on the same GNOME Shell 50.1 environment below.

| Check | Result |
| --- | --- |
| GJS syntax and metadata | Pass |
| Unit tests | 61/61 pass (39 geometry/lifecycle/report + 22 mapping/navigation/path tests) |
| Package contents and integrity | Pass |
| Isolated lifecycle regression | Pass, three disable/re-enable cycles |
| Two virtual monitors | 1280×720 at (0,0), 800×600 at (240,720) |
| Left blocked-edge transfer | (120,719) → (315,723), pass |
| Right blocked-edge transfer | (1160,719) → (965,723), pass |
| Portal starts disabled and panel switch enables it | Pass |
| Native seam and held-button suppression | Pass |
| Stationary landing without repeated attempts | Pass |
| Injected non-moving seat | One timeout, no retries while remaining at edge |
| Temporary destination removal | Portal disables and route clears |
| Disable with portal active | Tracker, scheduled callback, engine, and transport cleaned up |
| Wrapper exit and temporary service cleanup | Both test modes exit 0 |

Commands: `make check`, `make pack`, `python3 tools/smoke-test.py`, and
`python3 tools/smoke-test.py --portal`. Logs are `.build/smoke-test.log` and
`.build/portal-test.log`. Both runs produced their PASS marker. The injected
failure intentionally produces a `warp-timeout` entry in the portal log.

The virtual pointer initially activated GNOME's hot corner, so the test now
dismisses Overview after device setup. The portal's Overview suppression worked.
The runner also waits for the private document portal's FUSE mount to close
before deleting temporary directories, resolving a shutdown race.

This is ready for a controlled desktop trial. Physical devices, fractional/mixed
scaling at runtime, real application confinement, unusual pointer barriers, and
response time remain unverified. Tests of an injected refusal prove the timeout
and rearm behavior, not game-confinement compatibility. The four-step transport
has not been optimized for the plan's two-frame responsiveness target.

## Checkpoint 1 — historical baseline (0.0.1)

Recorded on 2026-11-16.

## Environment

- Ubuntu 26.04.1 LTS
- GNOME Shell 50.1, Wayland
- GJS 1.88.0
- Node.js/npm absent; all local checks use GJS and Python 3
- `gnome-shell-test-tool` available; optional `mutter-devkit` absent

## Completed checks

| Check | Result |
| --- | --- |
| Git repository | Initialized on `main`; files left uncommitted |
| GJS module syntax and extension metadata | Pass |
| Pure geometry tests | 24/24 pass |
| Monitor manager signal/lifecycle tests | 11/11 pass |
| Report formatting tests | 4/4 pass |
| Ultrawide example | Shared `[760, 2680)`; blocked `[0, 760)`, `[2680, 3440)` |
| GNOME extension ZIP contents and integrity | Pass |
| GNOME 50.1 headless session | Pass |
| Snapshot compared with Shell logical geometry | Pass |
| Three disable/re-enable cycles and final disable | Pass |
| Extension error registry | Empty |

The integration test used a private D-Bus session, temporary settings/data
directories, and a virtual 1280 × 720 display. It did not install the extension
into the normal desktop session or change physical display configuration.
Its log is generated at `.build/smoke-test.log` (ignored by Git). The session
logged unrelated background/portal warnings; no Monitor Portals extension error
was reported. The successful test marker and process exit were both checked.

## Outstanding acceptance

Physical monitor discovery, mixed scaling, hotplug, panel usability, and actual
edge intervals still need comparison on the user's desktop. Unit tests simulate
those geometry and lifecycle cases; the headless run covers a single virtual
monitor. No cursor movement, navigation performance, barriers, or confinement
behavior has been tested because those modules are not implemented yet.

These were the outstanding checks at the end of checkpoint 1. The checkpoint 2
record above describes the subsequent cursor implementation and its limits.
