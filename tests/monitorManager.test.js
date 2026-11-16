// SPDX-License-Identifier: GPL-3.0-or-later
import {MonitorManager} from '../core/monitorManager.js';
import {assert, deepEqual, equal, test, throws} from './harness.js';

function shellMonitor(index, x = 0, y = 0, width = 100, height = 100, scale = 1) {
    return {index, x, y, width, height, geometry_scale: scale};
}

class FakeLayoutManager {
    constructor(monitors = [shellMonitor(0)], primaryIndex = 0) {
        this.monitors = monitors;
        this.primaryIndex = primaryIndex;
        this.handlers = new Map();
        this.connectCalls = 0;
        this.disconnectCalls = 0;
        this.nextSignalId = 1;
    }

    connect(name, callback) {
        equal(name, 'monitors-changed');
        const signalId = this.nextSignalId++;
        this.handlers.set(signalId, callback);
        this.connectCalls++;
        return signalId;
    }

    disconnect(signalId) {
        assert(this.handlers.delete(signalId), 'Cannot disconnect an absent handler');
        this.disconnectCalls++;
    }

    emitMonitorsChanged() {
        for (const callback of [...this.handlers.values()])
            callback(this);
    }
}

function fixture(layout = new FakeLayoutManager()) {
    const snapshots = [];
    const errors = [];
    const manager = new MonitorManager(layout,
        snapshot => snapshots.push(snapshot), error => errors.push(error));
    return {layout, manager, snapshots, errors};
}

test('monitor manager immediately reports a logical snapshot on start', () => {
    const {layout, manager, snapshots, errors} = fixture(new FakeLayoutManager([
        shellMonitor(0, 0, 0, 3440, 1440),
        shellMonitor(1, 760, 1440, 1920, 1080),
    ], 1));
    manager.start();
    equal(layout.handlers.size, 1);
    equal(snapshots.length, 1);
    deepEqual(snapshots[0][0].monitor, {
        id: 'monitor-0', index: 0, x: 0, y: 0, width: 3440, height: 1440,
        scale: 1, primary: false,
    });
    equal(snapshots[0][1].monitor.primary, true);
    deepEqual(snapshots[0][0].edges.bottom.blocked,
        [{start: 0, end: 760}, {start: 2680, end: 3440}]);
    deepEqual(errors, []);
    manager.stop();
});

test('monitor manager preserves logical coordinates and geometry_scale metadata', () => {
    const monitor = Object.freeze(shellMonitor(3, -100.5, 20.25, 1536, 864, 1.25));
    const {manager, snapshots} = fixture(new FakeLayoutManager(Object.freeze([monitor]), 3));
    manager.start();
    const {monitor: adapted, edges} = snapshots[0][0];
    deepEqual(adapted, {
        id: 'monitor-3', index: 3, x: -100.5, y: 20.25, width: 1536, height: 864,
        scale: 1.25, primary: true,
    });
    equal(edges.right.coordinate, 1435.5);
    equal(edges.bottom.coordinate, 884.25);
    assert(adapted !== monitor);
    manager.stop();
});

test('monitor manager refreshes dimensions, scale, primary monitor, and hotplug seams', () => {
    const {layout, manager, snapshots} = fixture();
    manager.start();
    layout.monitors = [shellMonitor(0, 0, 0, 200, 100, 2), shellMonitor(1, 200)];
    layout.primaryIndex = 1;
    layout.emitMonitorsChanged();
    equal(snapshots.length, 2);
    equal(snapshots[1][0].monitor.width, 200);
    equal(snapshots[1][0].monitor.scale, 2);
    equal(snapshots[1][0].monitor.primary, false);
    equal(snapshots[1][1].monitor.primary, true);
    deepEqual(snapshots[1][0].edges.right.shared,
        [{start: 0, end: 100, monitorId: 'monitor-1'}]);
    equal(snapshots[0][0].monitor.width, 100, 'Previous snapshots must remain independent');

    // Shell indices are snapshot identifiers and can be reassigned on removal.
    layout.monitors = [shellMonitor(0, 200)];
    layout.primaryIndex = 0;
    layout.emitMonitorsChanged();
    equal(snapshots[2].length, 1);
    equal(snapshots[2][0].monitor.x, 200);
    deepEqual(snapshots[2][0].edges.left.shared, []);
    deepEqual(snapshots[2][0].edges.left.blocked, [{start: 0, end: 100}]);
    manager.stop();
});

test('monitor manager emits an empty snapshot when all monitors disappear', () => {
    const {layout, manager, snapshots} = fixture();
    manager.start();
    layout.monitors = [];
    layout.primaryIndex = -1;
    layout.emitMonitorsChanged();
    deepEqual(snapshots[1], []);
    manager.stop();
});

test('repeated start does not duplicate signal handlers or initial reports', () => {
    const {layout, manager, snapshots} = fixture();
    manager.start();
    manager.start();
    manager.start();
    equal(layout.connectCalls, 1);
    equal(layout.handlers.size, 1);
    equal(snapshots.length, 1);
    layout.emitMonitorsChanged();
    equal(snapshots.length, 2);
    manager.stop();
});

test('stop is idempotent and disconnected monitor events do not report', () => {
    const {layout, manager, snapshots} = fixture();
    manager.stop();
    equal(layout.disconnectCalls, 0);
    manager.start();
    manager.stop();
    manager.stop();
    equal(layout.disconnectCalls, 1);
    equal(layout.handlers.size, 0);
    layout.monitors = [shellMonitor(0, 400)];
    layout.emitMonitorsChanged();
    equal(snapshots.length, 1);
});

test('a stopped monitor manager can restart with current geometry', () => {
    const {layout, manager, snapshots} = fixture();
    manager.start();
    manager.stop();
    layout.monitors = [shellMonitor(0, -300)];
    manager.start();
    equal(layout.connectCalls, 2);
    equal(layout.handlers.size, 1);
    equal(snapshots.length, 2);
    equal(snapshots[1][0].monitor.x, -300);
    layout.emitMonitorsChanged();
    equal(snapshots.length, 3);
    manager.stop();
    equal(layout.disconnectCalls, 2);
});

test('invalid initial geometry disconnects the handler and permits a clean retry', () => {
    const {layout, manager, snapshots, errors} = fixture(new FakeLayoutManager([
        shellMonitor(0, 0, 0, 0),
    ]));
    throws(() => manager.start(), /positive/);
    equal(layout.handlers.size, 0);
    equal(layout.disconnectCalls, 1);
    equal(snapshots.length, 0);
    equal(errors.length, 0, 'Startup errors should be thrown to the enable caller');
    manager.stop();
    layout.monitors = [shellMonitor(0)];
    manager.start();
    equal(snapshots.length, 1);
    equal(layout.handlers.size, 1);
    manager.stop();
});

test('an initial report callback failure also disconnects the signal', () => {
    const layout = new FakeLayoutManager();
    const failure = new Error('report sink failed');
    const manager = new MonitorManager(layout, () => { throw failure; }, () => {});
    throws(() => manager.start(), /report sink failed/);
    equal(layout.handlers.size, 0);
    equal(layout.disconnectCalls, 1);
    manager.stop();
});

test('invalid hotplug data reaches onError and a later valid event recovers', () => {
    const {layout, manager, snapshots, errors} = fixture();
    manager.start();
    layout.monitors = [shellMonitor(0, 0, 0, -20)];
    layout.emitMonitorsChanged();
    equal(errors.length, 1);
    assert(errors[0].message.includes('positive'));
    equal(snapshots.length, 1, 'Invalid geometry must not publish a partial report');
    equal(layout.handlers.size, 1, 'Keep listening for corrected geometry');

    layout.monitors = [shellMonitor(0, 50, 20, 200, 100)];
    layout.emitMonitorsChanged();
    equal(snapshots.length, 2);
    equal(snapshots[1][0].monitor.width, 200);
    equal(errors.length, 1);
    manager.stop();
});

test('hotplug report callback errors are surfaced through onError', () => {
    const layout = new FakeLayoutManager();
    const failure = new Error('report interrupted');
    const errors = [];
    let reportCount = 0;
    const manager = new MonitorManager(layout, () => {
        if (++reportCount > 1)
            throw failure;
    }, error => errors.push(error));
    manager.start();
    layout.emitMonitorsChanged();
    equal(errors.length, 1);
    equal(errors[0], failure);
    manager.stop();
});
