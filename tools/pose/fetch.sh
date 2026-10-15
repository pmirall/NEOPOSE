#!/bin/sh
# Pose from a photo: TensorFlow.js (Apache-2.0) and the BlazePose GHUM 3D models (Apache-2.0, MediaPipe), copied to app/vendor/pose.
set -e
cd "$(dirname "$0")"; mkdir -p build && cd build
npm init -y >/dev/null
npm i --no-audit --no-fund @tensorflow/tfjs-core@4.22.0 @tensorflow/tfjs-backend-webgl@4.22.0 @tensorflow/tfjs-converter@4.22.0 @tensorflow-models/pose-detection@2.1.3
D=../../../app/vendor/pose; mkdir -p $D/detector $D/landmark
cp node_modules/@tensorflow/tfjs-core/dist/tf-core.min.js node_modules/@tensorflow/tfjs-converter/dist/tf-converter.min.js \
   node_modules/@tensorflow/tfjs-backend-webgl/dist/tf-backend-webgl.min.js node_modules/@tensorflow-models/pose-detection/dist/pose-detection.min.js $D/
# licence notice: app/vendor/pose/LICENSE.txt (the npm packages ship it inside the .min.js headers)
for m in detector/1:detector landmark/full/2:landmark; do src=${m%%:*}; dst=${m##*:}
  for f in model.json group1-shard1of2.bin group1-shard2of2.bin; do curl -sfL -o $D/$dst/$f "https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/$src/$f?tfjs-format=file"; done
done
