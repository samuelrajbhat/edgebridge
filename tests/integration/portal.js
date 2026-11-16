// SPDX-License-Identifier: GPL-3.0-or-later
// Runs only in the private headless Shell started by tools/smoke-test.py --portal.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export const METRICS = {};

const uuid = GLib.getenv('MONITOR_PORTALS_TEST_UUID');
const DISPLAY_BUS = 'org.gnome.Mutter.DisplayConfig';
const DISPLAY_PATH = '/org/gnome/Mutter/DisplayConfig';
const PAUSE_MS = 100;

function assert(condition, message) {
    if (!condition)
        throw new Error(`Monitor Portals portal test: ${message}`);
}

async function until(predicate, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate())
            return;
        await Scripting.sleep(50);
    }
    throw new Error(`Monitor Portals portal test: timed out: ${message}`);
}

function call(bus, path, iface, method, parameters = null) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(bus, path, iface, method, parameters, null,
            Gio.DBusCallFlags.NONE, 5000, null, (connection, result) => {
                try {
                    resolve(connection.call_finish(result).deepUnpack());
                } catch (error) {
                    reject(error);
                }
            });
    });
}

async function applyTestLayout(singleMonitor = false) {
    const [serial, monitors] = await call(DISPLAY_BUS, DISPLAY_PATH, DISPLAY_BUS, 'GetCurrentState');
    assert(monitors.length === 2, `expected exactly two test outputs, got ${monitors.length}`);
    const wide = monitors.find(([, modes]) => modes.some(mode => mode[1] === 1280 && mode[2] === 720));
    const narrow = monitors.find(([, modes]) => modes.some(mode => mode[1] === 800 && mode[2] === 600));
    assert(wide && narrow && wide !== narrow, 'test virtual monitor modes are missing');
    const wideMode = wide[1].find(mode => mode[1] === 1280 && mode[2] === 720);
    const narrowMode = narrow[1].find(mode => mode[1] === 800 && mode[2] === 600);
    const logical = [[0, 0, 1, 0, true, [[wide[0][0], wideMode[0], {}]]]];
    if (!singleMonitor)
        logical.push([240, 720, 1, 0, false, [[narrow[0][0], narrowMode[0], {}]]]);

    // Method 1 changes only the private compositor's current layout.
    await call(DISPLAY_BUS, DISPLAY_PATH, DISPLAY_BUS, 'ApplyMonitorsConfig',
        new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial, 1, logical, {}]));
    await until(() => Main.layoutManager.monitors.length === (singleMonitor ? 1 : 2) &&
        Main.layoutManager.monitors.some(monitor => monitor.x === 0 && monitor.y === 0 && monitor.width === 1280) &&
        (singleMonitor || Main.layoutManager.monitors.some(monitor => monitor.x === 240 && monitor.y === 720)),
    'monitor layout refresh');
    await Scripting.sleep(PAUSE_MS);
}

function pointer() {
    const [x, y] = global.get_pointer();
    return {x, y};
}

function assertPointer(expected, message) {
    const actual = pointer();
    assert(Math.abs(actual.x - expected.x) <= 1 && Math.abs(actual.y - expected.y) <= 1,
        `${message}: expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`);
}

async function move(device, x, y) {
    device.notify_absolute_motion(GLib.get_monotonic_time(), x, y);
    await Scripting.sleep(PAUSE_MS);
}

async function button(device, pressed) {
    device.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY,
        pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
    await Scripting.sleep(PAUSE_MS);
}

export async function run() {
    assert(uuid, 'test UUID not configured');
    await until(() => Main.extensionManager.lookup(uuid)?.state === ExtensionState.ACTIVE,
        'extension activation');
    const extension = Main.extensionManager.lookup(uuid).stateObj;
    assert(!extension.getPortalStatus().enabled, 'portal must be opt-in');
    await until(() => !Main.layoutManager._startingUp, 'Shell startup completion');
    Main.overview.hide();
    await until(() => !Main.overview.visible, 'overview dismissal');
    await applyTestLayout();
    Main.overview.hide();
    await until(() => !Main.overview.visible && Main.modalCount === 0, 'normal desktop input mode');

    const status = extension.getPortalStatus();
    assert(status.route?.source.edge === 'bottom' && status.route?.destination.edge === 'top',
        `expected a bottom-to-top route, got ${JSON.stringify(status.route)}`);
    const source = extension.getSnapshot().find(entry => entry.monitor.id === status.route.source.monitor);
    assert(source.edges.bottom.blocked.length === 2, 'both outer blocked intervals must be discovered');

    const seat = global.stage.get_context().get_backend().get_default_seat();
    const device = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    let pressed = false;
    try {
        // Pointer placement while disabled must preserve the blocked edge.
        await move(device, 120, 700);
        await move(device, 120, 719);
        assertPointer({x: 120, y: 719}, 'disabled portal moved the pointer');
        // Adding a virtual device may visit the hot corner at its initial origin.
        // Dismiss Overview after positioning the new pointer, not only before it.
        Main.overview.hide();
        await until(() => !Main.overview.visible && Main.modalCount === 0, 'pointer setup overview dismissal');
        const toggle = extension._indicator.menu._getMenuItems()
            .find(item => item.label?.text === 'Enable prototype portal');
        assert(toggle, 'portal switch was not created');
        toggle.toggle();
        assert(extension.getPortalStatus().enabled, 'portal failed to enable');

        // Move away before the deliberate approach so direction has a baseline.
        await move(device, 120, 690);
        await move(device, 120, 719);
        await until(() => extension.getPortalStatus().attempts === 1, 'first portal attempt');
        await until(() => extension.getPortalStatus().lastTransfer !== null, 'first transfer completion');
        assert(extension.getPortalStatus().lastTransfer?.success,
            `first transfer failed: ${JSON.stringify(extension.getPortalStatus().lastTransfer)}`);
        assertPointer({x: 240 + Math.round(120 / 1279 * 799), y: 723}, 'left blocked-edge landing');

        const landed = pointer();
        await Scripting.sleep(350);
        assert(extension.getPortalStatus().attempts === 1, 'landing retriggered a transition');
        assertPointer(landed, 'stationary landing drifted');

        // Shared-edge motion should stay at the native requested coordinates.
        await move(device, 640, 690);
        await move(device, 640, 745);
        assertPointer({x: 640, y: 745}, 'native seam was remapped');
        assert(extension.getPortalStatus().attempts === 1, 'native seam triggered a portal');

        await move(device, 1160, 690);
        await button(device, true);
        pressed = true;
        await move(device, 1160, 719);
        assertPointer({x: 1160, y: 719}, 'held button allowed a portal');
        assert(extension.getPortalStatus().attempts === 1, 'held button triggered an attempt');
        await button(device, false);
        pressed = false;
        await Scripting.sleep(200);
        assert(extension.getPortalStatus().attempts === 1, 'releasing at the edge triggered a portal');

        await move(device, 1160, 690);
        await move(device, 1160, 719);
        await until(() => extension.getPortalStatus().attempts === 2, 'second portal attempt');
        await until(() => !extension._portalBusy, 'second transfer completion');
        assert(extension.getPortalStatus().lastTransfer?.success,
            `second transfer failed: ${JSON.stringify(extension.getPortalStatus().lastTransfer)}`);
        assertPointer({x: 240 + Math.round(1160 / 1279 * 799), y: 723}, 'right blocked-edge landing');

        // Inject a non-moving seat only in this private test. This verifies the
        // actual async timeout/controller path, not application confinement.
        extension.setPortalEnabled(false);
        await move(device, 640, 690);
        await move(device, 120, 690);
        extension.setPortalEnabled(true);
        let warpCalls = 0;
        extension._pointerTransport._seat = {warp_pointer: () => warpCalls++};
        await move(device, 120, 695);
        await move(device, 120, 719);
        await until(() => extension.getPortalStatus().lastTransfer !== null, 'refused warp timeout');
        assert(!extension.getPortalStatus().lastTransfer.success, 'refused warp reported success');
        assert(extension.getPortalStatus().lastTransfer.reason === 'warp-timeout', 'unexpected refusal reason');
        await move(device, 125, 718);
        await move(device, 125, 719);
        await Scripting.sleep(300);
        assert(warpCalls === 1 && extension.getPortalStatus().attempts === 1,
            'refused warp retried while still at the boundary');

        // A layout invalidation must stop tracking and require explicit opt-in.
        await applyTestLayout(true);
        assert(!extension.getPortalStatus().enabled, 'layout change retained an active portal');
        assert(extension.getPortalStatus().route === null, 'removed destination retained a route');
        assert(extension._cursorTracker === null, 'layout change retained cursor tracking');

        const [errors] = await call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
            'GetExtensionErrors', new GLib.Variant('(s)', [uuid]));
        assert(errors.length === 0, `extension errors: ${errors.join('; ')}`);
    } finally {
        if (pressed)
            await button(device, false);
        extension.setPortalEnabled(false);
        device.run_dispose();
    }

    await applyTestLayout();
    extension.setPortalEnabled(true);
    const tracker = extension._cursorTracker;
    const transport = extension._pointerTransport;
    assert(tracker && transport, 'final cleanup test needs an enabled portal');
    const [disabled] = await call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
        'DisableExtension', new GLib.Variant('(s)', [uuid]));
    assert(disabled, 'final extension disable failed');
    await until(() => Main.extensionManager.lookup(uuid)?.state === ExtensionState.INACTIVE,
        'final extension disable');
    for (const property of ['_monitorManager', '_indicator', '_snapshot', '_cursorTracker', '_pointerTransport', '_engine'])
        assert(extension[property] === null, `${property} retained after disable`);
    assert(tracker._tracker === null && tracker._later === 0, 'cursor callbacks retained after disable');
    assert(transport._stopped && transport._cancel === null, 'transport retained after disable');
    console.log('Monitor Portals portal test: PASS');
}
