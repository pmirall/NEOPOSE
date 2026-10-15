<p align="center"><img src="build/icon.png" width="128" alt=""></p>

# NEOPOSE

Figura 3D para dibujar. Un maniquí de referencia con anatomía humana y anthro, poses, ropa, escenarios y luces, pensado para artistas.

- **Posado** por cinemática inversa (arrastra manos, pies y pelvis) o girando cada articulación; biblioteca de poses individuales y de grupo, poses al azar, manos y expresiones.
- **Cuerpo**: edad, género, musculatura, grasa, altura y estilización sobre la malla anatómica de MakeHuman; tipos de cuerpo de realista a chibi.
- **Anthro**: 13 especies, estilos realista, toony y kemono, nivel kemo (獣度) del 1 al 5 y cabezas esculpidas.
- **Ropa**: 470 prendas de la comunidad MakeHuman organizadas por carpetas, que se adaptan al cuerpo y a la pose.
- **Escenarios**: 24 decorados (salón, taberna, castillo, teatro, calle, bosque, playa…) con modelos de Poly Haven y luces propias con sombra.
- **Dibujo**: acabados de construcción, volumen, lápiz, valores y silueta; guías de tercios, fuga, regla de cabezas y línea de acción; capa de boceto con pinceles `.abr`.
- **Práctica de gesto** con temporizador y **exportación** a PNG (con fondo, transparente o solo trazo).

## Descargas

En [Releases](https://github.com/pmirall/NEOPOSE/releases):

| Sistema | Archivo | Cómo instalar |
|---|---|---|
| Windows | `NEOPOSE-x.y.z-setup.exe` | Instalador. |
| Windows | `NEOPOSE-x.y.z-portable.exe` | Sin instalar: ejecútalo y listo. |
| Linux | `NEOPOSE-x.y.z-x86_64.flatpak` | `flatpak install --user NEOPOSE-x.y.z-x86_64.flatpak` (necesita el remoto Flathub para el runtime). |
| Linux | `NEOPOSE-x.y.z-linux-x86_64.AppImage` | `chmod +x` y ejecutar. |

Los ejecutables no están firmados: Windows SmartScreen puede pedir «Más información → Ejecutar de todos modos».

## Desarrollo

Requisitos: Node 22 y Python 3.

```sh
npm install
npm start            # compila app/index.html y abre la app
npm run dist:linux   # Flatpak + AppImage en dist/ (necesita flatpak y flatpak-builder)
npm run dist:win     # instalador NSIS + portable en dist/
```

- `src/`: código de la app (módulos JS, HTML y CSS). `build.py` los une en `app/index.html`.
- `app/`: lo que se empaqueta: la página, three.js r147 y las fuentes (incluidos, funciona sin conexión), la figura, la ropa, las cabezas y los escenarios.
- `electron/main.js`: la ventana de escritorio. Sirve `app/` por un esquema privado `app://`.
- `tools/`: los procesos que generaron los datos (malla y ropa de MakeHuman, cabezas esculpidas, escenarios de Poly Haven). Necesitan los recursos originales y no hacen falta para compilar la app.

## Publicar una versión

1. Sube la versión en `package.json`.
2. `git tag v1.2.3 && git push origin v1.2.3`.
3. GitHub Actions compila Windows y Linux y adjunta los archivos a un **borrador** de release. Revísalo y pulsa «Publish release».

## Créditos

Ver [CREDITS.md](CREDITS.md).
