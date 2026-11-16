import {analyzeLayout} from '../core/edgeDetector.js';
import {
    EDGES, containsPoint, describeEdge, normalizeMonitors, subtractIntervals,
} from '../core/geometry.js';
import {ultrawideAboveLaptop, sideBySide} from '../examples/layouts.js';
import {assert, deepEqual, equal, test, throws} from './harness.js';

const rectangle = (id, x = 0, y = 0, width = 100, height = 100) =>
    ({id, x, y, width, height});

test('ultrawide lower edge reports both blocked intervals and native seam', () => {
    const [external, laptop] = analyzeLayout(ultrawideAboveLaptop);
    deepEqual(external.edges.bottom, {
        axis: 'x', coordinate: 1440, start: 0, end: 3440,
        shared: [{start: 760, end: 2680, monitorId: 'laptop'}],
        blocked: [{start: 0, end: 760}, {start: 2680, end: 3440}],
    });
    deepEqual(laptop.edges.top.shared,
        [{start: 760, end: 2680, monitorId: 'external'}]);
    deepEqual(laptop.edges.top.blocked, []);
});

test('side-by-side layouts use y intervals and support negative origins', () => {
    const [left, right] = analyzeLayout(sideBySide);
    deepEqual(left.edges.right, {
        axis: 'y', coordinate: 0, start: 0, end: 1080,
        shared: [{start: 200, end: 920, monitorId: 'right'}],
        blocked: [{start: 0, end: 200}, {start: 920, end: 1080}],
    });
    deepEqual(right.edges.left.blocked, []);
});

test('equal-sized adjacent monitors share the entire facing edges', () => {
    const [left, right] = analyzeLayout([
        rectangle('left'), rectangle('right', 100),
    ]);
    deepEqual(left.edges.right.blocked, []);
    deepEqual(right.edges.left.blocked, []);
    deepEqual(left.edges.right.shared, [{start: 0, end: 100, monitorId: 'right'}]);
});

test('a single monitor has four entirely blocked edges', () => {
    const [result] = analyzeLayout([rectangle('only', -20, -30, 80, 60)]);
    for (const edge of Object.values(result.edges)) {
        deepEqual(edge.shared, []);
        deepEqual(edge.blocked, [{start: edge.start, end: edge.end}]);
    }
});

test('empty layouts can represent temporarily disconnected displays', () => {
    deepEqual(analyzeLayout([]), []);
});

test('a gap between displays does not become a shared seam', () => {
    const [source] = analyzeLayout([
        rectangle('source'), rectangle('destination', 100.001),
    ]);
    deepEqual(source.edges.right.shared, []);
    deepEqual(source.edges.right.blocked, [{start: 0, end: 100}]);
});

test('corner-only contacts do not create traversable shared intervals', () => {
    const [source] = analyzeLayout([
        rectangle('source'), rectangle('diagonal', 100, 100),
    ]);
    for (const edge of Object.values(source.edges))
        deepEqual(edge.shared, []);
});

test('multiple neighbors partition one edge without artificial gaps', () => {
    const [source] = analyzeLayout([
        rectangle('source', 0, 0, 300, 100),
        rectangle('right', 200, 100), rectangle('left', 0, 100),
        rectangle('middle', 100, 100),
    ]);
    deepEqual(source.edges.bottom.shared, [
        {start: 0, end: 100, monitorId: 'left'},
        {start: 100, end: 200, monitorId: 'middle'},
        {start: 200, end: 300, monitorId: 'right'},
    ]);
    deepEqual(source.edges.bottom.blocked, []);
});

test('separated neighbors retain an interior blocked interval', () => {
    const [source] = analyzeLayout([
        rectangle('source', 0, 0, 300, 100),
        rectangle('right', 200, 100), rectangle('left', 0, 100),
    ]);
    deepEqual(source.edges.bottom.blocked, [{start: 100, end: 200}]);
});

test('partially aligned neighbors are clipped to the source edge', () => {
    const [source, neighbor] = analyzeLayout([
        rectangle('source'), rectangle('neighbor', -40, 100, 180, 100),
    ]);
    deepEqual(source.edges.bottom.shared, [{start: 0, end: 100, monitorId: 'neighbor'}]);
    deepEqual(neighbor.edges.top.blocked, [{start: -40, end: 0}, {start: 100, end: 140}]);
});

test('fractional logical bounds preserve precision and are not rescaled', () => {
    const [source, destination] = analyzeLayout([
        {...rectangle('source', -10.5, 2.25, 100.5, 50.25), scale: 1.25},
        {...rectangle('destination', 0.5, 52.5, 50.5, 60.5), scale: 2},
    ]);
    deepEqual(source.edges.bottom.shared,
        [{start: 0.5, end: 51, monitorId: 'destination'}]);
    deepEqual(source.edges.bottom.blocked,
        [{start: -10.5, end: 0.5}, {start: 51, end: 90}]);
    equal(destination.monitor.scale, 2);
});

test('half-open ownership assigns a shared coordinate to only one rectangle', () => {
    const left = rectangle('left');
    const right = rectangle('right', 100);
    assert(containsPoint(left, 0, 0));
    assert(containsPoint(left, 99.5, 99.5));
    assert(!containsPoint(left, 100, 40));
    assert(containsPoint(right, 100, 40));
    assert(!containsPoint(left, 40, 100));
    assert(!containsPoint(left, NaN, 0));
});

test('analysis preserves input order, metadata and caller-owned objects', () => {
    const input = [
        Object.freeze({...rectangle('z'), index: 4, primary: true}),
        Object.freeze({...rectangle('a', 100), index: 1, scale: 2}),
    ];
    Object.freeze(input);
    const output = analyzeLayout(input);
    deepEqual(output.map(entry => entry.monitor.id), ['z', 'a']);
    equal(output[0].monitor.index, 4);
    equal(output[0].monitor.primary, true);
    assert(output[0].monitor !== input[0]);
    output[0].monitor.x = -1;
    equal(input[0].x, 0);
});

test('subtractIntervals merges overlapping coverage and clips out-of-range spans', () => {
    const covered = [
        {start: 50, end: 70}, {start: -5, end: 20},
        {start: 10, end: 40}, {start: 60, end: 120},
        {start: 150, end: 170},
    ];
    deepEqual(subtractIntervals(0, 100, covered), [{start: 40, end: 50}]);
    equal(covered[0].start, 50);
});

test('subtractIntervals ignores zero-length coverage and merges touching spans', () => {
    deepEqual(subtractIntervals(0, 100, [
        {start: 0, end: 20}, {start: 20, end: 100}, {start: 50, end: 50},
    ]), []);
    deepEqual(subtractIntervals(0, 100, [{start: 50, end: 50}]), [{start: 0, end: 100}]);
});

test('missing, blank, non-string, and duplicate monitor IDs are rejected', () => {
    for (const id of [undefined, '', '  ', 42])
        throws(() => analyzeLayout([rectangle(id)]), /id/);
    throws(() => analyzeLayout([rectangle('same'), rectangle('same', 100)]), /Duplicate/);
});

test('invalid layout containers and monitor records are rejected', () => {
    for (const input of [null, {}, 'monitors'])
        throws(() => analyzeLayout(input), /array/);
    for (const input of [null, [], 'monitor'])
        throws(() => analyzeLayout([input]), /object/);
});

test('non-finite and nonnumeric geometry is rejected', () => {
    for (const key of ['x', 'y', 'width', 'height']) {
        for (const value of [undefined, NaN, Infinity, -Infinity, '100'])
            throws(() => analyzeLayout([{...rectangle('bad'), [key]: value}]), /finite/);
    }
});

test('zero and negative dimensions are rejected', () => {
    for (const key of ['width', 'height']) {
        for (const value of [0, -1])
            throws(() => analyzeLayout([{...rectangle('bad'), [key]: value}]), /positive/);
    }
});

test('overflowing and unrepresentable rectangle endpoints are rejected', () => {
    throws(() => normalizeMonitors([
        rectangle('overflow', Number.MAX_VALUE, 0, Number.MAX_VALUE),
    ]), /representable/);
    throws(() => normalizeMonitors([rectangle('precision', 1e20, 0, 1)]), /representable/);
});

test('invalid optional scale metadata is rejected', () => {
    for (const scale of [0, -1, NaN, Infinity, '2'])
        throws(() => analyzeLayout([{...rectangle('bad'), scale}]), /scale/);
});

test('overlapping logical monitors fail clearly instead of reporting false edges', () => {
    throws(() => analyzeLayout([rectangle('first'), rectangle('second', 50, 50)]), /overlap/);
    throws(() => analyzeLayout([rectangle('first'), rectangle('mirror')]), /overlap/);
});

test('unknown edge names fail explicitly', () => {
    throws(() => describeEdge(rectangle('monitor'), 'diagonal'), /Unknown/);
});

test('every edge is fully partitioned and shared seams are reciprocal', () => {
    const layouts = [ultrawideAboveLaptop, sideBySide, [
        rectangle('center', 0, 0, 300, 200),
        rectangle('above', 50, -100, 100, 100),
        rectangle('belowLeft', 0, 200, 100, 100),
        rectangle('belowRight', 200, 200, 100, 100),
        rectangle('right', 300, 50, 100, 100),
        rectangle('left', -100, 20, 100, 100),
    ]];
    const opposite = {top: 'bottom', right: 'left', bottom: 'top', left: 'right'};
    for (const layout of layouts) {
        const analysis = analyzeLayout(layout);
        for (const result of analysis) {
            for (const name of EDGES) {
                const edge = result.edges[name];
                const spans = [...edge.shared, ...edge.blocked].sort((a, b) => a.start - b.start);
                let cursor = edge.start;
                for (const interval of spans) {
                    equal(interval.start, cursor, 'Partition must have no gaps or overlaps');
                    assert(interval.end > interval.start);
                    cursor = interval.end;
                }
                equal(cursor, edge.end);
                for (const shared of edge.shared) {
                    const neighbor = analysis.find(entry => entry.monitor.id === shared.monitorId);
                    assert(neighbor.edges[opposite[name]].shared.some(interval =>
                        interval.monitorId === result.monitor.id &&
                        interval.start === shared.start && interval.end === shared.end),
                    'Shared seams must be reciprocal');
                }
            }
        }
    }
});
