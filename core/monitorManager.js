// SPDX-License-Identifier: GPL-3.0-or-later
import {analyzeLayout} from './edgeDetector.js';

/** Adapt Shell's logical monitor rectangles without importing Shell into tests. */
export class MonitorManager {
    constructor(layoutManager, onChange, onError) {
        this._layoutManager = layoutManager;
        this._onChange = onChange;
        this._onError = onError;
        this._signalId = null;
    }

    start() {
        if (this._signalId !== null)
            return;

        this._signalId = this._layoutManager.connect('monitors-changed', () => {
            try {
                this.refresh();
            } catch (error) {
                this._onError(error);
            }
        });
        try {
            this.refresh();
        } catch (error) {
            this.stop();
            throw error;
        }
    }

    refresh() {
        const monitors = this._layoutManager.monitors.map(monitor => ({
            // Snapshot IDs only: Shell indices may change after hotplugging.
            id: `monitor-${monitor.index}`,
            index: monitor.index,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            scale: monitor.geometry_scale,
            primary: monitor.index === this._layoutManager.primaryIndex,
        }));
        const snapshot = analyzeLayout(monitors);
        this._onChange(snapshot);
        return snapshot;
    }

    stop() {
        if (this._signalId === null)
            return;

        this._layoutManager.disconnect(this._signalId);
        this._signalId = null;
    }
}
