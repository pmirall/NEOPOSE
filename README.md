<p align="center"><img src="build/icon.png" width="128" alt=""></p>

# NEOPOSE

Figura 3D para dibujar. Un maniquí de referencia con anatomía humana y anthro, poses, ropa, escenarios y luces, pensado para artistas.

- **Posado** en modo IK (arrastra manos, pies y pelvis), modo FK (arrastra cualquier articulación y solo gira su hueso) o girando cada articulación con el aro; biblioteca de poses individuales y de grupo, poses al azar, manos y expresiones.
- **Cuerpo**: edad, género, musculatura, grasa, altura y estilización sobre la malla anatómica de MakeHuman; tipos de cuerpo de realista a chibi.
- **Anthro**: lobo, zorro, perro, conejo, cabra y dragón con cabezas esculpidas (realistas, toony y kemono), patas digitígradas o con pezuña, garras y cola.
- **Ropa**: 470 prendas de la comunidad MakeHuman organizadas por carpetas, que se adaptan al cuerpo y a la pose.
- **Escenarios**: 24 decorados (salón, taberna, castillo, teatro, calle, bosque, playa…) con modelos de Poly Haven y luces propias con sombra.
- **Dibujo**: acabados de construcción, volumen, lápiz, valores y silueta; guías de tercios, fuga, regla de cabezas y línea de acción; capa de boceto con pinceles `.abr`.
- **Tutorial interactivo** de 2 minutos al abrirla por primera vez (y desde el botón de ayuda).
- **Práctica de gesto** con temporizador y **exportación** a PNG (con fondo, transparente o solo trazo).

## Descargas

En [Releases](https://github.com/pmirall/NEOPOSE/releases):

| Sistema | Archivo | Cómo instalar |
|---|---|---|
| Windows | `NEOPOSE-x.y.z-setup.exe` | Instalador. |
| Windows | `NEOPOSE-x.y.z-portable.exe` | Sin instalar: ejecútalo y listo. |
| Linux | `NEOPOSE-x.y.z-x86_64.flatpak` | `flatpak install --user NEOPOSE-x.y.z-x86_64.flatpak` (necesita el remoto Flathub para el runtime). |
| Linux | `NEOPOSE-x.y.z-linux-x86_64.AppImage` | `chmod +x` y ejecutar. |
| Android 7+ | `NEOPOSE-x.y.z-android.apk` | Ábrela en el móvil y permite instalar desde esa fuente. |

Los ejecutables no están firmados: Windows SmartScreen puede pedir «Más información → Ejecutar de todos modos».

## Desarrollo

Requisitos: Node 22 y Python 3.

```sh
npm install
npm start            # compila app/index.html y abre la app
npm run dist:linux   # Flatpak + AppImage en dist/ (necesita flatpak y flatpak-builder)
npm run dist:win     # instalador NSIS + portable en dist/
npx cap sync android && (cd android && ./gradlew assembleRelease)   # APK (necesita JDK 21 y el SDK de Android)
```

- `src/`: código de la app (módulos JS, HTML y CSS). `build.py` los une en `app/index.html`.
- `app/`: lo que se empaqueta: la página, three.js r147 y las fuentes (incluidos, funciona sin conexión), la figura, la ropa, las cabezas y los escenarios.
- `electron/main.js`: la ventana de escritorio. Sirve `app/` por un esquema privado `app://`.
- `android/`: proyecto Android de [Capacitor](https://capacitorjs.com). `npx cap sync android` copia `app/` dentro.
- `flatpak/`: manifiesto de Flathub (compila desde el código, sin conexión), ficha AppStream y entrada de escritorio.
- `fdroid/` y `fastlane/`: receta y fichas para F-Droid.
- `tools/`: los procesos que generaron los datos (malla y ropa de MakeHuman, cabezas esculpidas, escenarios de Poly Haven). Necesitan los recursos originales y no hacen falta para compilar la app.

## Publicar una versión

1. Sube la versión en `package.json`, `versionName`/`versionCode` en `android/app/build.gradle` y añade la versión a `flatpak/io.github.pmirall.NEOPOSE.metainfo.xml` y un `fastlane/metadata/android/*/changelogs/<versionCode>.txt`.
2. Si cambió `package-lock.json`: `flatpak-node-generator npm package-lock.json -o flatpak/generated-sources.json`.
3. `git tag v1.2.3 && git push origin v1.2.3`.
4. GitHub Actions compila Windows, Linux y Android y adjunta los archivos a un **borrador** de release. Revísalo y pulsa «Publish release».
5. Flathub y F-Droid detectan el tag nuevo (F-Droid lo hace solo; en Flathub se actualiza el manifiesto en su repositorio `flathub/io.github.pmirall.NEOPOSE`).

La APK de GitHub se firma con la clave guardada en los secretos del repositorio (`NEOPOSE_KEYSTORE_*`). F-Droid compila y firma la suya.

## Tiendas

- **Flathub** (y con ello Bazaar, GNOME Software y KDE Discover): el manifiesto está en `flatpak/`. El flujo «Flathub check» comprueba que compila y pasa el linter de Flathub.
- **F-Droid**: la receta está en `fdroid/` y las fichas en `fastlane/`.

## Licencia

El código de NEOPOSE es software libre bajo la [GNU GPL v3 o posterior](LICENSE): puedes usarlo, estudiarlo, modificarlo y redistribuirlo, siempre que las versiones derivadas sigan siendo libres con la misma licencia.

Los recursos de terceros (malla, ropa, escenarios, cabezas, fuentes y librerías) mantienen sus propias licencias libres: ver [CREDITS.md](CREDITS.md).
