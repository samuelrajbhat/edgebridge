// SPDX-License-Identifier: GPL-3.0-or-later
import {analyzeLayout} from '../core/edgeDetector.js';
import {formatReport} from '../core/reportFormatter.js';

const monitors = [
    {id: 'external', x: 0, y: 0, width: 3440, height: 1440, scale: 1},
    {id: 'laptop', x: 760, y: 1440, width: 1920, height: 1080, scale: 1},
];

console.log('Illustrative ultrawide/laptop layout (not a hardware reading)\n');
console.log(formatReport(analyzeLayout(monitors)));
