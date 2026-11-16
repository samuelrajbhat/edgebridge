import {analyzeLayout} from '../core/edgeDetector.js';
import {ultrawideAboveLaptop} from './layouts.js';

// Run with: gjs -m examples/inspect-layout.js (or node examples/inspect-layout.js).
console.log(JSON.stringify(analyzeLayout(ultrawideAboveLaptop), null, 2));
