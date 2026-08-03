/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Canvas renderers for each hip hop era. Pure functions: (ctx, dims, palette,
 * layout) -> draws to ctx. No state, no randomness at draw time — all
 * randomness already resolved by the agent pipeline before this runs.
 */

import { HipHopEra, PaletteResult, LayoutResult } from './coverArtAgents';

export function drawEraBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  era: HipHopEra,
  palette: PaletteResult,
  layout: LayoutResult
): void {
  switch (era) {
    case 'boom_bap':
      drawBoomBap(ctx, width, height, palette, layout);
      break;
    case 'golden_era':
      drawGoldenEra(ctx, width, height, palette, layout);
      break;
    case 'trap':
      drawTrap(ctx, width, height, palette, layout);
      break;
    case 'drill':
      drawDrill(ctx, width, height, palette, layout);
      break;
    case 'g_funk':
      drawGFunk(ctx, width, height, palette, layout);
      break;
    case 'vinyl_press':
      drawVinylPress(ctx, width, height, palette, layout);
      break;
    default:
      drawBoomBap(ctx, width, height, palette, layout);
      break;
  }
}

function baseGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  angle: 'diag' | 'vertical' | 'radial'
) {
  if (angle === 'radial') {
    const grad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, width * 0.75);
    grad.addColorStop(0, palette.bg[0]);
    grad.addColorStop(0.6, palette.bg[1]);
    grad.addColorStop(1, palette.bg[2]);
    return grad;
  }
  const grad =
    angle === 'diag'
      ? ctx.createLinearGradient(0, 0, width, height)
      : ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, palette.bg[0]);
  grad.addColorStop(0.5, palette.bg[1]);
  grad.addColorStop(1, palette.bg[2]);
  return grad;
}

/** Dusty paper grain via deterministic dot pattern (no Math.random at draw time). */
function drawHalftoneGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  density: number
) {
  ctx.save();
  ctx.globalAlpha = 0.05 + density * 0.05;
  ctx.fillStyle = color;
  const step = 6;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      // Deterministic pseudo-scatter based on position, not RNG — keeps this
      // module pure/stateless while still looking organic.
      const jitter = ((x * 13 + y * 7) % step) - step / 2;
      ctx.beginPath();
      ctx.arc(x + jitter * 0.3, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBoomBap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  layout: LayoutResult
) {
  ctx.fillStyle = baseGradient(ctx, width, height, palette, 'vertical');
  ctx.fillRect(0, 0, width, height);
  drawHalftoneGrain(ctx, width, height, palette.text, layout.textureDensity);

  // Boxy inner border, boom bap sleeve style
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, width - 36, height - 36);
  ctx.strokeStyle = palette.accentAlt;
  ctx.lineWidth = 1;
  ctx.strokeRect(26, 26, width - 52, height - 52);
}

function drawGoldenEra(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  layout: LayoutResult
) {
  ctx.fillStyle = baseGradient(ctx, width, height, palette, 'radial');
  ctx.fillRect(0, 0, width, height);
  drawHalftoneGrain(ctx, width, height, palette.accent, layout.textureDensity * 0.6);

  // Film-grain vignette
  ctx.save();
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.3, width / 2, height / 2, width * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawTrap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  layout: LayoutResult
) {
  ctx.fillStyle = baseGradient(ctx, width, height, palette, 'diag');
  ctx.fillRect(0, 0, width, height);

  // Glossy chrome sheen streak
  ctx.save();
  ctx.rotate((layout.rotationDeg * Math.PI) / 180);
  const sheen = ctx.createLinearGradient(0, 0, width, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.5, `${palette.accent}33`);
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-50, height * 0.3, width + 100, 60);
  ctx.restore();

  // Glow orb
  const glow = ctx.createRadialGradient(width * 0.7, height * 0.25, 10, width * 0.7, height * 0.25, 260);
  glow.addColorStop(0, `${palette.accent}55`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

function drawDrill(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  layout: LayoutResult
) {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // High-contrast diagonal slashes
  ctx.save();
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 3;
  const slashCount = Math.round(6 + layout.textureDensity * 10);
  for (let i = 0; i < slashCount; i++) {
    const x = (i / slashCount) * width * 1.4 - width * 0.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x - height * 0.5, height);
    ctx.globalAlpha = i % 2 === 0 ? 0.5 : 0.2;
    ctx.strokeStyle = i % 3 === 0 ? palette.accentAlt : palette.accent;
    ctx.stroke();
  }
  ctx.restore();

  // Heavy vignette for cold, harsh mood
  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.8);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function drawGFunk(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  layout: LayoutResult
) {
  // Sunset gradient
  const sunset = ctx.createLinearGradient(0, 0, 0, height);
  sunset.addColorStop(0, palette.bg[0]);
  sunset.addColorStop(0.55, palette.accentAlt);
  sunset.addColorStop(1, palette.bg[2]);
  ctx.fillStyle = sunset;
  ctx.fillRect(0, 0, width, height);

  // Sun disc
  ctx.save();
  const sunGrad = ctx.createRadialGradient(width / 2, height * 0.55, 10, width / 2, height * 0.55, 160);
  sunGrad.addColorStop(0, palette.accent);
  sunGrad.addColorStop(1, `${palette.accent}00`);
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(width / 2, height * 0.55, 160, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bottom silhouette bar
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, height * 0.8, width, height * 0.2);
  ctx.globalAlpha = 1;
  void layout;
}

function drawVinylPress(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: PaletteResult,
  layout: LayoutResult
) {
  ctx.fillStyle = baseGradient(ctx, width, height, palette, 'vertical');
  ctx.fillRect(0, 0, width, height);
  drawHalftoneGrain(ctx, width, height, palette.text, layout.textureDensity * 0.4);

  // Record grooves, centered
  ctx.save();
  ctx.strokeStyle = `${palette.text}12`;
  ctx.lineWidth = 1;
  for (let r = 40; r < width * 0.65; r += 10) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Label disc
  ctx.fillStyle = palette.accentAlt;
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.bg[2];
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
