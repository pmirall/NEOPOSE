# Créditos y licencias de terceros

## Cuerpo y ropa: MakeHuman (CC0 1.0)
Malla base, esqueleto, objetivos de forma y las 470 prendas proceden de [MakeHuman](http://www.makehumancommunity.org/) y de los recursos de su comunidad, publicados en dominio público (CC0). Ver `tools/makehuman/LICENSE.ASSETS.md`.

Los 10 peinados, el envejecimiento (hasta 90 años) y las expresiones faciales humanas también son recursos de sistema de MakeHuman (CC0): `tools/makehuman/build_hair.py` y `build_ext.py`.

Peinados de la comunidad de MakeHuman (packs de recursos *hair01*, *hair02* y *hair03*, convertidos con `tools/makehuman/build_hair.py`):
- CC0 1.0: «Corto texturizado» y «Pixie» (Culturalibre), «Bob con flequillo» (Margaret Toigo), «Liso con flequillo» (Cortu), «Larga a capas» (o4saken), «Moño» (RehmanPolanski), «Dos trenzas» y «Moño trenzado» (Elvaerwyn).
- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): «Tupé», «Pompadour», «Rizado corto», «Larga ondulada», «Ochentero», «Recogido», «Trenzas pegadas» y «Moños afro» de **Elvaerwyn**; «Coleta de lado» y «Larga voluminosa» de **Culturalibre**. Las texturas de «Dos trenzas» y «Moño trenzado» se han pasado a grises neutros para poder teñirlas.

Las complexiones y los ajustes avanzados del cuerpo (grasa y músculo por zonas, proporciones, longitudes y formas corporales) usan los objetivos de modelado de MakeHuman (CC0), horneados con `tools/makehuman/build_body.py` en `app/figure-body.txt`.

## Esqueleto: BodyParts3D (CC BY 4.0)
Los huesos del modo de construcción «Esqueleto» proceden de [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/), © The Database Center for Life Science, bajo licencia [Creative Commons Atribución 4.0 Internacional](https://creativecommons.org/licenses/by/4.0/). Se han simplificado y ajustado a la figura con `tools/anatomy/build_skeleton.py`.

## Escenarios: Poly Haven (CC0 1.0)
Modelos y texturas de [Poly Haven](https://polyhaven.com), en dominio público. Se han simplificado y reempaquetado (solo textura de color, WebP 512 px).

Los 8 panoramas 360° («Panoramas 360°») son HDRI de Poly Haven (CC0) en su versión tonemapeada, reducidos a 3072×1536 con `tools/scenery/hdri.py`.

## Animaciones: Universal Animation Library de Quaternius (CC0 1.0)
[Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) y [Universal Animation Library 2](https://quaternius.com/packs/universalanimationlibrary2.html) (versión Standard), de [Quaternius](https://quaternius.com): 84 animaciones de la galería. Pasadas al esqueleto de NEOPOSE con `tools/anims/build_ual.js` (solo se guardan las poses, no los modelos) en `app/anims/ual.txt`. Licencia: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); el crédito es cortesía, no obligación.

## Pose desde una foto: TensorFlow.js y BlazePose (Apache 2.0)
[TensorFlow.js](https://github.com/tensorflow/tfjs) 4.22 y `@tensorflow-models/pose-detection` 2.1.3, con los modelos BlazePose GHUM 3D de [MediaPipe](https://developers.google.com/mediapipe) (detector y landmark «full»), © Google LLC, licencia Apache 2.0. Se cargan solo al usar la función y la foto se analiza en el dispositivo. Copiados con `tools/pose/fetch.sh`; aviso en `app/vendor/pose/LICENSE.txt`.

## Software
- [three.js](https://threejs.org) r147: MIT (`app/vendor/LICENSE-three.txt`).
- [meshoptimizer](https://github.com/zeux/meshoptimizer) (decodificador y gltfpack): MIT.
- [fflate](https://github.com/101arrowz/fflate) (ZIP y compresión): MIT.
- [gifenc](https://github.com/mattdesl/gifenc) 1.0.3 (GIF animado): MIT (`app/vendor/LICENSE-gifenc.txt`).
- [NSFWJS](https://github.com/infinitered/nsfwjs) 4.4.0 (filtro de contenido de las referencias, modelo MobileNetV2): MIT (`app/vendor/nsfw/LICENSE-nsfwjs.txt`). TensorFlow.js Layers 4.22: Apache 2.0.
- [omggif](https://github.com/deanm/omggif) 1.0.10 (lectura de GIF animados donde no hay WebCodecs, como en iOS): MIT (aviso en `app/vendor/omggif.js`).
- [eSpeak NG](https://github.com/espeak-ng/espeak-ng) (voces de los personajes; compilación Emscripten de [Echogarden](https://github.com/echogarden-project/espeak-ng-emscripten), reducida a los siete idiomas de la app): GPL-3.0 (`app/vendor/espeak/COPYING`).
- [Electron](https://www.electronjs.org) y [electron-builder](https://www.electron.build): MIT.

## Fuentes tipográficas (SIL Open Font License 1.1)
Kalam, Karla, Courier Prime, Comic Neue (rotulación de los bocadillos) y Bangers (onomatopeyas), incluidas en `app/fonts/` con sus licencias `OFL-*.txt`.

## Referencias libres (búsqueda en línea)
Las búsquedas se hacen desde el dispositivo, sin cuenta ni clave, en [Openverse](https://openverse.org) (imágenes CC y de dominio público de Flickr, Wikimedia, el Smithsonian y otros museos), [Wikimedia Commons](https://commons.wikimedia.org) y la API de [Poly Haven](https://polyhaven.com) (panoramas y modelos CC0; «Powered by Poly Haven»). Solo se muestran licencias que permiten adaptar (CC0, dominio público, CC BY, CC BY-SA, GFDL), con título, autoría, fuente y licencia junto a cada imagen y a lo que se hace con ella.
