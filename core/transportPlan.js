// SPDX-License-Identifier: GPL-3.0-or-later
import {containsPoint} from './geometry.js';
import {integerBounds} from './coordinateMapper.js';
import {OPPOSITE_EDGE, validateRoute} from './routeValidator.js';

function insetPoint(bounds, edge, along, inset = 3) {
    switch (edge) {
    case 'top': return {x: along, y: Math.min(bounds.maxY, bounds.minY + inset)};
    case 'bottom': return {x: along, y: Math.max(bounds.minY, bounds.maxY - inset)};
    case 'left': return {x: Math.min(bounds.maxX, bounds.minX + inset), y: along};
    case 'right': return {x: Math.max(bounds.minX, bounds.maxX - inset), y: along};
    default: throw new RangeError('Unknown edge');
    }
}

function insetFromCorners(point, bounds) {
    const xInset = Math.min(3, Math.floor((bounds.maxX - bounds.minX) / 2));
    const yInset = Math.min(3, Math.floor((bounds.maxY - bounds.minY) / 2));
    return {
        x: Math.max(bounds.minX + xInset, Math.min(bounds.maxX - xInset, point.x)),
        y: Math.max(bounds.minY + yInset, Math.min(bounds.maxY - yInset, point.y)),
    };
}

/** Stay within each rectangle and cross only through their verified shared seam. */
export function planTransfer(snapshot, route, transition) {
    const {sourceEntry, destinationEntry, seams, transportEdge} = validateRoute(snapshot, route);
    const source = sourceEntry.monitor;
    const destination = destinationEntry.monitor;
    if (!containsPoint(source, transition.source.x, transition.source.y) ||
        !containsPoint(destination, transition.destination.x, transition.destination.y))
        throw new RangeError('Transfer endpoints must be inside their respective monitors');
    for (const coordinate of Object.values(transition.destination)) {
        if (!Number.isInteger(coordinate))
            throw new RangeError('Destination must use integer pointer coordinates');
    }

    const horizontal = route.source.edge === 'top' || route.source.edge === 'bottom';
    const along = Math.round(horizontal ? transition.source.x : transition.source.y);
    const sourceBounds = integerBounds(source);
    const clampedAlong = Math.max(horizontal ? sourceBounds.minX : sourceBounds.minY,
        Math.min(horizontal ? sourceBounds.maxX : sourceBounds.maxY, along));
    const seam = seams.reduce((best, current) =>
        current.end - current.start > best.end - best.start ? current : best);
    const crossing = Math.floor((Math.ceil(seam.start) + Math.ceil(seam.end) - 1) / 2);
    const sourceRetreat = insetPoint(sourceBounds, route.source.edge, clampedAlong);
    return [
        route.mode === 'surround' ? insetFromCorners(sourceRetreat, sourceBounds) : sourceRetreat,
        insetPoint(sourceBounds, transportEdge, crossing),
        insetPoint(integerBounds(destination), OPPOSITE_EDGE[transportEdge], crossing),
        {...transition.destination},
    ];
}
