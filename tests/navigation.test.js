import {test, assert, equal, deepEqual, throws} from './harness.js';
import {analyzeLayout} from '../core/edgeDetector.js';
import {NavigationEngine} from '../core/navigationEngine.js';
import {validateRoute} from '../core/routeValidator.js';
import {findPrototypeRoute} from '../core/portalRoutes.js';
import {EDGES} from '../core/geometry.js';

const monitors = [
    {id: 'wide', x: 0, y: 0, width: 1280, height: 720},
    {id: 'small', x: 240, y: 720, width: 800, height: 600},
];
const layout = analyzeLayout(monitors);
const route = {source: {monitor: 'wide', edge: 'bottom'}, destination: {monitor: 'small', edge: 'top'}};
const sample = (x, y, timeMs = 0, buttonsPressed = false) => ({x, y, timeMs, buttonsPressed});

test('prototype chooses the blocked wide edge and has no route for equal or separated monitors', () => {
    deepEqual(findPrototypeRoute(layout), route);
    equal(findPrototypeRoute(analyzeLayout([{...monitors[0]}, {...monitors[1], x: 0, width: 1280}])) , null);
    equal(findPrototypeRoute(analyzeLayout([{...monitors[0]}, {...monitors[1], y: 1000}])) , null);
    equal(findPrototypeRoute([]), null);
});

test('one deliberate outward approach maps either blocked section', () => {
    for (const x of [120, 1160]) {
        const engine = new NavigationEngine(layout, route);
        equal(engine.process(sample(x, 690)), null);
        const result = engine.process(sample(x, 719, 20));
        assert(result);
        deepEqual(result.destination, {x: 240 + Math.round(x / 1279 * 799), y: 723});
        equal(engine.armed, false);
    }
});

test('first sample at an edge, tangential motion, and inward movement do not trigger', () => {
    const engine = new NavigationEngine(layout, route);
    equal(engine.process(sample(120, 719)), null);
    equal(engine.process(sample(130, 719, 10)), null);
    equal(engine.process(sample(130, 700, 20)), null);
});

test('native shared edge and entry from another monitor are preserved', () => {
    const engine = new NavigationEngine(layout, route);
    engine.process(sample(640, 690));
    equal(engine.process(sample(640, 719, 10)), null);
    equal(engine.process(sample(640, 745, 20)), null);
    equal(engine.process(sample(120, 719, 30)), null);
});

test('dragging and the first sample after releasing a button cannot trigger', () => {
    const engine = new NavigationEngine(layout, route);
    engine.process(sample(120, 690, 0, true));
    equal(engine.process(sample(120, 718, 10, true)), null);
    equal(engine.process(sample(120, 719, 20, false)), null);
    equal(engine.process(sample(130, 719, 30, false)), null);
    engine.process(sample(120, 690, 40));
    assert(engine.process(sample(120, 719, 50)));
});

test('a refused warp is not retried while remaining at the source boundary', () => {
    const engine = new NavigationEngine(layout, route);
    engine.process(sample(120, 690));
    assert(engine.process(sample(120, 719, 10)));
    equal(engine.process(sample(120, 718, 500)), null);
    equal(engine.process(sample(120, 719, 510)), null);
    equal(engine.armed, false);
});

test('rearm requires both an interior sample and elapsed cooldown', () => {
    const engine = new NavigationEngine(layout, route);
    engine.process(sample(120, 690));
    engine.process(sample(120, 719, 10));
    equal(engine.process(sample(120, 690, 30)), null);
    equal(engine.process(sample(120, 719, 40)), null);
    equal(engine.process(sample(120, 690, 200)), null);
    assert(engine.armed);
    assert(engine.process(sample(120, 719, 210)));
});

test('destination edge does not rearm or cause a return loop', () => {
    const engine = new NavigationEngine(layout, route);
    engine.process(sample(120, 690));
    engine.process(sample(120, 719, 10));
    equal(engine.process(sample(315, 720, 200)), null);
    equal(engine.armed, false);
    equal(engine.process(sample(315, 723, 300)), null);
    equal(engine.armed, true);
    equal(engine.process(sample(315, 720, 310)), null);
});

test('reset discards stale direction samples', () => {
    const engine = new NavigationEngine(layout, route);
    engine.process(sample(120, 690));
    engine.reset();
    equal(engine.process(sample(120, 719, 50)), null);
});

test('all four outward edge directions can trigger a validated route', () => {
    const cases = [
        {edge: 'top', entry: 'bottom', destination: {x: 240, y: -600, width: 800, height: 600},
            before: [120, 30], at: [120, 0]},
        {edge: 'right', entry: 'left', destination: {x: 1280, y: 200, width: 800, height: 300},
            before: [1250, 120], at: [1279, 120]},
        {edge: 'left', entry: 'right', destination: {x: -800, y: 200, width: 800, height: 300},
            before: [30, 120], at: [0, 120]},
    ];
    for (const item of cases) {
        const snapshot = analyzeLayout([monitors[0], {id: 'small', ...item.destination}]);
        const selected = {source: {monitor: 'wide', edge: item.edge},
            destination: {monitor: 'small', edge: item.entry}};
        const engine = new NavigationEngine(snapshot, selected);
        engine.process(sample(...item.before));
        assert(engine.process(sample(...item.at, 20)), `${item.edge} did not trigger`);
    }
});

test('route validation rejects stale destinations, self routes, and nonfacing edges', () => {
    throws(() => validateRoute(layout.slice(0, 1), route), /missing/);
    throws(() => validateRoute(layout, {...route, destination: {monitor: 'wide', edge: 'top'}}), /different/);
    throws(() => validateRoute(layout, {...route, destination: {monitor: 'small', edge: 'left'}}), /opposite/);
    throws(() => validateRoute(layout, {...route, source: {monitor: 'wide', edge: 'bad'}}), /edge/);
    throws(() => new NavigationEngine(layout, route, {cooldownMs: -1}), /nonnegative/);
});

test('stale supplied seam metadata cannot authorize disconnected geometry', () => {
    const stale = layout.map(entry => ({...entry, monitor: {...entry.monitor}}));
    stale[1].monitor.y = 1000;
    throws(() => validateRoute(stale, route), /seam/);
});

test('malformed samples fail without producing a transition', () => {
    const engine = new NavigationEngine(layout, route);
    throws(() => engine.process(sample(NaN, 0)), /finite/);
    throws(() => engine.process({...sample(0, 0), buttonsPressed: undefined}), /boolean/);
});

const offsetLayout = analyzeLayout([
    {id: 'a', x: 0, y: 0, width: 100, height: 100},
    {id: 'b', x: 50, y: 100, width: 100, height: 100},
]);
const opposite = {top: 'bottom', right: 'left', bottom: 'top', left: 'right'};
const surroundRoutes = [['a', 'b'], ['b', 'a']].flatMap(([source, destination]) =>
    EDGES.map(edge => ({
        mode: 'surround',
        source: {monitor: source, edge},
        destination: {monitor: destination, edge: opposite[edge]},
    })));

test('one surround controller selects all four exits in each direction', () => {
    const cases = [
        ['a', 'top', [25, 20], [25, 0], {x: 75, y: 196}],
        ['a', 'right', [80, 25], [99, 25], {x: 53, y: 125}],
        ['a', 'bottom', [25, 80], [25, 99], {x: 75, y: 103}],
        ['a', 'left', [20, 25], [0, 25], {x: 146, y: 125}],
        ['b', 'top', [125, 120], [125, 100], {x: 75, y: 96}],
        ['b', 'right', [130, 125], [149, 125], {x: 3, y: 25}],
        ['b', 'bottom', [125, 180], [125, 199], {x: 75, y: 3}],
        ['b', 'left', [70, 125], [50, 125], {x: 96, y: 25}],
    ];
    for (const [monitor, edge, before, at, expected] of cases) {
        const engine = new NavigationEngine(offsetLayout, surroundRoutes);
        equal(engine.routes.length, 8);
        deepEqual(engine.route, engine.routes[0]);
        engine.process(sample(...before));
        const result = engine.process(sample(...at, 20));
        assert(result, `${monitor}.${edge} did not activate`);
        deepEqual(result.route.source, {monitor, edge});
        deepEqual(result.destination, expected);
        equal(engine.armed, false);
    }
});

test('surround leaves native crossings untouched in both directions', () => {
    const engine = new NavigationEngine(offsetLayout, surroundRoutes);
    engine.process(sample(75, 90));
    equal(engine.process(sample(75, 99, 10)), null);
    equal(engine.process(sample(75, 105, 20)), null);
    equal(engine.process(sample(75, 100, 30)), null);
    equal(engine.process(sample(75, 95, 40)), null);
    equal(engine.armed, true);
});

test('corner choice follows the dominant outward direction independent of route order', () => {
    const routes = [...surroundRoutes].reverse();
    let engine = new NavigationEngine(offsetLayout, routes);
    engine.process(sample(20, 5));
    equal(engine.process(sample(0, 0, 10)).route.source.edge, 'left');
    engine = new NavigationEngine(offsetLayout, routes);
    engine.process(sample(5, 20));
    equal(engine.process(sample(0, 0, 10)).route.source.edge, 'top');
    engine = new NavigationEngine(offsetLayout, routes);
    engine.process(sample(20, 20));
    equal(engine.process(sample(0, 0, 10)).route.source.edge, 'top');
});

test('a refused attempt disarms every route until a complete interior rearm', () => {
    const engine = new NavigationEngine(offsetLayout, surroundRoutes);
    engine.process(sample(25, 80));
    assert(engine.process(sample(25, 99, 10)));
    equal(engine.process(sample(1, 98, 250)), null);
    equal(engine.process(sample(0, 97, 260)), null);
    equal(engine.armed, false);
    equal(engine.process(sample(5, 90, 270)), null);
    equal(engine.armed, true);
    equal(engine.process(sample(0, 90, 280)).route.source.edge, 'left');
});

test('corner landings stay disarmed even beyond cooldown until away from every edge', () => {
    const engine = new NavigationEngine(offsetLayout, surroundRoutes);
    engine.process(sample(1, 20));
    const first = engine.process(sample(0, 0, 10));
    deepEqual(first.destination, {x: 50, y: 196});
    equal(engine.process(sample(50, 196, 250)), null);
    equal(engine.process(sample(51, 197, 260)), null);
    equal(engine.process(sample(50, 197, 270)), null);
    equal(engine.armed, false);
    equal(engine.process(sample(60, 190, 280)), null);
    equal(engine.armed, true);
    equal(engine.process(sample(60, 199, 290)).route.source.monitor, 'b');
});

test('cooldown is shared with reverse routes after a successful landing', () => {
    const engine = new NavigationEngine(offsetLayout, surroundRoutes);
    engine.process(sample(25, 80));
    const first = engine.process(sample(25, 99, 10));
    equal(engine.process(sample(first.destination.x, first.destination.y, 30)), null);
    equal(engine.process(sample(50, 125, 40)), null);
    equal(engine.armed, false);
    equal(engine.process(sample(60, 125, 200)), null);
    equal(engine.process(sample(50, 125, 210)).route.source.monitor, 'b');
});

test('a one-way surround route set never creates return transfers', () => {
    const engine = new NavigationEngine(offsetLayout, surroundRoutes.slice(0, 4));
    engine.process(sample(125, 180));
    equal(engine.process(sample(125, 199, 10)), null);
    engine.process(sample(25, 20, 20));
    assert(engine.process(sample(25, 0, 30)));
});

test('surround preserves button suppression and discards first edge samples', () => {
    const engine = new NavigationEngine(offsetLayout, surroundRoutes);
    equal(engine.process(sample(0, 0)), null);
    engine.process(sample(80, 25, 10, true));
    equal(engine.process(sample(99, 25, 20, true)), null);
    equal(engine.process(sample(99, 24, 30, false)), null);
    equal(engine.process(sample(99, 23, 40, false)), null);
    engine.process(sample(80, 25, 50));
    assert(engine.process(sample(99, 25, 60)));
});

test('empty and ambiguous route arrays fail before navigation starts', () => {
    throws(() => new NavigationEngine(layout, []), /at least one/);
    throws(() => new NavigationEngine(layout, [route, route]), /one route per source/);
    throws(() => new NavigationEngine(layout, null), /endpoint/);
});
