#!/bin/sh
# The on-device models and their runtime, copied to app/vendor and checked against SHA256SUMS:
# - pose from a photo: TensorFlow.js 4.22 (Apache-2.0) and the BlazePose GHUM 3D models (Apache-2.0, MediaPipe), app/vendor/pose;
# - the content filter of the reference search: TensorFlow.js Layers 4.22 (Apache-2.0, in app/vendor/pose) and the
#   NSFWJS 4.4.0 MobileNetV2 model (MIT), app/vendor/nsfw (its weights file renamed .bin, as model.json names it).
set -e
cd "$(dirname "$0")"; mkdir -p build && cd build
npm init -y >/dev/null
npm i --no-audit --no-fund @tensorflow/tfjs-core@4.22.0 @tensorflow/tfjs-backend-webgl@4.22.0 @tensorflow/tfjs-converter@4.22.0 @tensorflow/tfjs-layers@4.22.0 @tensorflow-models/pose-detection@2.1.3
V=../../../app/vendor; D=$V/pose; N=$V/nsfw; mkdir -p $D/detector $D/landmark $N
cp node_modules/@tensorflow/tfjs-core/dist/tf-core.min.js node_modules/@tensorflow/tfjs-converter/dist/tf-converter.min.js \
   node_modules/@tensorflow/tfjs-backend-webgl/dist/tf-backend-webgl.min.js node_modules/@tensorflow/tfjs-layers/dist/tf-layers.min.js \
   node_modules/@tensorflow-models/pose-detection/dist/pose-detection.min.js $D/
# licence notices: app/vendor/pose/LICENSE.txt (the npm packages ship it inside the .min.js headers), app/vendor/nsfw/LICENSE-nsfwjs.txt
for m in detector/1:detector landmark/full/2:landmark; do src=${m%%:*}; dst=${m##*:}
  for f in model.json group1-shard1of2.bin group1-shard2of2.bin; do curl -sfL -o $D/$dst/$f "https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/$src/$f?tfjs-format=file"; done
done
U=https://raw.githubusercontent.com/infinitered/nsfwjs/v4.4.0/models/mobilenet_v2
curl -sfL -o $N/group1-shard1of1.bin $U/group1-shard1of1; curl -sfL -o model-nsfw.json $U/model.json
node -e "const f=require('fs'), m=JSON.parse(f.readFileSync('model-nsfw.json','utf8')); m.weightsManifest[0].paths=['group1-shard1of1.bin']; f.writeFileSync('$N/model.json', JSON.stringify(m))"
cd $V && sha256sum -c ../../tools/pose/SHA256SUMS
