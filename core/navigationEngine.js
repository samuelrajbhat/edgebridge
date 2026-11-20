// SPDX-License-Identifier: GPL-3.0-or-later
import {containsPoint, EDGES} from './geometry.js';
import {integerBounds, mapToEdge} from './coordinateMapper.js';
import {validateRoute} from './routeValidator.js';

function distanceFromEdge(bounds, edge, point) {
    switch (edge) {
    case 'top': return point.y - bounds.minY;
    case 'right': return bounds.maxX - point.x;
    case 'bottom': return bounds.maxY - point.y;
    case 'left': return point.x - bounds.minX;
    default: throw new RangeError('Unknown edge');
    }
}

function outwardDistance(edge, previous, current) {
    switch (edge) {
    case 'top': return previous.y - current.y;
    case 'right': return current.x - previous.x;
    case 'bottom': return current.y - previous.y;
    case 'left': return previous.x - current.x;
    default: return 0;
    }
}

/** Pure route selection with one safety state shared by every exit and return. */
export class NavigationEngine {
    constructor(snapshot, route, {landingInset = 3, cooldownMs = 120} = {}) {
        for (const [name, value] of Object.entries({landingInset, cooldownMs})) {
            if (!Number.isFinite(value) || value < 0)
                throw new RangeError(`${name} must be finite and nonnegative`);
        }
        const inputs = Array.isArray(route) ? route : [route];
        if (inputs.length === 0)
            throw new RangeError('Navigation needs at least one route');
        const seen = new Set();
        this._bindings = inputs.map(input => {
            const validated = validateRoute(snapshot, input);
            const key = JSON.stringify(validated.route.source);
            if (seen.has(key))
                throw new RangeError('Only one route per source monitor edge is supported');
            seen.add(key);
            return {
                ...validated,
                sourceBounds: integerBounds(validated.sourceEntry.monitor),
                destinationBounds: integerBounds(validated.destinationEntry.monitor),
            };
        });
        this.routes = Object.freeze(this._bindings.map(binding => binding.route));
        // Retain the original single-route API for existing callers.
        this.route = this.routes[0];
        this.options = Object.freeze({landingInset, cooldownMs});
        this.reset();
    }

    get armed() {
        return this._armed;
    }

    reset() {
        this._previous = null;
        this._armed = true;
        this._cooldownUntil = 0;
    }

    _nearTriggerEdge(point) {
        for (const binding of this._bindings) {
            for (const [entry, bounds, edge] of [
                [binding.sourceEntry, binding.sourceBounds, binding.route.source.edge],
                [binding.destinationEntry, binding.destinationBounds, binding.route.destination.edge],
            ]) {
                if (containsPoint(entry.monitor, point.x, point.y) &&
                    distanceFromEdge(bounds, edge, point) <= this.options.landingInset)
                    return true;
            }
        }
        return false;
    }

    process(sample) {
        if (!Number.isFinite(sample?.x) || !Number.isFinite(sample?.y) ||
            !Number.isFinite(sample?.timeMs) || sample.timeMs < 0)
            throw new TypeError('Pointer coordinates and monotonic time must be finite');
        if (typeof sample.buttonsPressed !== 'boolean')
            throw new TypeError('buttonsPressed must be a boolean');

        const previous = this._previous;
        const current = {...sample};
        this._previous = current;

        // A button release cannot turn the final movement of a drag into an exit.
        if (current.buttonsPressed || previous?.buttonsPressed)
            return null;

        if (!this._armed) {
            if (current.timeMs >= this._cooldownUntil && !this._nearTriggerEdge(current))
                this._armed = true;
            return null;
        }

        if (!previous)
            return null;

        const candidates = [];
        for (const binding of this._bindings) {
            const source = binding.sourceEntry.monitor;
            if (!containsPoint(source, previous.x, previous.y) ||
                !containsPoint(source, current.x, current.y))
                continue;

            const edgeName = binding.route.source.edge;
            const distance = outwardDistance(edgeName, previous, current);
            if (distanceFromEdge(binding.sourceBounds, edgeName, current) > 0 || distance <= 0)
                continue;

            const edge = binding.sourceEntry.edges[edgeName];
            const along = edge.axis === 'x' ? current.x : current.y;
            if (edge.blocked.some(interval => along >= interval.start && along < interval.end))
                candidates.push({binding, distance});
        }
        if (candidates.length === 0)
            return null;

        // At a corner, the larger perpendicular movement determines the exit.
        // Equal movement uses a stable edge order independent of route order.
        candidates.sort((first, second) => second.distance - first.distance ||
            EDGES.indexOf(first.binding.route.source.edge) - EDGES.indexOf(second.binding.route.source.edge));
        const {binding} = candidates[0];
        const destination = mapToEdge(binding.sourceEntry.monitor, binding.route.source.edge,
            binding.destinationEntry.monitor, binding.route.destination.edge,
            current, this.options.landingInset);

        // No acknowledgement from the compositor is needed to disarm. A refused
        // warp must not cause another attempt while the cursor remains at an edge.
        this._armed = false;
        this._cooldownUntil = current.timeMs + this.options.cooldownMs;
        return {destination, source: {x: current.x, y: current.y}, route: binding.route};
    }
}
