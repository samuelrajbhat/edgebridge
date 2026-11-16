#!/usr/bin/env python3
"""Exercise the extension in an isolated, headless GNOME Shell 50 session."""

import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def stop_process_group(process):
    """Only signal the process group created for this test invocation."""
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        process.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bundle", type=Path,
        default=ROOT / ".build/monitor-portals@monitormap.local.shell-extension.zip",
        help="extension archive produced by make pack",
    )
    parser.add_argument(
        "--log", type=Path,
        help="combined output from the private D-Bus session and headless Shell",
    )
    navigation_mode = parser.add_mutually_exclusive_group()
    navigation_mode.add_argument(
        "--portal", action="store_true",
        help="exercise pointer navigation using two virtual monitors",
    )
    navigation_mode.add_argument(
        "--surround", action="store_true",
        help="exercise all four monitor edges in both directions",
    )
    parser.add_argument("--timeout", type=int, default=60, help="timeout in seconds (5–300)")
    args = parser.parse_args()
    if not 5 <= args.timeout <= 300:
        parser.error("--timeout must be between 5 and 300 seconds")

    for executable in ("dbus-run-session", "gnome-shell-test-tool", "gnome-shell"):
        if not shutil.which(executable):
            parser.error(f"missing prerequisite: {executable}")

    bundle = args.bundle.resolve()
    if not bundle.is_file():
        parser.error(f"bundle does not exist: {bundle}; run make pack first")
    try:
        with zipfile.ZipFile(bundle) as archive:
            metadata = json.loads(archive.read("metadata.json"))
        uuid = metadata["uuid"]
        if not isinstance(uuid, str) or not uuid:
            raise ValueError("metadata UUID is missing")
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        parser.error(f"cannot read extension metadata: {error}")

    test_name = "surround" if args.surround else "portal" if args.portal else "smoke"
    success_marker = f"Monitor Portals {test_name} test: PASS"
    log_path = (args.log or ROOT / f".build/{test_name}-test.log").resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    script_name = f"{test_name}.js" if test_name != "smoke" else "lifecycle.js"
    script = ROOT / "tests/integration" / script_name
    command = [
        "dbus-run-session", "--", "gnome-shell-test-tool",
        "--headless", "--disable-animations", "--extension", str(bundle), str(script),
    ]

    with tempfile.TemporaryDirectory(prefix="monitor-portals-smoke-") as isolated:
        if args.portal or args.surround:
            # The stock test tool supplies its 1280x720 monitor. Its documented
            # --wrap option lets us add one more without touching a live Shell.
            wrapper = Path(isolated) / "second-monitor.py"
            wrapper.write_text(
                "import os, sys\n"
                "argv = sys.argv[1:] + ['--virtual-monitor=800x600']\n"
                "os.execv(argv[0], argv)\n",
                encoding="utf-8",
            )
            command[3:3] = ["--wrap", f"{sys.executable} {wrapper}"]
        environment = os.environ.copy()
        # A private bus, display and settings store must never use the live session.
        for key in (
            "DBUS_SESSION_BUS_ADDRESS", "DBUS_STARTER_ADDRESS", "DBUS_STARTER_BUS_TYPE",
            "DISPLAY", "WAYLAND_DISPLAY", "GNOME_SHELL_SESSION_MODE", "SHELL_PERF_OUTPUT",
        ):
            environment.pop(key, None)
        for suffix in ("CONFIG_HOME", "DATA_HOME", "CACHE_HOME", "STATE_HOME", "RUNTIME_DIR"):
            directory = Path(isolated) / suffix.lower()
            directory.mkdir(mode=0o700)
            environment[f"XDG_{suffix}"] = str(directory)
        environment.update({
            "XDG_CURRENT_DESKTOP": "GNOME",
            "XDG_SESSION_TYPE": "wayland",
            "GSETTINGS_BACKEND": "keyfile",
            "LIBGL_ALWAYS_SOFTWARE": "1",
            "MONITOR_PORTALS_TEST_UUID": uuid,
        })
        # gnome-shell-test-tool creates an additional private settings/data home
        # and installs the archive there. HOME is deliberately left unchanged.
        with log_path.open("w", encoding="utf-8") as output:
            print(f"Starting isolated GNOME {test_name} test; log: {log_path}", flush=True)
            process = subprocess.Popen(
                command, env=environment, stdout=output, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                returncode = process.wait(timeout=args.timeout)
            except subprocess.TimeoutExpired:
                print(f"FAIL: GNOME test exceeded {args.timeout}s; inspect {log_path}", file=sys.stderr)
                return 1
            except KeyboardInterrupt:
                print(f"Test interrupted; log: {log_path}", file=sys.stderr)
                return 130
            finally:
                stop_process_group(process)
                # The document portal can outlive the bus briefly while its
                # private FUSE mount is being removed. Do not rmtree a live mount.
                document_mount = Path(isolated) / "runtime_dir/doc"
                deadline = time.monotonic() + 5
                while document_mount.is_mount() and time.monotonic() < deadline:
                    time.sleep(0.05)
                if document_mount.is_mount():
                    raise RuntimeError(f"Private document mount did not close: {document_mount}")

    output = log_path.read_text(encoding="utf-8", errors="replace")
    if returncode or success_marker not in output:
        print(f"FAIL: GNOME {test_name} test exited {returncode}; inspect {log_path}", file=sys.stderr)
        print("\n".join(output.splitlines()[-35:]), file=sys.stderr)
        return 1
    print(success_marker)
    return 0


if __name__ == "__main__":
    sys.exit(main())
