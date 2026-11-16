import {test, assert, deepEqual, throws} from './harness.js';
import {analyzeLayout} from '../core/edgeDetector.js';
import {containsPoint} from '../core/geometry.js';
import {planTransfer} from '../core/transportPlan.js';
import {mapToEdge} from '../core/coordinateMapper.js';

test('transport retreats inside source and traverses a valid seam before final landing', () => {
    const snapshot = analyzeLayout([
        {id: 'wide', x: 0, y: 0, width: 1280, height: 720},
        {id: 'small', x: 240, y: 720, width: 800, height: 600},
    ]);
    const route = {source: {monitor: 'wide', edge: 'bottom'}, destination: {monitor: 'small', edge: 'top'}};
    const points = planTransfer(snapshot, route, {source: {x: 120, y: 719}, destination: {x: 315, y: 723}});
    deepEqual(points, [{x: 120, y: 716}, {x: 639, y: 716}, {x: 639, y: 723}, {x: 315, y: 723}]);
});

test('all transport waypoint paths remain in valid monitor geometry for each orientation', () => {
    const source = {id: 'source', x: 0, y: 0, width: 100, height: 100};
    for (const [edge, entry, destination, start] of [
        ['bottom', 'top', {x: 20, y: 100, width: 60, height: 50}, {x: 10, y: 99}],
        ['top', 'bottom', {x: 20, y: -50, width: 60, height: 50}, {x: 10, y: 0}],
        ['left', 'right', {x: -50, y: 20, width: 50, height: 60}, {x: 0, y: 10}],
        ['right', 'left', {x: 100, y: 20, width: 50, height: 60}, {x: 99, y: 10}],
    ]) {
        const target = {id: 'target', ...destination};
        const snapshot = analyzeLayout([source, target]);
        const route = {source: {monitor: 'source', edge}, destination: {monitor: 'target', edge: entry}};
        const points = planTransfer(snapshot, route, {
            source: start, destination: mapToEdge(source, edge, target, entry, start),
        });
        let previous = start;
        for (const point of points) {
            for (let fraction = 0; fraction <= 1; fraction += 0.01) {
                const x = previous.x + (point.x - previous.x) * fraction;
                const y = previous.y + (point.y - previous.y) * fraction;
                assert(containsPoint(source, x, y) || containsPoint(target, x, y), `${edge} crosses a gap`);
            }
            previous = point;
        }
    }
});

test('transport rejects destinations outside current geometry', () => {
    const snapshot = analyzeLayout([
        {id: 'wide', x: 0, y: 0, width: 1280, height: 720},
        {id: 'small', x: 240, y: 720, width: 800, height: 600},
    ]);
    const route = {source: {monitor: 'wide', edge: 'bottom'}, destination: {monitor: 'small', edge: 'top'}};
    throws(() => planTransfer(snapshot, route, {source: {x: 120, y: 719}, destination: {x: 0, y: 1000}}),
        /endpoints/);
});
