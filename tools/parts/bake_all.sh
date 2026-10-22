#!/bin/sh
# Sculpt and bake every anthro part into app/parts (needs a Python with numpy, scikit-image and bpy: pip install bpy scikit-image).
#   PY=/path/to/python sh tools/parts/bake_all.sh
set -e
cd "$(dirname "$0")"; PY=${PY:-python3}; OUT=../../app/parts; mkdir -p "$OUT" .out
for sp in canid felid bear dragon; do $PY hand.py $sp .out/hand-$sp.npz; $PY export.py .out/hand-$sp.npz $OUT/hand-$sp.txt 4600 1300; done
for sp in canid felid; do $PY foot.py $sp .out/foot-$sp.npz; $PY export.py .out/foot-$sp.npz $OUT/foot-$sp.txt 3800 900; done
$PY leg.py canid .out/leg.npz; $PY export.py .out/leg.npz $OUT/leg-digi.txt 4400 0
# the whole body below the head, one per paw family: needs the default wolf's body from the app (CHROMIUM: a Chrome to
# drive it with); rig.json and defaults.json (where the app lays each part on that body) were measured on it the same way
CHROMIUM=${CHROMIUM:?a Chrome for dump_body.js} node dump_body.js lobo .out/mhbody.json
for sp in canid felid; do $PY body.py $sp .out/body-$sp.npz .003; BODY=$sp $PY export.py .out/body-$sp.npz $OUT/body-$sp.txt 44000 2400; done
rm -f $OUT/*.low.npz
