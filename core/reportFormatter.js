// SPDX-License-Identifier: GPL-3.0-or-later
const EDGE_NAMES = ['top', 'right', 'bottom', 'left'];

function interval(segment) {
    return `[${segment.start}, ${segment.end})`;
}

export function formatMonitorLines({monitor, edges}) {
    const lines = [
        `ID: ${monitor.id} (current layout only)`,
        `Position: (${monitor.x}, ${monitor.y})`,
        `Size: ${monitor.width} × ${monitor.height}`,
    ];
    if (monitor.scale !== undefined)
        lines.push(`Scale: ${monitor.scale}`);

    for (const name of EDGE_NAMES) {
        const edge = edges[name];
        const fixedAxis = edge.axis === 'x' ? 'y' : 'x';
        lines.push(`${name[0].toUpperCase()}${name.slice(1)} (${fixedAxis} = ${edge.coordinate})`);
        lines.push(`  Shared ${edge.axis}: ${edge.shared.length
            ? edge.shared.map(segment => `${interval(segment)} → ${segment.monitorId}`).join(', ')
            : 'none'}`);
        lines.push(`  Blocked ${edge.axis}: ${edge.blocked.length
            ? edge.blocked.map(interval).join(', ')
            : 'none'}`);
    }
    return lines;
}

export function formatReport(snapshot) {
    if (snapshot.length === 0)
        return 'No logical monitors detected.';

    return snapshot.map(entry => {
        const {monitor} = entry;
        const title = monitor.index === undefined ? monitor.id : `Monitor ${monitor.index + 1}`;
        return `${title}${monitor.primary ? ' · Primary' : ''}\n${formatMonitorLines(entry).join('\n')}`;
    }).join('\n\n');
}
