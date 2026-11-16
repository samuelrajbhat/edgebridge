import {test, equal, deepEqual, throws} from './harness.js';
import {mapToEdge, integerBounds} from '../core/coordinateMapper.js';

const wide = {id: 'wide', x: 0, y: 0, width: 1280, height: 720};
const small = {id: 'small', x: 240, y: 720, width: 800, height: 600};

test('proportional mapping includes both destination edge endpoints and landing inset', () => {
    deepEqual(mapToEdge(wide, 'bottom', small, 'top', {x: 0, y: 719}), {x: 240, y: 723});
    deepEqual(mapToEdge(wide, 'bottom', small, 'top', {x: 1279, y: 719}), {x: 1039, y: 723});
    deepEqual(mapToEdge(wide, 'bottom', small, 'top', {x: 120, y: 719}), {x: 315, y: 723});
});

test('mapping supports every entry edge and rotated source-to-destination axes', () => {
    deepEqual(mapToEdge(wide, 'bottom', small, 'bottom', {x: 0, y: 719}), {x: 240, y: 1316});
    deepEqual(mapToEdge(wide, 'bottom', small, 'left', {x: 1279, y: 719}), {x: 243, y: 1319});
    deepEqual(mapToEdge(wide, 'left', small, 'right', {x: 0, y: 0}), {x: 1036, y: 720});
    deepEqual(mapToEdge(wide, 'right', small, 'top', {x: 1279, y: 719}), {x: 1039, y: 723});
});

test('out-of-range along-edge coordinates clamp to destination endpoints', () => {
    equal(mapToEdge(wide, 'bottom', small, 'top', {x: -100, y: 719}).x, 240);
    equal(mapToEdge(wide, 'bottom', small, 'top', {x: 9999, y: 719}).x, 1039);
});

test('fractional negative geometry maps to contained integer positions', () => {
    const fractional = {id: 'fractional', x: -10.5, y: -2.5, width: 5, height: 2};
    deepEqual(integerBounds(fractional), {minX: -10, maxX: -6, minY: -2, maxY: -1});
    deepEqual(mapToEdge(wide, 'bottom', fractional, 'top', {x: 0, y: 719}), {x: -10, y: -1});
});

test('single-pixel edges map to destination center and clamp excessive insets', () => {
    const one = {id: 'one', x: 0, y: 0, width: 1, height: 1};
    deepEqual(mapToEdge(one, 'top', small, 'top', {x: 0, y: 0}), {x: 640, y: 723});
    deepEqual(mapToEdge(wide, 'bottom', one, 'top', {x: 120, y: 719}, 999), {x: 0, y: 0});
});

test('invalid mapping input fails before a pointer target is produced', () => {
    throws(() => mapToEdge(wide, 'wrong', small, 'top', {x: 0, y: 0}), /edge/);
    throws(() => mapToEdge(wide, 'bottom', small, 'top', {x: NaN, y: 0}), /finite/);
    throws(() => mapToEdge(wide, 'bottom', small, 'top', {x: 0, y: 0}, -1), /inset/);
    throws(() => mapToEdge(wide, 'bottom', {id: 'tiny', x: 0.2, y: 0.2, width: 0.2, height: 0.2},
        'top', {x: 0, y: 0}), /integer/);
});
