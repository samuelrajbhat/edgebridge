# Development and installation

This version includes the geometry inspector and an opt-in cursor portal
prototype. It targets GNOME Shell 50. The portal starts disabled and display
settings are not changed by the extension. The provisional local UUID is
`monitor-portals@monitormap.local`.

## Check and package

Run commands from the project directory. Basic checks need `make` and `gjs`;
packaging also needs `gnome-extensions` and Python 3. Node.js and npm are optional
for running the portable unit tests and are not required by this workflow.

```bash
make check
make demo
make pack
```

`make check` parses the JavaScript modules, validates metadata, and runs the unit
tests. `make demo` prints the plan's illustrative 3440 × 1440 ultrawide above a
1920 × 1080 laptop. The demo is synthetic data, not a reading of this computer.
For that example, the ultrawide's bottom edge is shared over `[760, 2680)` and
blocked over `[0, 760)` and `[2680, 3440)`.

`make pack` reruns the checks, packages the runtime files, and validates the
archive's contents. Its output is:

```text
.build/monitor-portals@monitormap.local.shell-extension.zip
```

This checkpoint has no preferences window or GSettings schema to compile.

## Run the isolated integration test

With GNOME Shell 50, `gnome-shell-test-tool`, and `dbus-run-session` installed:

```bash
make smoke
make portal-test
```

The wrapper starts a separate D-Bus session and headless Shell. `make smoke`
uses one virtual monitor; `make portal-test` uses two, arranged like a wide
monitor above a narrower laptop. Temporary XDG directories and a keyfile settings backend keep the test
extension installation and settings separate from your normal session. Software
rendering is requested. It does not install the extension into your normal
extension directory or reconfigure your physical displays.

The test checks the snapshot against Shell geometry, runs three disable/enable
cycles, checks for extension errors, and disables the extension before exiting.
Output is saved to `.build/smoke-test.log`. Success requires both a zero exit
status and the marker `Monitor Portals smoke test: PASS`. The default timeout is
60 seconds. To change it after packaging:

```bash
python3 tools/smoke-test.py --timeout 120
```

The portal test checks actual left/right blocked-edge landings, native crossings,
button suppression, layout invalidation, and cleanup while enabled. An injected
non-moving seat tests the timeout/no-retry path; this does not prove application
confinement behavior. Its log is `.build/portal-test.log` and success marker is
`Monitor Portals portal test: PASS`. You can also run it directly after packaging:

```bash
python3 tools/smoke-test.py --portal
```

This test still needs permission to create its local bus and display sockets.
A sandbox denial does not establish an extension failure. See
[troubleshooting](troubleshooting.md) for interpreting the log.

## Install in your desktop session

After the automated checks, install the built archive as your normal desktop
user:

```bash
gnome-extensions install --force .build/monitor-portals@monitormap.local.shell-extension.zip
```

Save your work, then log out and back in if this is a new installation or if
Shell has already loaded an earlier copy. GNOME caches loaded extension code;
disable/enable alone does not reliably reload edited JavaScript. Enable it with:

```bash
gnome-extensions enable monitor-portals@monitormap.local
gnome-extensions info monitor-portals@monitormap.local
```

Open the monitor icon in the top panel. Each monitor submenu shows its position,
logical size, scale, and shared or blocked edge intervals. **Refresh inspection**
requests another report. Layout changes should also refresh it automatically.

Verify the reported layout against **Settings → Displays**, including any
scaling in use. Physical unplug/replug and scaling changes need to be checked on
the actual hardware; a successful headless test alone does not complete those
acceptance checks.

## Try a portal on your monitors

1. In the panel menu, verify the displayed route, for example **Monitor 1 bottom
   → Monitor 2 top**. The current prototype selects one directed route with
   blocked sections and a direct native seam. If no eligible route exists, the
   menu says so.
2. Turn on **Enable prototype portal**, then close the menu. It is a session-only
   switch and starts off after every extension enable.
3. Move inward on the source monitor, then approach a blocked section of the
   indicated edge with no mouse button held. The pointer should land a few logical
   pixels inside the destination at a proportional position. For the wide-above-
   laptop case, try both far-left and far-right sections.
4. Cross through the existing shared seam. Movement should remain normal. Hold
   a mouse button while approaching a blocked section; no portal should occur.
5. Turn the switch off to stop transfers. A layout, resolution, or scaling change
   also turns it off; inspect the updated route before enabling it again.

This is one directed route. Bidirectional configuration, saved routes, and a
preferences window come later. The extension suspends portals in Overview and
Shell modal dialogs. Physical devices, mixed scaling, games with pointer
confinement, and latency still need acceptance testing. Move inward and approach
again if a warp was refused; the prototype intentionally does not retry in place.

To stop the extension:

```bash
gnome-extensions disable monitor-portals@monitormap.local
```

## Optional interactive development session

For a desktop inside a window, GNOME 49 and later use:

```bash
dbus-run-session gnome-shell --devkit --wayland
```

On Ubuntu, `/usr/libexec/mutter-devkit` is supplied by `mutter-dev-bin`. Install
that optional package only if you need this interactive workflow. It is not
required for `make check`, `make demo`, `make pack`, or the headless smoke test.

A development-kit session has its own D-Bus session but otherwise offers limited
isolation and normally uses your existing home and settings. Use the automated
headless wrapper above for the project's isolated lifecycle check. If using the
interactive session, enable the extension from a terminal inside that session
and restart that nested Shell after source changes.

References: [GNOME extension development](https://gjs.guide/extensions/development/creating.html),
[GNOME debugging and nested sessions](https://gjs.guide/extensions/development/debugging.html),
and [GNOME 50 test-tool changes](https://gjs.guide/extensions/upgrading/gnome-shell-50.html).

