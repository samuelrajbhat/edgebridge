// SPDX-License-Identifier: GPL-3.0-or-later
import {EDGES, normalizeMonitor} from './geometry.js';

/** Integer pointer positions contained in a half-open logical rectangle. */
export function integerBounds(monitor) {
    const bounds = {
        minX: Math.ceil(monitor.x),
        maxX: Math.ceil(monitor.x + monitor.width) - 1,
        minY: Math.ceil(monitor.y),
        maxY: Math.ceil(monitor.y + monitor.height) - 1,
    };
    if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY)
        throw new RangeError(`Monitor ${monitor.id}: no integer pointer position`);
    return bounds;
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Map the full source edge proportionally to an inset on the destination edge.
 * Pixel endpoints, rather than exclusive rectangle boundaries, map to each
 * other. The result can be passed directly to integer-only pointer warp APIs.
 */
export function mapToEdge(sourceMonitor, sourceEdge, destinationMonitor,
    destinationEdge, point, landingInset = 3) {
    normalizeMonitor(sourceMonitor);
    normalizeMonitor(destinationMonitor);
    if (!EDGES.includes(sourceEdge) || !EDGES.includes(destinationEdge))
        throw new RangeError('Unknown source or destination edge');
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y))
        throw new TypeError('Pointer coordinates must be finite');
    if (!Number.isFinite(landingInset) || landingInset < 0)
        throw new RangeError('Landing inset must be finite and nonnegative');

    const source = integerBounds(sourceMonitor);
    const destination = integerBounds(destinationMonitor);
    const horizontalSource = sourceEdge === 'top' || sourceEdge === 'bottom';
    const sourceMinimum = horizontalSource ? source.minX : source.minY;
    const sourceMaximum = horizontalSource ? source.maxX : source.maxY;
    const position = horizontalSource ? point.x : point.y;
    const ratio = sourceMaximum === sourceMinimum
        ? 0.5
        : clamp((position - sourceMinimum) / (sourceMaximum - sourceMinimum), 0, 1);

    const horizontalDestination = destinationEdge === 'top' || destinationEdge === 'bottom';
    const destinationMinimum = horizontalDestination ? destination.minX : destination.minY;
    const destinationMaximum = horizontalDestination ? destination.maxX : destination.maxY;
    const along = Math.round(destinationMinimum + ratio * (destinationMaximum - destinationMinimum));
    const inset = Math.round(landingInset);

    switch (destinationEdge) {
    case 'top':
        return {x: along, y: clamp(destination.minY + inset, destination.minY, destination.maxY)};
    case 'bottom':
        return {x: along, y: clamp(destination.maxY - inset, destination.minY, destination.maxY)};
    case 'left':
        return {x: clamp(destination.minX + inset, destination.minX, destination.maxX), y: along};
    case 'right':
        return {x: clamp(destination.maxX - inset, destination.minX, destination.maxX), y: along};
    default:
        throw new RangeError('Unknown destination edge');
    }
}
