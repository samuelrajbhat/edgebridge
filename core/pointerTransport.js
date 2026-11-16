// SPDX-License-Identifier: GPL-3.0-or-later
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import {readPointerSample} from './cursorTracker.js';
import {planTransfer} from './transportPlan.js';
import {validateRoute} from './routeValidator.js';

function samePosition(first, second) {
    return Math.abs(first.x - second.x) < 0.75 && Math.abs(first.y - second.y) < 0.75;
}

function routeKey(route) {
    return JSON.stringify([route?.mode ?? 'blocked-only', route?.source?.monitor,
        route?.source?.edge, route?.destination?.monitor, route?.destination?.edge]);
}

/** One asynchronous attempt, with verified waypoints and no automatic retries. */
export class PointerTransport {
    constructor(snapshot, route) {
        const inputs = Array.isArray(route) ? route : [route];
        if (inputs.length === 0)
            throw new RangeError('Pointer transport needs at least one route');
        this._routes = new Map(inputs.map(input => {
            const validated = validateRoute(snapshot, input).route;
            return [routeKey(validated), validated];
        }));
        this._snapshot = snapshot;
        this._seat = global.stage.get_context().get_backend().get_default_seat();
        this._tracker = global.backend.get_cursor_tracker();
        this._cancel = null;
        this._stopped = false;
        this.busy = false;
    }

    stop() {
        this._stopped = true;
        this._cancel?.();
    }

    async transfer(transition) {
        if (this.busy || this._stopped)
            return {success: false, actual: readPointerSample(), reason: 'inactive-or-busy'};
        this.busy = true;
        try {
            const route = this._routes.get(routeKey(transition.route));
            if (!route)
                return {success: false, actual: readPointerSample(), reason: 'unconfigured-route'};
            if (!samePosition(readPointerSample(), transition.source))
                return {success: false, actual: readPointerSample(), reason: 'pointer-moved'};
            for (const target of planTransfer(this._snapshot, route, transition)) {
                const result = await this._warpOnce(target);
                if (!result.success)
                    return result;
            }
            return {success: true, actual: readPointerSample()};
        } finally {
            this.busy = false;
        }
    }

    _warpOnce(target) {
        const before = readPointerSample();
        if (this._stopped || before.buttonsPressed || before.suspended)
            return Promise.resolve({success: false, actual: before, reason: 'suspended'});
        if (samePosition(before, target))
            return Promise.resolve({success: true, actual: before});

        return new Promise(resolve => {
            let signal = 0;
            let timeout = 0;
            let later = 0;
            let finished = false;
            const finish = (success, reason) => {
                if (finished)
                    return;
                finished = true;
                if (signal)
                    this._tracker.disconnect(signal);
                if (timeout)
                    GLib.source_remove(timeout);
                if (later)
                    global.compositor.get_laters().remove(later);
                this._cancel = null;
                resolve({success, actual: readPointerSample(), reason});
            };
            const verify = () => {
                const actual = readPointerSample();
                if (actual.buttonsPressed || actual.suspended)
                    finish(false, 'suspended');
                else if (samePosition(actual, target))
                    finish(true);
                else if (!samePosition(actual, before))
                    finish(false, 'warp-constrained-or-pointer-moved');
            };
            this._cancel = () => finish(false, 'cancelled');
            signal = this._tracker.connect('position-invalidated', () => {
                if (later)
                    return;
                later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
                    later = 0;
                    verify();
                    return GLib.SOURCE_REMOVE;
                });
            });
            timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
                timeout = 0;
                verify();
                if (!finished)
                    finish(false, 'warp-timeout');
                return GLib.SOURCE_REMOVE;
            });
            try {
                this._seat.warp_pointer(target.x, target.y);
            } catch (error) {
                finish(false, error.message);
            }
        });
    }
}
