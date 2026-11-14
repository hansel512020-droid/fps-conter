# Breach Point

FPS táctico por rondas en el navegador (Three.js). Dos equipos, atacantes y defensores,
se enfrentan en un mapa de tres carriles con dos sitios de bomba. Todo el contenido
(mapa, texturas, armas, personajes, sonido) se genera por código: no hay assets externos.

## Jugar

**En línea:** el repositorio incluye un flujo de GitHub Actions que publica el juego en
GitHub Pages en cada push a `main`. Para activarlo una sola vez:

1. En GitHub: *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
2. Espera a que termine el flujo *Deploy to GitHub Pages* (pestaña *Actions*).
3. El juego queda en `https://<usuario>.github.io/fps-conter/`.

**En local:**

```bash
npm install
npm run dev
```

y abre la dirección que muestra Vite (normalmente `http://localhost:5173`).

## Controles

| Tecla | Acción |
|---|---|
| `W A S D` | Moverse |
| `Shift` | Caminar (silencioso) |
| `Ctrl` / `C` | Agacharse |
| `Espacio` | Saltar |
| `Clic izquierdo` | Disparar |
| `R` | Recargar |
| `1` `2` `3` / rueda | Cambiar de arma |
| `Tab` | Marcador |
| `Esc` | Menú / pausa |

## Estructura

```
src/
  core/      bucle del juego, entrada, audio procedural
  world/     mapa por rejilla, colisiones, texturas procedurales
  entities/  personajes (movimiento, daño) y sus modelos
  weapons/   datos de armas, lógica de disparo, modelos 3D, arma en primera persona
  ai/        navegación A* y cerebro de los bots
  fx/        trazadoras, partículas, impactos
  ui/        HUD, radar, marcador, menú
```

## Hoja de ruta

- [x] Fase 1: base jugable (movimiento, armas, mapa, bots, rondas, HUD)
- [ ] Fase 2: bomba (plantar/desactivar), fase de compra y economía, granadas, más armas
- [ ] Fase 3: gráficos (post-procesado, más detalle de mapa), sonido y menús
- [ ] Fase 4: IA avanzada, segundo mapa, balance y rendimiento
