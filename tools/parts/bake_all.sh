#!/bin/sh
# Sculpt and bake every anthro part into app/parts (needs a Python with numpy, scikit-image and bpy: pip install bpy scikit-image).
#   PY=/path/to/python sh tools/parts/bake_all.sh
set -e
cd "$(dirname "$0")"; PY=${PY:-python3}; OUT=../../app/parts; mkdir -p "$OUT" .out
for sp in canid felid bear dragon; do $PY hand.py $sp .out/hand-$sp.npz; $PY export.py .out/hand-$sp.npz $OUT/hand-$sp.txt 9000 2400; done
for sp in canid felid; do $PY foot.py $sp .out/foot-$sp.npz; $PY export.py .out/foot-$sp.npz $OUT/foot-$sp.txt 7000 1800; done
rm -f $OUT/*.low.npz
