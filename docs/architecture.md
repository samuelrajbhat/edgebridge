# Architecture

Monitor Portals implements the geometry inspector and an opt-in single-route
cursor portal for GNOME Shell 50. Preferences, saved routes, and bidirectional
navigation remain later milestones.

## Runtime flow

`extension.js` creates a panel indicator and starts `MonitorManager`. The manager
reads `Main.layoutManager.monitors` immediately and again whenever
`Main.layoutManager` emits `monitors-changed`. Each refresh produces a new
snapshot, updates the panel menu, and writes a `[Monitor Portals]` report to the
Shell log. The menu also offers **Refresh inspection**.

| Module | Responsibility |
| --- | --- |
| `extension.js` | Extension lifecycle, panel menu, and error presentation |
| `core/monitorManager.js` | Adapt Shell monitor records and own the layout-change signal |
| `core/geometry.js` | Validate rectangles, describe edges, intersect and subtract intervals |
| `core/edgeDetector.js` | Calculate shared and blocked intervals for each monitor edge |
| `core/reportFormatter.js` | Format the same snapshot for the menu, logs, and demo |
| `core/coordinateMapper.js` | Proportional mapping to contained integer positions and inset |
| `core/routeValidator.js`, `core/portalRoutes.js` | Validate/select one adjacent blocked-edge route |
| `core/navigationEngine.js` | Outward motion, blocked-only activation, buttons, cooldown, rearming |
| `core/cursorTracker.js` | Position-invalidated signal, redraw coalescing, input and Shell state |
| `core/transportPlan.js`, `core/pointerTransport.js` | Plan seam waypoints and asynchronously verify each warp |

The geometry and formatting modules have no GNOME imports. `MonitorManager`
receives a layout manager and callbacks, allowing its signal lifecycle to be
checked without launching Shell. Disabling the extension disconnects its layout
signal, destroys its indicator, and clears its snapshot. A failed initial refresh
also releases resources. A failed later refresh clears the displayed snapshot
and reports the error instead of retaining old geometry.

## Geometry contract

All coordinates are logical desktop coordinates. A monitor owns the half-open
rectangle `[x, x + width) × [y, y + height)`. Right and bottom boundaries are
exclusive; they are mathematical edge coordinates, not the final pixel centers.
The Shell adapter copies `geometry_scale` to `scale` as descriptive metadata and
does not multiply or divide the geometry by it.

`analyzeLayout(monitors)` accepts an array of records:

```js
{
    id: 'monitor-0',
    index: 0,
    x: 0,
    y: 0,
    width: 3440,
    height: 1440,
    scale: 1,
    primary: true,
}
```

`id`, `x`, `y`, `width`, and `height` are required. IDs must be unique, non-empty
strings; coordinates must be finite; dimensions must be positive and have
representable bounds. Optional `scale` must be positive and finite. Overlapping
logical rectangles are rejected. Mirrored physical outputs should already be
represented as one logical monitor by Shell. An empty layout returns an empty
array. Invalid layouts throw an error. Inputs are copied rather than modified.

The result preserves input monitor order and contains one entry per monitor:

```js
{
    monitor: { /* copied monitor record */ },
    edges: {
        bottom: {
            axis: 'x',
            coordinate: 1440,
            start: 0,
            end: 3440,
            shared: [{start: 760, end: 2680, monitorId: 'monitor-1'}],
            blocked: [{start: 0, end: 760}, {start: 2680, end: 3440}],
        },
        // top, right, and left use the same structure.
    },
}
```

`axis` is the axis along the edge; `coordinate` is its position on the other axis.
All intervals use absolute desktop coordinates and the half-open form
`[start, end)`. Each shared interval identifies its adjacent monitor.

For each edge, the engine compares its fixed coordinate with every other
monitor's opposite edge. Equal coordinates and a positive interval intersection
define a shared seam. Corner contact alone does not form a seam, and any gap
remains blocked. The engine subtracts the union of shared intervals from the
whole edge to obtain blocked intervals. This supports multiple neighbors along
one edge, negative desktop coordinates, and fractional logical coordinates.

Here, **blocked** means no adjacent logical monitor exists across that interval.
It does not describe compositor pointer barriers, application confinement, hot
corners, or whether a future pointer warp will succeed.

## Monitor identity and compatibility

The adapter currently assigns `monitor-${index}` IDs. GNOME can reorder indices
after a monitor change, so these IDs identify only the current snapshot. They
must not be persisted as hardware identities. Connector and hardware identity
resolution belongs to the later route-configuration work.

The extension UUID, `monitor-portals@monitormap.local`, is provisional for local
development. Metadata targets Shell `50`; other major versions are not declared
supported. There is no `prefs.js` or GSettings schema yet because this checkpoint
has no saved configuration. A layout change stops any enabled portal and chooses
a fresh candidate; it never silently transfers an enabled route to new indices.

## Portal operation

The panel switch enables one directed route, defaulting to off. Candidate routes
must connect opposite facing edges with a nonempty native shared seam and blocked
source positions. The route with the most blocked length is selected, with stable
input order breaking ties. A normal shared edge or a disconnected pair is ineligible.

`position-invalidated` schedules at most one sample per `BEFORE_REDRAW` callback.
There is no continuous polling. The engine requires an outward approach from a
previous position in the same source monitor to its outermost integer edge.
It rejects native shared portions, held buttons, and the first sample after a
button release. Overview, a locked session, and Shell modal dialogs reset motion
history. Approaching an edge from inside can trigger immediately; intent detection
is conservative direction tracking, not a dwell or pressure gesture.

The mapper uses first/last contained integer positions, proportional rounding,
and a default three-pixel destination inset. Returning a transition immediately
disarms the engine, including when transport subsequently fails. Rearming requires
a sample at least two pixels away from both route edges and the 120ms cooldown
to have elapsed. Neither value is claimed to be optimal for physical hardware.

Transport retreats inside the source, moves along its interior to the shared seam
midpoint, crosses to an inset inside the destination, and reaches the mapped target.
Each asynchronous `Clutter.Seat.warp_pointer` is verified from pointer events, with
a 150ms one-shot timeout. A mismatched position, button press, Shell modal state,
or timeout stops the sequence without another warp attempt. Intermediate steps
may be visible. This prototype does not meet or claim a two-frame latency target.
It never removes or releases compositor barriers or constraints; actual application
confinement still requires integration tests.

Disable and layout invalidation disconnect tracking, remove scheduled redraw/menu
callbacks, cancel pending transport verification, and clear the engine. A warp
already submitted to Mutter cannot be recalled, but cancellation prevents later
waypoints. Results from an old transport instance cannot update a new session.

## Verification boundaries

`make check` checks JavaScript syntax, metadata, and portable unit tests.
`make smoke` loads the packaged extension in a separate headless GNOME session,
checks its geometry against Shell, cycles enable/disable three times, and checks
for extension errors. A successful smoke test covers that virtual monitor
environment. `make portal-test` additionally exercises a 1280×720 display above
an 800×600 display at x=240, tests both blocked regions and safety conditions, and
checks an injected refused warp. Physical monitor hotplug, mixed scaling, and comparison with the
user's actual monitor arrangement remain manual acceptance checks.

## API references

- [GNOME Shell 50.1 layout implementation](https://raw.githubusercontent.com/GNOME/gnome-shell/50.1/js/ui/layout.js): monitor records, logical geometry, scale, and change notifications.
- [GNOME Shell 50 compatibility notes](https://gjs.guide/extensions/upgrading/gnome-shell-50.html): extension compatibility and the test tool's `--extension` option.
- [Extension lifecycle API](https://gjs.guide/extensions/topics/extension.html) and [popup menus](https://gjs.guide/extensions/topics/popup-menu.html): extension and inspector UI structure.
- [Cursor Wrap source](https://github.com/friscic/gnome-cursor-wrap/blob/master/extension.js): researched for later cursor tracking, safety, and transport work. No Cursor Wrap source was copied into this checkpoint.
- [Mutter 50.1 native seat implementation](https://raw.githubusercontent.com/GNOME/mutter/50.1/src/backends/native/meta-seat-impl.c): asynchronous input-task dispatch for pointer warps; the implementation verifies results instead of assuming immediate completion.

