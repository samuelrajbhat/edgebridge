import {
    EDGES, describeEdge, intersectIntervals, normalizeMonitors, subtractIntervals,
} from './geometry.js';

const OPPOSITE_EDGE = Object.freeze({
    top: 'bottom', right: 'left', bottom: 'top', left: 'right',
});

/**
 * Analyze native seams and inaccessible intervals of each logical monitor.
 *
 * The result preserves monitor order and copies monitor records. Shared
 * intervals identify the neighbor; blocked intervals are the complement of
 * their union. Edges are mathematical rectangle boundaries, not the center of
 * their last pixel. Exact adjacency is required: even a small gap is blocked.
 * Scale is descriptive metadata; inputs must already be logical coordinates.
 */
export function analyzeLayout(monitors) {
    const normalized = normalizeMonitors(monitors);
    return normalized.map(monitor => {
        const edges = {};
        for (const name of EDGES) {
            const edge = describeEdge(monitor, name);
            const shared = [];
            for (const neighbor of normalized) {
                if (neighbor.id === monitor.id)
                    continue;
                const facingEdge = describeEdge(neighbor, OPPOSITE_EDGE[name]);
                if (edge.coordinate !== facingEdge.coordinate)
                    continue;
                const overlap = intersectIntervals(edge, facingEdge);
                if (overlap)
                    shared.push({...overlap, monitorId: neighbor.id});
            }
            shared.sort((a, b) => a.start - b.start || a.end - b.end ||
                (a.monitorId < b.monitorId ? -1 : a.monitorId > b.monitorId ? 1 : 0));
            edges[name] = {
                ...edge,
                shared,
                blocked: subtractIntervals(edge.start, edge.end, shared),
            };
        }
        return {monitor, edges};
    });
}
