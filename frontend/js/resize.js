export function createResizer(canvas, ctx, game, hud, dpad) {
  function resize() {
    const hudH = hud.classList.contains("hidden") ? 0 : hud.getBoundingClientRect().height;
    const dpadVisible = !dpad.classList.contains("hidden") && getComputedStyle(dpad).display !== "none";
    const dpadH = dpadVisible ? dpad.getBoundingClientRect().height + 24 : 0;

    const availW = window.innerWidth * 0.94;
    const availH = (window.innerHeight - hudH - dpadH) * 0.94;
    const size = Math.max(200, Math.floor(Math.min(availW, availH)));

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    game.canvasCssSize = { width: size, height: size };
    if (game.level) game.cellPx = size / game.level.gridSize;
  }

  let resizeTimer = null;
  const debouncedResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 80);
  };

  window.addEventListener("resize", debouncedResize);
  window.addEventListener("orientationchange", resize);

  return resize;
}
