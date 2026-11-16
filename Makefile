UUID := monitor-portals@monitormap.local
BUNDLE := .build/$(UUID).shell-extension.zip

.PHONY: check test syntax demo pack smoke portal-test surround-test

check: syntax test

syntax:
	gjs -m tools/check.js

test:
	gjs -m tests/run.js

demo:
	gjs -m tools/demo.js

pack: check
	mkdir -p .build
	gnome-extensions pack --force --out-dir=.build --extra-source=core --extra-source=LICENSE .
	python3 tools/check-bundle.py "$(BUNDLE)"

smoke: pack
	python3 tools/smoke-test.py --bundle "$(BUNDLE)"

portal-test: pack
	python3 tools/smoke-test.py --portal --bundle "$(BUNDLE)"

surround-test: pack
	python3 tools/smoke-test.py --surround --bundle "$(BUNDLE)"
