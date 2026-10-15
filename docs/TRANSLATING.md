# Traducir NEOPOSE

Los textos de la interfaz están en `src/i18n/<idioma>.json`: un objeto JSON plano por idioma. La **clave es el texto original en español** (como en gettext) y el valor, su traducción. Si falta una cadena, la aplicación muestra la inglesa y, si tampoco está, la española; nunca se rompe.

- `es.json` es el archivo base (cada clave apunta a sí misma, sin el sufijo `@contexto`).
- `en.json` es donde se añaden las cadenas nuevas al programar.
- `python3 tools/i18n_sync.py` regenera `es.json` y quita de los demás idiomas las cadenas que ya no existen; muestra el porcentaje traducido de cada uno.
- `python3 tools/i18n_check.py <idioma>` comprueba que cada traducción conserva los `{marcadores}`, las etiquetas HTML y los espacios de los extremos.
- Una clave como `Escalar@objeto` es la misma palabra con un contexto: se traduce solo la palabra.

## Añadir un idioma

Basta con crear `src/i18n/<código>.json` (por ejemplo `nl.json`, con `{}` dentro) y traducir. El selector de idioma lo ofrece solo, con el nombre del idioma escrito en ese idioma. Si la traducción es automática, añade su código a `LANGS_MACHINE` en `src/00-i18n.js` para que la ayuda lo indique, y quítalo cuando alguien la revise.

## Weblate

Configuración del componente:

| Campo | Valor |
|---|---|
| Formato de archivo | JSON file |
| Máscara de archivos | `src/i18n/*.json` |
| Archivo base monolingüe | `src/i18n/es.json` |
| Plantilla para traducciones nuevas | `src/i18n/es.json` |
| Idioma de origen | Español |
| Filtro de idioma | `^(?!es$|en$).*` si el inglés se mantiene en el repositorio, o vacío para traducir también el inglés en Weblate |

Catalán, francés, portugués, alemán e italiano empezaron como traducción automática y esperan revisión.

## Títulos de las prendas

Los 467 títulos del armario son los nombres en inglés que les dieron sus autores en la comunidad MakeHuman. Sus traducciones están en `src/i18n/garments/<idioma>.json` (clave = título original). En Weblate es un segundo componente: formato «JSON file», máscara `src/i18n/garments/*.json`, archivo base `src/i18n/garments/en.json`, idioma de origen inglés. La búsqueda del armario encuentra una prenda tanto por su título traducido como por el original.
