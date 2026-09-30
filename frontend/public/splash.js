/* Chippy splash. Runs before Angular. Does not draw until config.json answers. */
(function () {
  var splash = document.getElementById('splash');
  var canvas = document.getElementById('splash-canvas');
  if (!splash || !canvas) {
    return;
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var skipped = false;
  var logoReady = false;
  var started = 0;
  var frame = 0;

  function dismiss() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    splash.classList.add('splash-leave');
    window.setTimeout(function () {
      splash.remove();
    }, 280);
  }

  function maybeDismiss() {
    if (skipped || reduced) {
      dismiss();
      return;
    }
    if (logoReady && window.chippyReady) {
      dismiss();
    }
  }

  function skip() {
    skipped = true;
    maybeDismiss();
  }

  splash.addEventListener('click', skip);
  window.addEventListener('keydown', skip, { once: false });
  window.addEventListener('chippy-ready', maybeDismiss);

  function boot(enabled) {
    if (!enabled) {
      splash.remove();
      return;
    }
    splash.hidden = false;
    if (reduced) {
      drawWord(canvas.getContext('2d'), canvas.width, canvas.height, 1);
      window.addEventListener('chippy-ready', dismiss);
      if (window.chippyReady) {
        dismiss();
      }
      return;
    }
    started = performance.now();
    requestAnimationFrame(tick);
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  var drops = [];
  function seed() {
    drops = [];
    var columns = Math.max(8, Math.floor(canvas.width / 18));
    for (var i = 0; i < columns; i += 1) {
      drops.push({
        x: i * 18 + 8,
        y: Math.random() * canvas.height,
        speed: 3 + Math.random() * 8,
        char: String.fromCharCode(65 + Math.floor(Math.random() * 26)),
      });
    }
  }
  seed();

  function drawWord(context, width, height, alpha) {
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = '#ff4ad8';
    context.font = '700 92px "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.shadowColor = '#7af0ff';
    context.shadowBlur = 18;
    context.fillText('CHIPPY', width / 2, height / 2);
    context.restore();
  }

  function tick(now) {
    if (skipped) {
      return;
    }
    var context = canvas.getContext('2d');
    var elapsed = now - started;
    context.fillStyle = 'rgba(14, 8, 28, 0.28)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drops.forEach(function (drop) {
      context.fillStyle = Math.random() > 0.5 ? '#ff4ad8' : '#7af0ff';
      context.font = '16px ui-monospace, monospace';
      context.fillText(drop.char, drop.x, drop.y);
      drop.y += drop.speed;
      if (drop.y > canvas.height) {
        drop.y = 0;
        drop.char = String.fromCharCode(65 + Math.floor(Math.random() * 26));
      }
    });
    var settle = Math.min(1, Math.max(0, (elapsed - 1400) / 800));
    if (settle > 0) {
      drawWord(context, canvas.width, canvas.height, settle);
    }
    if (elapsed > 2200) {
      logoReady = true;
      maybeDismiss();
    }
    if (!splash.isConnected) {
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  fetch('config.json')
    .then(function (response) { return response.ok ? response.json() : { splashEnabled: true }; })
    .then(function (config) { boot(config.splashEnabled !== false); })
    .catch(function () { boot(true); });
})();
