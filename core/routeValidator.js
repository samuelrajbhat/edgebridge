// SPDX-License-Identifier: GPL-3.0-or-later
import {analyzeLayout} from './edgeDetector.js';
import {EDGES} from './geometry.js';
import {integerBounds} from './coordinateMapper.js';

export const OPPOSITE_EDGE = Object.freeze({
    top: 'bottom', right: 'left', bottom: 'top', left: 'right',
});

function hasIntegerPosition(interval) {
    return Math.ceil(interval.start) <= Math.ceil(interval.end) - 1;
}

/** Validate logical routing separately from the physical seam used for transport. */
export function validateRoute(snapshot, input) {
    if (!Array.isArray(snapshot))
        throw new TypeError('Monitor snapshot must be an array');
    for (const endpoint of [input?.source, input?.destination]) {
        if (!endpoint || typeof endpoint.monitor !== 'string' || !endpoint.monitor.trim())
            throw new TypeError('A route endpoint needs a monitor id');
        if (!EDGES.includes(endpoint.edge))
            throw new RangeError('Unknown route edge');
    }
    if (input.source.monitor === input.destination.monitor)
        throw new RangeError('A portal needs two different monitors');
    if (OPPOSITE_EDGE[input.source.edge] !== input.destination.edge)
        throw new RangeError('Prototype routes require opposite facing edges');
    if (input.mode !== undefined && !['blocked-only', 'surround'].includes(input.mode))
        throw new RangeError('Unknown route mode');

    // Recompute edges so stale or caller-modified edge arrays cannot authorize
    // a crossing which is not present in the supplied monitor geometry.
    const layout = analyzeLayout(snapshot.map(entry => entry?.monitor));
    const sourceEntry = layout.find(entry => entry.monitor.id === input.source.monitor);
    const destinationEntry = layout.find(entry => entry.monitor.id === input.destination.monitor);
    if (!sourceEntry || !destinationEntry)
        throw new RangeError('A route monitor is missing from the current layout');
    integerBounds(sourceEntry.monitor);
    integerBounds(destinationEntry.monitor);
    const sourceEdge = sourceEntry.edges[input.source.edge];
    if (input.mode === 'surround' && sourceEdge.shared.some(interval =>
        interval.monitorId !== destinationEntry.monitor.id))
        throw new RangeError('Surround source edge has a native crossing to another monitor');
    const connectingEdges = (input.mode === 'surround' ? EDGES : [input.source.edge])
        .map(edge => ({
            edge,
            seams: sourceEntry.edges[edge].shared.filter(interval =>
                interval.monitorId === destinationEntry.monitor.id && hasIntegerPosition(interval)),
        }))
        .filter(connection => connection.seams.length > 0);
    const connection = connectingEdges[0];
    const seams = connection?.seams ?? [];
    if (seams.length === 0)
        throw new RangeError('Prototype routes require an accessible shared seam');
    if (input.mode !== 'surround' && !sourceEdge.blocked.some(hasIntegerPosition))
        throw new RangeError('Source edge has no blocked pointer positions');

    const route = Object.freeze({
        ...(input.mode === undefined ? {} : {mode: input.mode}),
        source: Object.freeze({monitor: input.source.monitor, edge: input.source.edge}),
        destination: Object.freeze({monitor: input.destination.monitor, edge: input.destination.edge}),
    });
    return {route, sourceEntry, destinationEntry, seams, transportEdge: connection.edge};
}
