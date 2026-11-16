// Pure geometry: every coordinate is already in GNOME's logical desktop space.
export const EDGES = Object.freeze(['top', 'right', 'bottom', 'left']);

/** Copy and validate a monitor rectangle without changing caller-owned data. */
export function normalizeMonitor(monitor) {
    if (!monitor || typeof monitor !== 'object' || Array.isArray(monitor))
        throw new TypeError('Each monitor must be an object');
    if (typeof monitor.id !== 'string' || monitor.id.trim().length === 0)
        throw new TypeError('Each monitor needs a non-empty string id');

    for (const key of ['x', 'y', 'width', 'height']) {
        if (!Number.isFinite(monitor[key]))
            throw new TypeError(`Monitor ${monitor.id}: ${key} must be finite`);
    }
    if (monitor.width <= 0 || monitor.height <= 0)
        throw new RangeError(`Monitor ${monitor.id}: dimensions must be positive`);

    const right = monitor.x + monitor.width;
    const bottom = monitor.y + monitor.height;
    if (!Number.isFinite(right) || !Number.isFinite(bottom) ||
        right <= monitor.x || bottom <= monitor.y)
        throw new RangeError(`Monitor ${monitor.id}: bounds are not representable`);

    if (monitor.scale !== undefined &&
        (!Number.isFinite(monitor.scale) || monitor.scale <= 0))
        throw new RangeError(`Monitor ${monitor.id}: scale must be positive and finite`);

    return {...monitor};
}

/** Validate a layout of non-overlapping logical monitors. Mirrored outputs are
 * one logical monitor and should be collapsed by the platform adapter first.
 */
export function normalizeMonitors(monitors) {
    if (!Array.isArray(monitors))
        throw new TypeError('Monitors must be an array');

    const normalized = monitors.map(normalizeMonitor);
    const ids = new Set();
    for (let index = 0; index < normalized.length; index++) {
        const monitor = normalized[index];
        if (ids.has(monitor.id))
            throw new RangeError(`Duplicate monitor id: ${monitor.id}`);
        ids.add(monitor.id);

        for (const previous of normalized.slice(0, index)) {
            const overlapX = intersectIntervals(
                {start: monitor.x, end: monitor.x + monitor.width},
                {start: previous.x, end: previous.x + previous.width});
            const overlapY = intersectIntervals(
                {start: monitor.y, end: monitor.y + monitor.height},
                {start: previous.y, end: previous.y + previous.height});
            if (overlapX && overlapY)
                throw new RangeError(`Logical monitors overlap: ${previous.id}, ${monitor.id}`);
        }
    }
    return normalized;
}

/** Half-open rectangle ownership: [x, x + width) × [y, y + height). */
export function containsPoint(monitor, x, y) {
    return x >= monitor.x && x < monitor.x + monitor.width &&
        y >= monitor.y && y < monitor.y + monitor.height;
}

/** A zero-length intersection is not a traversable seam. */
export function intersectIntervals(first, second) {
    const start = Math.max(first.start, second.start);
    const end = Math.min(first.end, second.end);
    return start < end ? {start, end} : null;
}

/** Return the complement of the union of covered intervals inside [start,end). */
export function subtractIntervals(start, end, covered) {
    const intervals = covered
        .map(interval => intersectIntervals({start, end}, interval))
        .filter(interval => interval !== null)
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const remaining = [];
    let cursor = start;

    for (const interval of intervals) {
        if (interval.start > cursor)
            remaining.push({start: cursor, end: interval.start});
        cursor = Math.max(cursor, interval.end);
    }
    if (cursor < end)
        remaining.push({start: cursor, end});

    return remaining;
}

/** Describe an edge of a validated monitor; positions use desktop coordinates. */
export function describeEdge(monitor, edge) {
    switch (edge) {
    case 'top':
        return {axis: 'x', coordinate: monitor.y,
            start: monitor.x, end: monitor.x + monitor.width};
    case 'bottom':
        return {axis: 'x', coordinate: monitor.y + monitor.height,
            start: monitor.x, end: monitor.x + monitor.width};
    case 'left':
        return {axis: 'y', coordinate: monitor.x,
            start: monitor.y, end: monitor.y + monitor.height};
    case 'right':
        return {axis: 'y', coordinate: monitor.x + monitor.width,
            start: monitor.y, end: monitor.y + monitor.height};
    default:
        throw new RangeError(`Unknown monitor edge: ${edge}`);
    }
}
