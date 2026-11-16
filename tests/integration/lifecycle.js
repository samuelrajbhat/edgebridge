// Runs only inside the private Shell started by tools/smoke-test.py.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

export const METRICS = {};

const uuid = GLib.getenv('MONITOR_PORTALS_TEST_UUID');

function assert(condition, message) {
    if (!condition)
        throw new Error(`Monitor Portals smoke test: ${message}`);
}

function callExtensionMethod(method) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(
            'org.gnome.Shell', '/org/gnome/Shell', 'org.gnome.Shell.Extensions',
            method, new GLib.Variant('(s)', [uuid]), null,
            Gio.DBusCallFlags.NONE, 5000, null,
            (connection, result) => {
                try {
                    resolve(connection.call_finish(result).deepUnpack());
                } catch (error) {
                    reject(error);
                }
            });
    });
}

async function waitForState(state) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const extension = Main.extensionManager.lookup(uuid);
        assert(extension?.state !== ExtensionState.ERROR,
            `extension entered ERROR state: ${extension?.error}`);
        assert(extension?.state !== ExtensionState.OUT_OF_DATE,
            'extension is incompatible with this GNOME version');
        if (extension?.state === state)
            return extension;
        await Scripting.sleep(100);
    }
    throw new Error(`Monitor Portals smoke test: timed out waiting for state ${state}`);
}

function verifyGeometry(extension) {
    const snapshot = extension.stateObj.getSnapshot();
    assert(Array.isArray(snapshot) && snapshot.length > 0, 'no geometry snapshot');
    assert(snapshot.length === Main.layoutManager.monitors.length, 'monitor count mismatch');
    for (let index = 0; index < snapshot.length; index++) {
        const {monitor, edges} = snapshot[index];
        const actual = Main.layoutManager.monitors[index];
        for (const property of ['x', 'y', 'width', 'height']) {
            assert(monitor[property] === actual[property],
                `monitor ${index} ${property} differs from GNOME logical geometry`);
        }
        for (const edge of ['top', 'right', 'bottom', 'left'])
            assert(edges[edge]?.end > edges[edge]?.start, `missing ${edge} edge`);
    }
    assert(extension.stateObj._indicator, 'panel indicator was not created');
    assert(extension.stateObj._monitorManager, 'monitor manager was not created');
}

export async function run() {
    assert(uuid, 'test UUID not configured');
    const initial = await waitForState(ExtensionState.ACTIVE);
    verifyGeometry(initial);

    for (let cycle = 0; cycle < 3; cycle++) {
        const [disabled] = await callExtensionMethod('DisableExtension');
        assert(disabled, 'DisableExtension rejected request');
        const inactive = await waitForState(ExtensionState.INACTIVE);
        for (const property of ['_monitorManager', '_indicator', '_snapshot'])
            assert(inactive.stateObj[property] === null, `${property} retained after disable`);

        const [enabled] = await callExtensionMethod('EnableExtension');
        assert(enabled, 'EnableExtension rejected request');
        const active = await waitForState(ExtensionState.ACTIVE);
        verifyGeometry(active);
    }

    const [errors] = await callExtensionMethod('GetExtensionErrors');
    assert(errors.length === 0, `extension errors: ${errors.join('; ')}`);
    assert((await callExtensionMethod('DisableExtension'))[0], 'final disable rejected');
    await waitForState(ExtensionState.INACTIVE);
    console.log('Monitor Portals smoke test: PASS');
}
