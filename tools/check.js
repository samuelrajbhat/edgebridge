// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const root = Gio.File.new_for_path(GLib.get_current_dir());
const excluded = new Set(['.git', '.agents', '.aws', '.codex', '.build', 'node_modules']);
const decoder = new TextDecoder();
let count = 0;

function checkDirectory(directory) {
    const enumerator = directory.enumerate_children(
        'standard::name,standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    try {
        let info;
        while ((info = enumerator.next_file(null))) {
            if (excluded.has(info.get_name()))
                continue;

            const child = directory.get_child(info.get_name());
            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                checkDirectory(child);
            } else if (info.get_file_type() === Gio.FileType.REGULAR && info.get_name().endsWith('.js')) {
                const [, contents] = child.load_contents(null);
                Reflect.parse(decoder.decode(contents), {target: 'module', source: child.get_path()});
                count++;
            }
        }
    } finally {
        enumerator.close(null);
    }
}

checkDirectory(root);
const [, contents] = root.get_child('metadata.json').load_contents(null);
const metadata = JSON.parse(decoder.decode(contents));
if (metadata.uuid !== 'monitor-portals@monitormap.local' || !metadata['shell-version'].includes('50'))
    throw new Error('Unexpected extension UUID or GNOME Shell target');
console.log(`Syntax checked ${count} JavaScript modules and extension metadata.`);
