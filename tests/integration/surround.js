// SPDX-License-Identifier: GPL-3.0-or-later
// Runs only in the private headless Shell from tools/smoke-test.py --surround.
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

function assert(condition, message) {
    if (!condition)
        throw new Error(`Monitor Portals surround test: ${message}`);
}

async function until(predicate, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (predicate())
            return;
        await Scripting.sleep(50);
    }
    throw new Error(`Monitor Portals surround test: timed out: ${message}`);
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

async function applyTestLayout() {
    const [serial, monitors] = await call(DISPLAY_BUS, DISPLAY_PATH, DISPLAY_BUS, 'GetCurrentState');
    assert(monitors.length === 2, `expected two virtual outputs, got ${monitors.length}`);
    const wide = monitors.find(([, modes]) => modes.some(mode => mode[1] === 1280 && mode[2] === 720));
    const small = monitors.find(([, modes]) => modes.some(mode => mode[1] === 800 && mode[2] === 600));
    assert(wide && small && wide !== small, 'virtual monitor modes are missing');
    const wideMode = wide[1].find(mode => mode[1] === 1280 && mode[2] === 720);
    const smallMode = small[1].find(mode => mode[1] === 800 && mode[2] === 600);
    await call(DISPLAY_BUS, DISPLAY_PATH, DISPLAY_BUS, 'ApplyMonitorsConfig',
        new GLib.Variant('(uua(iiduba(ssa{sv}))a{sv})', [serial, 1, [
            [0, 0, 1, 0, true, [[wide[0][0], wideMode[0], {}]]],
            [240, 720, 1, 0, false, [[small[0][0], smallMode[0], {}]]],
        ], {}]));
    await until(() => Main.layoutManager.monitors.length === 2 &&
        Main.layoutManager.monitors.some(monitor => monitor.x === 0 && monitor.y === 0 && monitor.width === 1280) &&
        Main.layoutManager.monitors.some(monitor => monitor.x === 240 && monitor.y === 720 && monitor.width === 800),
    'virtual monitor arrangement');
    await Scripting.sleep(100);
}

async function normalDesktop() {
    Main.overview.hide();
    await until(() => !Main.overview.visible && Main.modalCount === 0, 'normal desktop input state');
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

async function move(device, point) {
    device.notify_absolute_motion(GLib.get_monotonic_time(), point.x, point.y);
    await Scripting.sleep(100);
}

async function button(device, pressed) {
    device.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY,
        pressed ? Clutter.ButtonState.PRESSED : Clutter.ButtonState.RELEASED);
    await Scripting.sleep(100);
}

export async function run() {
    assert(uuid, 'test UUID is missing');
    await until(() => Main.extensionManager.lookup(uuid)?.state === ExtensionState.ACTIVE,
        'extension activation');
    const extension = Main.extensionManager.lookup(uuid).stateObj;
    assert(!extension.getPortalStatus().enabled, 'portals must start disabled');
    await until(() => !Main.layoutManager._startingUp, 'Shell startup completion');
    await applyTestLayout();
    const snapshot = extension.getSnapshot();
    const wideId = snapshot.find(entry => entry.monitor.width === 1280).monitor.id;
    const smallId = snapshot.find(entry => entry.monitor.width === 800).monitor.id;
    const configuration = {mode: 'surround', sourceId: wideId, destinationId: smallId, bidirectional: true};
    extension.configureNavigation(configuration);
    assert(extension.getPortalStatus().mode === 'surround', 'surround mode was not selected');
    assert(extension.getPortalStatus().routes.length === 8, 'bidirectional surround needs eight routes');
    assert(!extension.getPortalStatus().enabled, 'configuration must not implicitly enable navigation');

    const seat = global.stage.get_context().get_backend().get_default_seat();
    const device = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    let pressed = false;
    const prepare = async start => {
        extension.setPortalEnabled(false);
        // Reach either display through the center of the known native seam.
        await move(device, {x: 640, y: 690});
        await move(device, start);
        assertPointer(start, 'source positioning');
        // A newly created virtual device can initially visit the hot corner.
        await normalDesktop();
        extension.setPortalEnabled(true);
        assert(extension.getPortalStatus().enabled, 'surround mode did not enable');
        await Scripting.sleep(100);
    };

    try {
        const scenarios = [
            {name: 'wide top → small bottom', start: {x: 640, y: 40}, edge: {x: 640, y: 0},
                expected: {x: 240 + Math.round(640 / 1279 * 799), y: 1316}},
            {name: 'wide right → small left', start: {x: 1240, y: 360}, edge: {x: 1279, y: 360},
                expected: {x: 243, y: 720 + Math.round(360 / 719 * 599)}},
            {name: 'wide bottom → small top', start: {x: 120, y: 690}, edge: {x: 120, y: 719},
                expected: {x: 240 + Math.round(120 / 1279 * 799), y: 723}},
            {name: 'wide left → small right', start: {x: 40, y: 360}, edge: {x: 0, y: 360},
                expected: {x: 1036, y: 720 + Math.round(360 / 719 * 599)}},
            {name: 'small right → wide left', start: {x: 1000, y: 1020}, edge: {x: 1039, y: 1020},
                expected: {x: 3, y: Math.round(300 / 599 * 719)}},
            {name: 'small bottom → wide top', start: {x: 640, y: 1280}, edge: {x: 640, y: 1319},
                expected: {x: Math.round(400 / 799 * 1279), y: 3}},
            {name: 'small left → wide right', start: {x: 280, y: 1020}, edge: {x: 240, y: 1020},
                expected: {x: 1276, y: Math.round(300 / 599 * 719)}},
        ];
        for (const scenario of scenarios) {
            await prepare(scenario.start);
            await move(device, scenario.edge);
            await until(() => extension.getPortalStatus().lastTransfer !== null,
                `${scenario.name} completion`);
            const status = extension.getPortalStatus();
            assert(status.lastTransfer.success,
                `${scenario.name} failed: ${JSON.stringify(status.lastTransfer)}`);
            assert(status.attempts === 1, `${scenario.name} attempted more than once`);
            assertPointer(scenario.expected, scenario.name);
            const landing = pointer();
            await Scripting.sleep(250);
            assert(extension.getPortalStatus().attempts === 1, `${scenario.name} bounced back`);
            assertPointer(landing, `${scenario.name} stable landing`);
            console.log(`Monitor Portals surround case: PASS ${scenario.name}`);
        }

        // The small monitor's entire top edge already enters the wide monitor.
        // This fourth reverse direction must retain its native coordinates.
        await prepare({x: 640, y: 760});
        await move(device, {x: 640, y: 690});
        assertPointer({x: 640, y: 690}, 'small top native crossing');
        assert(extension.getPortalStatus().attempts === 0, 'native crossing was remapped');
        console.log('Monitor Portals surround case: PASS small top native crossing');

        await prepare({x: 1240, y: 360});
        await button(device, true);
        pressed = true;
        await move(device, {x: 1279, y: 360});
        assertPointer({x: 1279, y: 360}, 'dragging triggered surround');
        assert(extension.getPortalStatus().attempts === 0, 'held button caused an attempt');
        await button(device, false);
        pressed = false;
        await Scripting.sleep(150);
        assert(extension.getPortalStatus().attempts === 0, 'button release triggered surround');

        extension.configureNavigation({...configuration, bidirectional: false});
        assert(!extension.getPortalStatus().enabled, 'return-direction change retained active navigation');
        assert(extension.getPortalStatus().routes.length === 4, 'one-way surround needs four routes');
        await prepare({x: 1000, y: 1020});
        await move(device, {x: 1039, y: 1020});
        assertPointer({x: 1039, y: 1020}, 'one-way mode still rescued reverse direction');
        assert(extension.getPortalStatus().attempts === 0, 'disabled reverse routes caused an attempt');

        extension.configureNavigation({...configuration, sourceId: smallId, destinationId: wideId});
        const swapped = extension.getPortalStatus();
        assert(!swapped.enabled && swapped.sourceId === smallId && swapped.destinationId === wideId,
            'changing the monitor pair failed to stop and update navigation');
        extension.setPortalEnabled(true);
        extension.configureNavigation({...configuration, mode: 'blocked'});
        assert(!extension.getPortalStatus().enabled && extension.getPortalStatus().mode === 'blocked',
            'changing mode retained active surround navigation');
        extension.configureNavigation(configuration);

        const [errors] = await call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
            'GetExtensionErrors', new GLib.Variant('(s)', [uuid]));
        assert(errors.length === 0, `extension errors: ${errors.join('; ')}`);
    } finally {
        if (pressed)
            await button(device, false);
        extension.setPortalEnabled(false);
        device.run_dispose();
    }

    extension.setPortalEnabled(true);
    const tracker = extension._cursorTracker;
    assert(tracker, 'final cleanup check requires enabled navigation');
    const [disabled] = await call('org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
        'DisableExtension', new GLib.Variant('(s)', [uuid]));
    assert(disabled, 'extension disable was rejected');
    await until(() => Main.extensionManager.lookup(uuid)?.state === ExtensionState.INACTIVE,
        'final extension disable');
    assert(extension._cursorTracker === null && extension._engine === null,
        'surround runtime retained after disable');
    assert(tracker._tracker === null && tracker._later === 0, 'tracker callbacks retained after disable');
    console.log('Monitor Portals surround test: PASS');
}
