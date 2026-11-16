// SPDX-License-Identifier: GPL-3.0-or-later
import {analyzeLayout} from '../core/edgeDetector.js';
import {formatMonitorLines, formatReport} from '../core/reportFormatter.js';
import {ultrawideAboveLaptop} from '../examples/layouts.js';
import {assert, equal, test} from './harness.js';

test('human-readable reports expose the ultrawide seam and both blocked intervals', () => {
    const report = formatReport(analyzeLayout(ultrawideAboveLaptop));
    for (const expected of [
        'Position: (0, 0)', 'Size: 3440 × 1440', 'Scale: 1',
        'Bottom (y = 1440)', 'Shared x: [760, 2680) → laptop',
        'Blocked x: [0, 760), [2680, 3440)',
        'ID: laptop (current layout only)',
    ])
        assert(report.includes(expected), `Missing report detail: ${expected}`);
});

test('reports distinguish no shared seam from no blocked interval', () => {
    const [, laptop] = analyzeLayout(ultrawideAboveLaptop);
    const lines = formatMonitorLines(laptop);
    const top = lines.indexOf('Top (y = 1440)');
    assert(top >= 0);
    equal(lines[top + 1], '  Shared x: [760, 2680) → external');
    equal(lines[top + 2], '  Blocked x: none');
    const bottom = lines.indexOf('Bottom (y = 2520)');
    equal(lines[bottom + 1], '  Shared x: none');
});

test('reports identify Shell monitor numbers and the primary monitor', () => {
    const snapshot = analyzeLayout([
        {id: 'monitor-0', index: 0, primary: true, x: 0, y: 0, width: 100, height: 80},
    ]);
    const report = formatReport(snapshot);
    assert(report.startsWith('Monitor 1 · Primary\n'));
    assert(!report.includes('Scale:'), 'Absent scale metadata must not print undefined');
});

test('an empty report clearly states that no logical monitors were detected', () => {
    equal(formatReport([]), 'No logical monitors detected.');
});
