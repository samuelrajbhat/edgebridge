import {test, assert, equal, deepEqual, throws} from './harness.js';
import {analyzeLayout} from '../core/edgeDetector.js';
import {containsPoint, EDGES} from '../core/geometry.js';
import {integerBounds, mapToEdge} from '../core/coordinateMapper.js';
import {validateRoute, OPPOSITE_EDGE} from '../core/routeValidator.js';
import {createSurroundRoutes, findPrototypeRoute} from '../core/portalRoutes.js';
import {planTransfer} from '../core/transportPlan.js';

const source = {id: 'wide', x: 0, y: 0, width: 1280, height: 720};
const target = {id: 'small', x: 240, y: 720, width: 800, height: 600};
const snapshot = analyzeLayout([source, target]);

function pointOnEdge(monitor, edge, corner = false) {
    const bounds = integerBounds(monitor);
    const x = corner ? bounds.minX : Math.round((bounds.minX + bounds.maxX) / 2);
    const y = corner ? bounds.minY : Math.round((bounds.minY + bounds.maxY) / 2);
    switch (edge) {
    case 'top': return {x, y: bounds.minY};
    case 'bottom': return {x, y: bounds.maxY};
    case 'left': return {x: bounds.minX, y};
    case 'right': return {x: bounds.maxX, y};
    default: throw new Error(`Unknown edge ${edge}`);
    }
}

function verifyPath(sourceMonitor, targetMonitor, route, corner = false) {
    const layout = analyzeLayout([sourceMonitor, targetMonitor]);
    const start = pointOnEdge(sourceMonitor, route.source.edge, corner);
    const destination = mapToEdge(sourceMonitor, route.source.edge, targetMonitor,
        route.destination.edge, start);
    const points = planTransfer(layout, route, {source: start, destination});
    equal(points.length, 4);
    assert(containsPoint(sourceMonitor, points[0].x, points[0].y));
    assert(containsPoint(sourceMonitor, points[1].x, points[1].y));
    assert(containsPoint(targetMonitor, points[2].x, points[2].y));
    deepEqual(points[3], destination);
    let previous = start;
    for (const point of points) {
        for (let index = 0; index <= 1000; index++) {
            const ratio = index / 1000;
            const x = previous.x + (point.x - previous.x) * ratio;
            const y = previous.y + (point.y - previous.y) * ratio;
            assert(containsPoint(sourceMonitor, x, y) || containsPoint(targetMonitor, x, y),
                `${route.source.edge}: path enters an inaccessible gap at (${x}, ${y})`);
        }
        previous = point;
    }
}

test('surround creates four one-way or eight bidirectional immutable routes', () => {
    const oneWay = createSurroundRoutes(snapshot, 'wide', 'small', false);
    equal(oneWay.length, 4);
    deepEqual(oneWay.map(route => route.source.edge), EDGES);
    for (const route of oneWay) {
        equal(route.mode, 'surround');
        equal(route.source.monitor, 'wide');
        equal(route.destination.monitor, 'small');
        equal(route.destination.edge, OPPOSITE_EDGE[route.source.edge]);
        assert(Object.isFrozen(route) && Object.isFrozen(route.source) && Object.isFrozen(route.destination));
    }
    assert(Object.isFrozen(oneWay));
    const bothWays = createSurroundRoutes(snapshot, 'wide', 'small');
    equal(bothWays.length, 8);
    deepEqual(bothWays.slice(4).map(route => route.source.edge), EDGES);
    for (const route of bothWays.slice(4)) {
        equal(route.source.monitor, 'small');
        equal(route.destination.monitor, 'wide');
    }
});

test('surround supports equal-sized neighbors and wholly shared facing edges', () => {
    const equalLayout = analyzeLayout([source, {...source, id: 'equal', x: 1280}]);
    const routes = createSurroundRoutes(equalLayout, 'wide', 'equal');
    equal(routes.length, 8);
    equal(findPrototypeRoute(equalLayout), null);
    const facing = validateRoute(equalLayout, routes.find(route => route.source.edge === 'right'));
    equal(facing.sourceEntry.edges.right.blocked.length, 0);
    equal(facing.transportEdge, 'right');
    equal(facing.seams.length, 1);
});

test('surround transport seam is independent of the logical exit and entry', () => {
    for (const route of createSurroundRoutes(snapshot, 'wide', 'small', false)) {
        const result = validateRoute(snapshot, route);
        equal(result.transportEdge, 'bottom');
        deepEqual(result.seams, [{start: 240, end: 1040, monitorId: 'small'}]);
        equal(result.route.source.edge, route.source.edge);
    }
});

test('surround rejects disconnected, missing, duplicate, and malformed pair selections', () => {
    const detached = analyzeLayout([source, {...target, y: 900}]);
    throws(() => createSurroundRoutes(detached, 'wide', 'small'), /shared seam/);
    throws(() => createSurroundRoutes(snapshot, 'wide', 'missing'), /missing/);
    throws(() => createSurroundRoutes(snapshot, 'wide', 'wide'), /different/);
    throws(() => createSurroundRoutes(snapshot, 'wide', 'small', 'yes'), /boolean/);
    throws(() => validateRoute(snapshot, {
        mode: 'invalid', source: {monitor: 'wide', edge: 'bottom'},
        destination: {monitor: 'small', edge: 'top'},
    }), /mode/);
});

test('surround rejects native exits to third monitors in each enabled direction', () => {
    const third = {id: 'third', x: 1040, y: 720, width: 240, height: 600};
    const layout = analyzeLayout([source, target, third]);
    throws(() => createSurroundRoutes(layout, 'wide', 'small', false), /another monitor/);
    // The smaller monitor also touches the third monitor on its right.
    throws(() => createSurroundRoutes(layout, 'small', 'wide', false), /another monitor/);

    const aboveWide = {id: 'third', x: 0, y: -100, width: 1280, height: 100};
    const asymmetric = analyzeLayout([source, target, aboveWide]);
    equal(createSurroundRoutes(asymmetric, 'small', 'wide', false).length, 4);
    throws(() => createSurroundRoutes(asymmetric, 'small', 'wide', true), /another monitor/);
});

test('legacy routes keep their original shape and strict blocked-edge rules', () => {
    const route = {source: {monitor: 'wide', edge: 'bottom'}, destination: {monitor: 'small', edge: 'top'}};
    deepEqual(validateRoute(snapshot, route).route, route);
    equal(validateRoute(snapshot, {...route, mode: 'blocked-only'}).route.mode, 'blocked-only');
    throws(() => validateRoute(snapshot, {
        source: {monitor: 'wide', edge: 'top'}, destination: {monitor: 'small', edge: 'bottom'},
    }), /shared seam/);
    throws(() => validateRoute(snapshot, {
        source: {monitor: 'small', edge: 'top'}, destination: {monitor: 'wide', edge: 'bottom'},
    }), /blocked/);
});

test('surround paths stay inside monitors for every logical exit and physical layout direction', () => {
    const destinations = [
        {id: 'small', x: 240, y: 720, width: 800, height: 600},
        {id: 'small', x: 240, y: -600, width: 800, height: 600},
        {id: 'small', x: -800, y: 200, width: 800, height: 300},
        {id: 'small', x: 1280, y: 200, width: 800, height: 300},
    ];
    for (const destination of destinations) {
        const layout = analyzeLayout([source, destination]);
        for (const route of createSurroundRoutes(layout, 'wide', 'small')) {
            const forward = route.source.monitor === source.id;
            verifyPath(forward ? source : destination, forward ? destination : source, route);
        }
    }
});

test('surround retreat moves away from source corners before routing through the native seam', () => {
    for (const route of createSurroundRoutes(snapshot, 'wide', 'small')) {
        const forward = route.source.monitor === source.id;
        const from = forward ? source : target;
        const to = forward ? target : source;
        verifyPath(from, to, route, true);
        const start = pointOnEdge(from, route.source.edge, true);
        const destination = mapToEdge(from, route.source.edge, to, route.destination.edge, start);
        const [retreat] = planTransfer(snapshot, route, {source: start, destination});
        const bounds = integerBounds(from);
        assert(retreat.x >= bounds.minX + 3 && retreat.x <= bounds.maxX - 3);
        assert(retreat.y >= bounds.minY + 3 && retreat.y <= bounds.maxY - 3);
    }
});

test('surround handles narrow fractional monitor bounds without invalid waypoints', () => {
    const narrowSource = {id: 'source', x: -2.5, y: -3.5, width: 2, height: 5};
    const narrowTarget = {id: 'target', x: -2.5, y: 1.5, width: 2, height: 3};
    const layout = analyzeLayout([narrowSource, narrowTarget]);
    for (const route of createSurroundRoutes(layout, 'source', 'target')) {
        const forward = route.source.monitor === 'source';
        verifyPath(forward ? narrowSource : narrowTarget, forward ? narrowTarget : narrowSource, route, true);
    }
});
