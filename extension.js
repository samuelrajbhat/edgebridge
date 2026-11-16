// SPDX-License-Identifier: GPL-3.0-or-later
import St from 'gi://St';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {MonitorManager} from './core/monitorManager.js';
import {formatMonitorLines, formatReport} from './core/reportFormatter.js';
import {CursorTracker} from './core/cursorTracker.js';
import {NavigationEngine} from './core/navigationEngine.js';
import {PointerTransport} from './core/pointerTransport.js';
import {createSurroundRoutes, findPrototypeRoute} from './core/portalRoutes.js';

export default class MonitorPortalsExtension extends Extension {
    enable() {
        this._snapshot = [];
        this._lastError = null;
        this._route = null;
        this._routes = [];
        this._navigationMode = 'blocked';
        this._sourceId = null;
        this._destinationId = null;
        this._bidirectional = true;
        this._configurationError = null;
        this._cursorTracker = null;
        this._pointerTransport = null;
        this._engine = null;
        this._portalBusy = false;
        this._portalError = null;
        this._lastTransfer = null;
        this._transferCount = 0;
        this._menuUpdateId = 0;

        try {
            this._indicator = new PanelMenu.Button(0.0, 'Monitor Portals');
            this._indicator.add_child(new St.Icon({
                icon_name: 'video-display-symbolic',
                style_class: 'system-status-icon',
            }));
            Main.panel.addToStatusArea(this.uuid, this._indicator);

            this._monitorManager = new MonitorManager(
                Main.layoutManager,
                snapshot => {
                    const changed = JSON.stringify(snapshot) !== JSON.stringify(this._snapshot);
                    if (changed) {
                        this._stopPortal();
                        // Shell indices are transient, so do not carry a selected
                        // pair across a changed layout without a new opt-in.
                        const initial = findPrototypeRoute(snapshot);
                        this._sourceId = initial?.source.monitor ?? snapshot[0]?.monitor.id ?? null;
                        this._destinationId = initial?.destination.monitor ??
                            snapshot.find(entry => entry.monitor.id !== this._sourceId)?.monitor.id ?? null;
                        this._rebuildRoutes(snapshot);
                        this._portalError = null;
                        this._lastTransfer = null;
                    }
                    this._snapshot = snapshot;
                    this._lastError = null;
                    this._queueMenuUpdate();
                    console.log(`[Monitor Portals]\n${formatReport(snapshot)}`);
                },
                error => this._showError(error)
            );
            this._monitorManager.start();
        } catch (error) {
            this.disable();
            throw error;
        }
    }

    disable() {
        if (this._menuUpdateId)
            GLib.source_remove(this._menuUpdateId);
        this._menuUpdateId = 0;
        this._stopPortal();
        this._monitorManager?.stop();
        this._monitorManager = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._snapshot = null;
        this._lastError = null;
        this._route = null;
        this._routes = [];
        this._sourceId = null;
        this._destinationId = null;
        this._configurationError = null;
        this._lastTransfer = null;
        this._portalError = null;
    }

    getSnapshot() {
        return this._snapshot;
    }

    getPortalStatus() {
        return {
            enabled: this._cursorTracker !== null,
            route: this._route,
            routes: this._routes,
            mode: this._navigationMode,
            sourceId: this._sourceId,
            destinationId: this._destinationId,
            bidirectional: this._bidirectional,
            configurationError: this._configurationError,
            lastTransfer: this._lastTransfer,
            attempts: this._transferCount,
        };
    }

    configureNavigation({mode, sourceId, destinationId, bidirectional}) {
        if (!['blocked', 'surround'].includes(mode))
            throw new RangeError('Unknown navigation mode');
        if (typeof bidirectional !== 'boolean')
            throw new TypeError('Return navigation must be a boolean');
        if (mode === 'surround') {
            if (sourceId === destinationId)
                throw new RangeError('Choose two different monitors');
            for (const id of [sourceId, destinationId]) {
                if (!this._snapshot?.some(entry => entry.monitor.id === id))
                    throw new RangeError('Selected monitor is no longer available');
            }
        }
        this._stopPortal();
        this._navigationMode = mode;
        this._sourceId = sourceId;
        this._destinationId = destinationId;
        this._bidirectional = bidirectional;
        this._portalError = null;
        this._lastTransfer = null;
        this._transferCount = 0;
        this._rebuildRoutes(this._snapshot);
        this._queueMenuUpdate();
    }

    _changeConfiguration(changes) {
        this.configureNavigation({
            mode: this._navigationMode,
            sourceId: this._sourceId,
            destinationId: this._destinationId,
            bidirectional: this._bidirectional,
            ...changes,
        });
    }

    _rebuildRoutes(snapshot) {
        this._routes = [];
        this._configurationError = null;
        try {
            if (this._navigationMode === 'surround') {
                this._routes = createSurroundRoutes(snapshot, this._sourceId,
                    this._destinationId, this._bidirectional);
            } else {
                const route = findPrototypeRoute(snapshot);
                this._routes = route ? [route] : [];
            }
        } catch (error) {
            this._configurationError = error.message;
        }
        this._route = this._routes[0] ?? null;
    }

    setPortalEnabled(enabled) {
        this._stopPortal();
        this._portalError = null;
        if (enabled) {
            try {
                if (this._routes.length === 0)
                    throw new Error(this._configurationError ?? 'No portal route is available');
                this._engine = new NavigationEngine(this._snapshot, this._routes);
                this._pointerTransport = new PointerTransport(this._snapshot, this._routes);
                this._transferCount = 0;
                this._lastTransfer = null;
                this._cursorTracker = new CursorTracker(
                    sample => this._processPointer(sample), error => this._portalFailed(error));
                this._cursorTracker.start();
            } catch (error) {
                this._portalFailed(error);
                return;
            }
        }
        if (this._indicator)
            this._queueMenuUpdate();
    }

    _stopPortal() {
        this._cursorTracker?.stop();
        this._cursorTracker = null;
        this._pointerTransport?.stop();
        this._pointerTransport = null;
        this._engine = null;
        this._portalBusy = false;
    }

    _portalFailed(error) {
        this._stopPortal();
        this._portalError = error.message;
        console.error(`[Monitor Portals] Portal stopped: ${error.stack ?? error}`);
        if (this._indicator)
            this._queueMenuUpdate();
    }

    _processPointer(sample) {
        if (!this._engine || this._portalBusy)
            return;
        if (sample.suspended) {
            this._engine.reset();
            return;
        }
        const transition = this._engine.process(sample);
        if (!transition)
            return;

        const transport = this._pointerTransport;
        this._portalBusy = true;
        this._transferCount++;
        transport.transfer(transition).then(result => {
            if (this._pointerTransport !== transport)
                return;
            this._portalBusy = false;
            this._lastTransfer = result;
            console.log(`[Monitor Portals] Portal ${result.success ? 'completed' : 'stopped'}: ${JSON.stringify(result)}`);
        }).catch(error => {
            if (this._pointerTransport === transport)
                this._portalFailed(error);
        });
    }

    _showError(error) {
        this._stopPortal();
        this._route = null;
        this._routes = [];
        this._snapshot = [];
        this._lastError = error.message;
        console.error(`[Monitor Portals] Monitor inspection failed: ${error.stack ?? error}`);
        this._queueMenuUpdate();
    }

    _queueMenuUpdate() {
        if (this._menuUpdateId)
            return;
        this._menuUpdateId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._menuUpdateId = 0;
            if (this._indicator)
                this._renderMenu();
            return GLib.SOURCE_REMOVE;
        });
    }

    _renderMenu() {
        const menu = this._indicator.menu;
        menu.removeAll();
        menu.addMenuItem(new PopupMenu.PopupMenuItem('Monitor Portals · Prototype', {
            reactive: false,
        }));
        this._addNavigationControls(menu);
        if (this._route) {
            const label = endpoint => {
                const entry = this._snapshot.find(item => item.monitor.id === endpoint.monitor);
                return `Monitor ${entry.monitor.index + 1} ${endpoint.edge}`;
            };
            const summary = this._navigationMode === 'surround'
                ? `All four edges · ${this._monitorName(this._sourceId)} ${this._bidirectional ? '⇄' : '→'} ${this._monitorName(this._destinationId)}`
                : `${label(this._route.source)} → ${label(this._route.destination)}`;
            menu.addMenuItem(new PopupMenu.PopupMenuItem(summary, {reactive: false}));
            const toggle = new PopupMenu.PopupSwitchMenuItem('Enable prototype portal',
                this._cursorTracker !== null);
            toggle.connect('toggled', (_item, enabled) => this.setPortalEnabled(enabled));
            menu.addMenuItem(toggle);
        } else {
            const message = this._navigationMode === 'surround'
                ? (this._configurationError ?? 'Choose an adjacent monitor pair')
                : 'No adjacent blocked-edge route available';
            menu.addMenuItem(new PopupMenu.PopupMenuItem(message, {
                reactive: false,
            }));
        }
        if (this._portalError) {
            menu.addMenuItem(new PopupMenu.PopupMenuItem('Portal stopped; see Shell logs', {
                reactive: false,
            }));
        }
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (this._lastError) {
            menu.addMenuItem(new PopupMenu.PopupMenuItem('Inspection failed; see Shell logs', {
                reactive: false,
            }));
        } else if (this._snapshot.length === 0) {
            menu.addMenuItem(new PopupMenu.PopupMenuItem('No logical monitors detected', {
                reactive: false,
            }));
        }

        for (const entry of this._snapshot) {
            const {monitor} = entry;
            const title = `Monitor ${monitor.index + 1}${monitor.primary ? ' · Primary' : ''}`;
            const item = new PopupMenu.PopupSubMenuMenuItem(title);
            for (const line of formatMonitorLines(entry)) {
                item.menu.addMenuItem(new PopupMenu.PopupMenuItem(line, {
                    reactive: false,
                }));
            }
            menu.addMenuItem(item);
        }

        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const refresh = new PopupMenu.PopupMenuItem('Refresh inspection');
        refresh.connect('activate', () => {
            try {
                this._monitorManager.refresh();
            } catch (error) {
                this._showError(error);
            }
        });
        menu.addMenuItem(refresh);
    }

    _monitorName(id) {
        const monitor = this._snapshot?.find(entry => entry.monitor.id === id)?.monitor;
        return monitor ? `Monitor ${monitor.index + 1}` : 'Choose monitor';
    }

    _addNavigationControls(menu) {
        const modes = new PopupMenu.PopupSubMenuMenuItem(
            `Mode: ${this._navigationMode === 'surround' ? 'All directions' : 'Blocked-edge rescue'}`);
        for (const [mode, title] of [['blocked', 'Blocked-edge rescue'], ['surround', 'All directions']]) {
            const item = new PopupMenu.PopupMenuItem(title);
            item.setOrnament(mode === this._navigationMode ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            if (mode === 'surround')
                item.setSensitive(this._snapshot.length >= 2);
            item.connect('activate', () => this._changeConfiguration({mode}));
            modes.menu.addMenuItem(item);
        }
        menu.addMenuItem(modes);
        if (this._navigationMode !== 'surround')
            return;

        const source = new PopupMenu.PopupSubMenuMenuItem(`From: ${this._monitorName(this._sourceId)}`);
        const destination = new PopupMenu.PopupSubMenuMenuItem(`To: ${this._monitorName(this._destinationId)}`);
        for (const {monitor} of this._snapshot) {
            const title = `${this._monitorName(monitor.id)} · ${monitor.width} × ${monitor.height}`;
            const fromItem = new PopupMenu.PopupMenuItem(title);
            fromItem.setOrnament(monitor.id === this._sourceId ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            fromItem.connect('activate', () => this._changeConfiguration({
                sourceId: monitor.id,
                destinationId: monitor.id === this._destinationId ? this._sourceId : this._destinationId,
            }));
            source.menu.addMenuItem(fromItem);
            const toItem = new PopupMenu.PopupMenuItem(title);
            toItem.setOrnament(monitor.id === this._destinationId ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
            toItem.setSensitive(monitor.id !== this._sourceId);
            toItem.connect('activate', () => this._changeConfiguration({destinationId: monitor.id}));
            destination.menu.addMenuItem(toItem);
        }
        menu.addMenuItem(source);
        menu.addMenuItem(destination);
        const returnToggle = new PopupMenu.PopupSwitchMenuItem('Enable return portals', this._bidirectional);
        returnToggle.connect('toggled', (_item, bidirectional) => this._changeConfiguration({bidirectional}));
        menu.addMenuItem(returnToggle);
        menu.addMenuItem(new PopupMenu.PopupMenuItem('Shared edges use normal movement', {reactive: false}));
    }
}
