# Troubleshooting

## Portal does not activate

Open the panel menu and check the route and **Enable prototype portal** switch.
It starts off and resets on display-layout changes. An eligible route needs two
adjacent displays, a direct shared seam, and a blocked portion on the source edge.
Equal facing edges and disconnected displays do not produce a route.

Close the menu and Overview, release mouse buttons, move a few pixels inward,
then approach the indicated blocked edge. Sliding along an edge or releasing a
button while already there does not trigger a transfer. After a refused warp,
move inward before trying again. Look for `[Monitor Portals] Portal stopped` in
the Shell logs for timeout or interrupted-movement details. The prototype stops
at the first unverified waypoint and may leave the pointer at an intermediate
position.

Use `make portal-test` for a hardware-independent trial. Its log is
`.build/portal-test.log`. That test deliberately injects one failed warp, so a
single `warp-timeout` line followed by the PASS marker is expected there.

## Find the relevant logs

For the isolated smoke test, inspect `.build/smoke-test.log`. To locate extension
reports, exceptions, and the final test result:

```bash
rg -n -F -e '[Monitor Portals]' -e 'Monitor Portals smoke test:' -e 'JS ERROR' .build/smoke-test.log
```

The geometry reports span multiple lines. Read the surrounding log when checking
their coordinates; the filter above shows only matching lines.

For your desktop session, follow Shell logs in a terminal:

```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

Open the panel indicator and choose **Refresh inspection**. Its report starts
with `[Monitor Portals]`. To search the current boot's reports with context:

```bash
journalctl -b -o cat /usr/bin/gnome-shell | rg -A 80 -F '[Monitor Portals]'
```

GNOME may log unrelated warnings, particularly in headless sessions. The smoke
test requires a successful process exit and its explicit PASS marker. Do not
assume an unrelated warning is an extension error, or that seeing one geometry
report means the whole test passed.

## Extension is missing or out of date

Check the Shell version and extension status:

```bash
gnome-shell --version
gnome-extensions info monitor-portals@monitormap.local
```

This checkpoint declares support for Shell `50`. Do not bypass version checking
to infer compatibility with another major version. Confirm `make pack` completed
and install the generated ZIP. If a new installation is not listed, log out and
back in before enabling it. GNOME Shell 50 runs on Wayland and cannot use the old
X11 in-place restart workflow.

If changes do not appear, rebuild and reinstall the archive, then start a fresh
Shell session. Loaded JavaScript is cached; toggling the extension is useful for
lifecycle testing but does not guarantee a code reload.

## Inspection failed or no monitors appear

**Inspection failed; see Shell logs** indicates an error reading or validating
the layout. The extension clears old geometry and logs the failure. Look for
`[Monitor Portals] Monitor inspection failed`. The validator rejects nonfinite
coordinates, nonpositive dimensions, duplicate IDs, and overlapping logical
rectangles. Capture the error and the monitor arrangement for investigation.

**No logical monitors detected** is an empty snapshot, which can occur when no
logical displays are available. Reconnect a display and use **Refresh
inspection**. The monitor-change signal also triggers a new inspection.

## Coordinates or monitor labels seem different

Sizes and positions are logical desktop units, not necessarily the physical
panel's pixel resolution. Scaling is printed separately and is not applied a
second time. Negative coordinates are valid. For a right edge, `x + width` is
the exclusive boundary; the last pixel center is inside it.

`monitor-0`, `monitor-1`, and the panel's monitor numbers describe the current
Shell layout. They are not persistent hardware identities and may change after
hotplugging. A blocked interval means there is no geometrically adjacent monitor
across it; this inspector does not measure pointer barriers or confinement.

The sample from `make demo` is illustrative. Compare the panel report with your
actual **Settings → Displays** arrangement when validating the hardware.

## Smoke test cannot start or times out

Confirm `dbus-run-session`, `gnome-shell-test-tool`, and `gnome-shell` are
available. Run `make pack` before invoking `tools/smoke-test.py` directly. Read
the beginning and end of `.build/smoke-test.log` for the first failure.

An `Operation not permitted` or permission error while creating a D-Bus or
Wayland socket can come from the execution sandbox. Run the same isolated test
with the needed execution permission or from a regular desktop terminal. Keep
the wrapper's temporary XDG directories and private D-Bus session in use.

On a slow software renderer, the default 60-second deadline may expire. After
checking the log for errors, a longer run is available with:

```bash
python3 tools/smoke-test.py --timeout 120
```

A timeout stops the test's own process group. It is not a passing result. The
smoke test covers virtual-monitor geometry and lifecycle; real hotplug and mixed
scaling acceptance still need hardware testing.

## Interactive devkit reports a missing executable

If `gnome-shell --devkit --wayland` cannot find `/usr/libexec/mutter-devkit`, the
optional Ubuntu dependency is `mutter-dev-bin`. The project's `make smoke`
workflow uses headless Shell and does not need that executable.

References: [GNOME debugging guide](https://gjs.guide/extensions/development/debugging.html)
and [GNOME Shell 50 compatibility notes](https://gjs.guide/extensions/upgrading/gnome-shell-50.html).
