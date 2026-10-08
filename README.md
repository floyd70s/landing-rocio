# Landing · Abogada Rocío Zacconi

Sitio público de Rocío. **Es un sistema independiente de SGA** (el sistema de administración): tiene su propia carpeta, su propio despliegue y su propio diseño. Lo único que comparten es la **toma de horas**:

```
 Visitante ──► Landing (estático) ──fetch──► API pública de SGA ──► Agenda de SGA
                                             /api/public/reserva/*     (la abogada administra
                                                                        horarios, bloqueos, citas,
                                                                        pagos y clientes)
```

- La landing **no tiene base de datos ni lógica de negocio**. Pide a SGA los días/horas libres, el texto y costo de la asesoría, y le envía las reservas.
- Todo lo que se administra (horario de atención, días bloqueados, costo, citas, pago recibido, convertir en cliente) se hace **en SGA → Agenda / Configuración**. Si cambias algo allí, la landing lo refleja sola.
- Los textos de la landing (áreas, pasos, bio) están en `index.html` y se editan directamente.

## Ejecutar en local

```bash
# 1) SGA (puerto 3100)
cd ../SGA && npm start
# 2) Landing (puerto 4000)
cd ../landing-rocio && npm start      # http://localhost:4000
```

No hay `npm install`: la landing es HTML/CSS/JS estático (`serve.js` es solo un servidor de archivos de ayuda).

## Configuración

| Dónde | Qué |
|---|---|
| `js/config.js` → `API_URL` | Dirección de la API de SGA, p. ej. `https://sga.rociozacconi.cl/api` |
| SGA `.env` → `LANDING_ORIGINS` | Orígenes de la landing autorizados (CORS), p. ej. `https://www.rociozacconi.cl` |
| SGA `.env` → `LANDING_URL` | Si se define, `https://sga…/reservar` redirige a la landing |
| `serve.js` → `API_ORIGIN` (env) | Origen de SGA para la política de seguridad (CSP) si usas `serve.js` en producción |

SGA solo acepta llamadas desde otros orígenes en `/api/public/reserva/*` (consultar horas, reservar, consultar y reprogramar con código). El resto de su API sigue siendo exclusiva de SGA.

## Publicar

Es 100 % estática: sirve la carpeta tal cual en Netlify, Cloudflare Pages, S3 + CDN, nginx… o con Docker (`docker build -t landing-rocio . && docker run -p 4000:4000 -e API_ORIGIN=https://sga.rociozacconi.cl landing-rocio`). Antes de publicar: cambia `API_URL`, configura `LANDING_ORIGINS` en SGA y usa HTTPS en ambos.

## Datos que conviene completar

- Fotografía y breve presentación de Rocío (hoy la landing usa solo el logo y la identidad visual).
- Teléfono/WhatsApp de contacto (se muestra el de soporte configurado en SGA, ajuste `reserva_soporte_tel`).
- Dominio, y textos legales (política de privacidad) si se van a publicar.

## Identidad visual

Paleta lila + beige + dorado rosado, Cormorant Garamond y Jost (autoalojadas en `fonts/`). Origen: `identidad_visual_rocio.html`.
