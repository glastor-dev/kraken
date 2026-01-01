Changelog

Todos los cambios relevantes de **kraken** se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) y el versionado sigue
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-01

### Added

- App web (Vite + React + TypeScript) para **optimización y conversión de imágenes** en el navegador.
- Procesamiento en lote (batch): carga múltiple, estado por imagen, y descarga en ZIP.
- Conversión de formato de salida (p. ej. WebP/AVIF) y control de calidad.
- Redimensionado previo para respetar límites de dimensiones (`maxWidth` / `maxHeight`).
- Vista previa por imagen y métricas de ahorro (tamaño original vs optimizado).
- Configuración de despliegue para Vercel (SPA + Functions).
- Automatización del repositorio: CI, CodeQL y Dependabot.

### Security

- Renombrado sugerido por IA (opcional) implementado vía endpoint serverless: `/api/suggest-name`.
- La variable `GEMINI_API_KEY` se mantiene **del lado servidor** (Vercel Functions) para evitar exponer secretos en el frontend.

[Unreleased]: https://github.com/glastor-dev/kraken/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/glastor-dev/kraken/releases/tag/v1.0.0
