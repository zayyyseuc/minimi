(() => {
  const machine = document.querySelector('.vending-machine');
  const input = document.querySelector('#thoughtInput');
  const products = [...document.querySelectorAll('.product')];
  const lever = document.querySelector('#lever');
  const surprise = document.querySelector('#surpriseButton');
  const count = document.querySelector('#charCount');
  const meter = document.querySelector('#meterFill');
  const screen = document.querySelector('#screenMessage');
  const overlay = document.querySelector('#artifactOverlay');
  const artifact = document.querySelector('#artifact');
  const toast = document.querySelector('#toast');
  const parallaxShell = document.querySelector('.machine-parallax-shell');
  let selectedProduct = 'reality_check';
  let working = false;
  let lastArtifact = null;
  let toastTimer;
  let pullFeedbackAnimation;

  function triggerPullFeedback() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    if (typeof machine.animate === 'function') {
      pullFeedbackAnimation?.cancel();
      pullFeedbackAnimation = machine.animate([
        { translate: '0 0' },
        { translate: '-4px 1px', offset: .18 },
        { translate: '4px -1px', offset: .38 },
        { translate: '-3px 1px', offset: .58 },
        { translate: '2px 0', offset: .78 },
        { translate: '0 0' },
      ], {
        duration: 260,
        easing: 'linear',
      });
      pullFeedbackAnimation.addEventListener('finish', () => { pullFeedbackAnimation = null; }, { once: true });
    }

    try { navigator.vibrate?.([18, 22, 26]); } catch {}
  }

  function setupParallax() {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!parallaxShell || !finePointer.matches || reducedMotion.matches) return () => {};

    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let frame = 0;

    function applyFrame() {
      current.x += (target.x - current.x) * .085;
      current.y += (target.y - current.y) * .085;

      const x = Math.abs(current.x) < .0005 ? 0 : current.x;
      const y = Math.abs(current.y) < .0005 ? 0 : current.y;
      parallaxShell.style.setProperty('--tilt-x', `${(-y * 3).toFixed(3)}deg`);
      parallaxShell.style.setProperty('--tilt-y', `${(x * 3).toFixed(3)}deg`);
      parallaxShell.style.setProperty('--glass-x', `${(x * 1.1).toFixed(2)}px`);
      parallaxShell.style.setProperty('--glass-y', `${(y * .8).toFixed(2)}px`);
      parallaxShell.style.setProperty('--products-x', `${(x * 3.1).toFixed(2)}px`);
      parallaxShell.style.setProperty('--products-y', `${(y * 2.4).toFixed(2)}px`);
      parallaxShell.style.setProperty('--console-x', `${(x * 1.7).toFixed(2)}px`);
      parallaxShell.style.setProperty('--console-y', `${(y * 1.3).toFixed(2)}px`);
      parallaxShell.style.setProperty('--reflection-x', `${(x * 72).toFixed(1)}px`);
      parallaxShell.style.setProperty('--reflection-y', `${(y * 28).toFixed(1)}px`);
      parallaxShell.style.setProperty('--shadow-x', `${(-x * 4).toFixed(2)}px`);
      parallaxShell.style.setProperty('--shadow-y', `${(y * 3).toFixed(2)}px`);
      document.documentElement.style.setProperty('--parallax-bg-x', `${(-x * 1.6).toFixed(2)}px`);
      document.documentElement.style.setProperty('--parallax-bg-y', `${(-y * 1.6).toFixed(2)}px`);

      const settled = Math.abs(target.x - current.x) < .0005 && Math.abs(target.y - current.y) < .0005;
      if (!settled) frame = requestAnimationFrame(applyFrame);
      else {
        frame = 0;
        parallaxShell.classList.remove('is-parallax-active');
      }
    }

    function startFrame() {
      parallaxShell.classList.add('is-parallax-active');
      if (!frame) frame = requestAnimationFrame(applyFrame);
    }

    function onPointerMove(event) {
      const rect = parallaxShell.getBoundingClientRect();
      target.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      target.y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      startFrame();
    }

    function returnToNeutral() {
      target.x = 0;
      target.y = 0;
      startFrame();
    }

    parallaxShell.addEventListener('pointermove', onPointerMove, { passive: true });
    parallaxShell.addEventListener('pointerleave', returnToNeutral, { passive: true });
    parallaxShell.addEventListener('pointercancel', returnToNeutral, { passive: true });
    window.addEventListener('blur', returnToNeutral);
    document.addEventListener('visibilitychange', () => { if (document.hidden) returnToNeutral(); });
    return returnToNeutral;
  }

  const resetParallax = setupParallax();

  const productNames = {
    reality_check: 'A–01 · REALITY CHECK',
    unexpected_connection: 'B–02 · UNEXPECTED CONNECTION',
    wild_card: 'C–?? · WILD CARD',
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function tinySound(frequency = 210, duration = .05) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'square';
      gain.gain.setValueAtTime(.025, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
    } catch {}
  }

  function selectProduct(id, announce = true) {
    selectedProduct = id;
    products.forEach(button => {
      const active = button.dataset.product === id;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-checked', String(active));
    });
    if (announce) {
      screen.textContent = `02 — ${productNames[id]} READY.`;
      tinySound(280, .045);
    }
  }

  products.forEach(button => button.addEventListener('click', () => selectProduct(button.dataset.product)));

  input.addEventListener('input', () => {
    const length = input.value.length;
    count.textContent = `${String(length).padStart(4, '0')} / 1200`;
    meter.style.width = `${Math.max(2, length / 12)}%`;
    if (length > 1) screen.textContent = `01 — ${productNames[selectedProduct]} READY.`;
  });

  surprise.addEventListener('click', () => {
    const options = Object.keys(productNames).filter(item => item !== selectedProduct);
    selectProduct(options[Math.floor(Math.random() * options.length)]);
    surprise.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0)' }], { duration: 300 });
  });

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  async function dispense() {
    if (working) return;
    const thought = input.value.trim();
    if (thought.length < 2) {
      screen.textContent = 'ERROR 01 — THE MACHINE CANNOT VEND EMPTY AIR.';
      input.focus();
      showToast('INSERT A THOUGHT FIRST');
      tinySound(95, .12);
      return;
    }

    working = true;
    lever.disabled = true;
    machine.classList.add('working');
    screen.textContent = '03 — PROCESSING…';
    tinySound(120, .09);
    const started = Date.now();

    try {
      const response = await fetch('/api/vending/dispense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: thought, product: selectedProduct }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The machine jammed.');
      await wait(Math.max(0, 1900 - (Date.now() - started)));
      lastArtifact = data;
      screen.textContent = data.privacyRecall ? 'PRIVACY SENSOR — BATCH SAFELY RECALLED.' : '04 — OBJECT READY. LIFT THE COLLECTION DOOR.';
      renderArtifact(data);
      tinySound(420, .12);
      await wait(250);
      openArtifact();
    } catch (error) {
      screen.textContent = `JAM 05 — ${error.message}`;
      showToast(error.message.toUpperCase());
      tinySound(82, .18);
    } finally {
      working = false;
      lever.disabled = false;
      setTimeout(() => machine.classList.remove('working'), 450);
    }
  }

  lever.addEventListener('click', () => {
    triggerPullFeedback();
    dispense();
  });
  input.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') dispense();
  });

  function renderArtifact(data) {
    artifact.className = `artifact ${data.format || ''}`;
    document.querySelector('#artifactLabel').textContent = data.productLabel;
    document.querySelector('#artifactSerial').textContent = data.serial;
    document.querySelector('#artifactTitle').textContent = data.title;
    document.querySelector('#artifactMessage').textContent = data.message;
    const trace = document.querySelector('#artifactTrace');
    const traceItems = Array.isArray(data.behavioralTrace) ? data.behavioralTrace : [];
    trace.hidden = traceItems.length === 0;
    trace.innerHTML = '';
    traceItems.forEach(item => {
      const chip = document.createElement('span');
      chip.textContent = item.label;
      trace.appendChild(chip);
    });
    const facts = document.querySelector('#artifactFacts');
    const factItems = Array.isArray(data.factTrace) ? data.factTrace : [];
    facts.hidden = factItems.length === 0;
    facts.innerHTML = '';
    factItems.forEach(item => {
      const chip = document.createElement('a');
      chip.textContent = item.label;
      chip.href = item.url || 'https://zayyyseuc.github.io/portfolio/';
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      facts.appendChild(chip);
    });
  }

  function openArtifact() {
    resetParallax();
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => document.querySelector('.artifact-close').focus());
  }

  function closeArtifact() {
    overlay.hidden = true;
    document.body.style.overflow = '';
    lever.focus();
  }

  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', closeArtifact));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !overlay.hidden) closeArtifact(); });

  document.querySelector('#copyButton').addEventListener('click', async () => {
    if (!lastArtifact) return;
    await navigator.clipboard.writeText(`${lastArtifact.title}\n\n${lastArtifact.message}\n\n${lastArtifact.productLabel} · ${lastArtifact.serial}`);
    showToast('OBJECT COPIED');
  });

  document.querySelector('#saveButton').addEventListener('click', () => {
    if (!lastArtifact) return;
    const text = `${lastArtifact.title}\n\n${lastArtifact.message}\n\n${lastArtifact.productLabel} · ${lastArtifact.serial}\nProfile: ${lastArtifact.profileVersion}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${lastArtifact.serial}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('OBJECT SAVED');
  });

  document.querySelector('#againButton').addEventListener('click', () => {
    closeArtifact();
    input.select();
    screen.textContent = '01 — INSERT ANOTHER THOUGHT OR PULL AGAIN.';
  });

  fetch('/api/vending/status')
    .then(response => response.json())
    .then(status => {
      const signal = document.querySelector('#profileSignal');
      signal.textContent = status.personalized ? ' PROFILE ACTIVE' : ' BASELINE MODE';
      signal.prepend(document.createElement('i'));
      signal.classList.toggle('personal', status.personalized);
    })
    .catch(() => { document.querySelector('#profileSignal').lastChild.textContent = ' OFFLINE'; });
})();
