// SPDX-License-Identifier: GPL-3.0-or-later
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BUTTON_MASK = Clutter.ModifierType.BUTTON1_MASK | Clutter.ModifierType.BUTTON2_MASK |
    Clutter.ModifierType.BUTTON3_MASK | Clutter.ModifierType.BUTTON4_MASK |
    Clutter.ModifierType.BUTTON5_MASK;

export function readPointerSample() {
    const [x, y, modifiers] = global.get_pointer();
    return {
        x, y,
        buttonsPressed: (modifiers & BUTTON_MASK) !== 0,
        timeMs: GLib.get_monotonic_time() / 1000,
        suspended: Main.overview.visible || Main.sessionMode.isLocked || Main.modalCount > 0,
    };
}

/** Event-driven samples, coalesced to at most one per redraw. */
export class CursorTracker {
    constructor(onSample, onError) {
        this._onSample = onSample;
        this._onError = onError;
        this._tracker = null;
        this._signal = 0;
        this._later = 0;
    }

    start() {
        if (this._tracker)
            return;
        this._tracker = global.backend.get_cursor_tracker();
        this._signal = this._tracker.connect('position-invalidated', () => this._schedule());
        this._schedule();
    }

    _schedule() {
        if (this._later || !this._tracker)
            return;
        this._later = global.compositor.get_laters().add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._later = 0;
            try {
                this._onSample(readPointerSample());
            } catch (error) {
                this._onError(error);
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    stop() {
        if (this._later)
            global.compositor.get_laters().remove(this._later);
        if (this._signal)
            this._tracker.disconnect(this._signal);
        this._later = 0;
        this._signal = 0;
        this._tracker = null;
    }
}
