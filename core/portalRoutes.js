// SPDX-License-Identifier: GPL-3.0-or-later
import {OPPOSITE_EDGE, validateRoute} from './routeValidator.js';
import {EDGES} from './geometry.js';

/** Every blocked outer edge leads to the chosen monitor; shared seams stay native. */
export function createSurroundRoutes(snapshot, sourceId, destinationId, bidirectional = true) {
    if (typeof bidirectional !== 'boolean')
        throw new TypeError('bidirectional must be a boolean');
    const directions = [[sourceId, destinationId]];
    if (bidirectional)
        directions.push([destinationId, sourceId]);
    const routes = directions.flatMap(([source, destination]) => EDGES.map(edge => {
        return validateRoute(snapshot, {
            mode: 'surround',
            source: {monitor: source, edge},
            destination: {monitor: destination, edge: OPPOSITE_EDGE[edge]},
        }).route;
    }));
    return Object.freeze(routes);
}

/** One deterministic adjacent route; no saved monitor identity is implied. */
export function findPrototypeRoute(snapshot) {
    const candidates = [];
    for (const entry of snapshot) {
        for (const edgeName of ['bottom', 'top', 'right', 'left']) {
            const edge = entry.edges[edgeName];
            for (const monitorId of new Set(edge.shared.map(seam => seam.monitorId))) {
                const route = {
                    source: {monitor: entry.monitor.id, edge: edgeName},
                    destination: {monitor: monitorId, edge: OPPOSITE_EDGE[edgeName]},
                };
                try {
                    const validated = validateRoute(snapshot, route);
                    const blockedLength = edge.blocked.reduce((sum, span) => sum + span.end - span.start, 0);
                    candidates.push({route: validated.route, blockedLength});
                } catch {
                    // A normal native edge or a seam without integer coordinates
                    // cannot be used by this limited prototype.
                }
            }
        }
    }
    candidates.sort((a, b) => b.blockedLength - a.blockedLength);
    return candidates[0]?.route ?? null;
}
