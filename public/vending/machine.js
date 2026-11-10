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
  let selectedProduct = 'reality_check';
  let working = false;
  let lastArtifact = null;
  let toastTimer;

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
      screen.textContent = `02 — ${productNames[id]} LOADED. PULL WHEN READY.`;
      tinySound(280, .045);
    }
  }

  products.forEach(button => button.addEventListener('click', () => selectProduct(button.dataset.product)));

  input.addEventListener('input', () => {
    const length = input.value.length;
    count.textContent = `${String(length).padStart(4, '0')} / 1200`;
    meter.style.width = `${Math.max(2, length / 12)}%`;
    if (length > 1) screen.textContent = `01 — TOKEN ACCEPTED. ${productNames[selectedProduct]} IS STANDING BY.`;
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
    screen.textContent = '03 — TUMBLERS TURNING · PROFILE ENGAGED…';
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

  lever.addEventListener('click', dispense);
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
    document.querySelector('#artifactProfile').textContent = `PROFILE ${data.profileBasis?.label || data.profileVersion}`;
    document.querySelector('#artifactPrompt').textContent = `BEHAVIOR ${data.promptVersion}`;
  }

  function openArtifact() {
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
      signal.textContent = status.personalized ? ' RÉSUMÉ + PORTFOLIO PROFILE ACTIVE' : ' SAFE BASELINE MODE';
      signal.prepend(document.createElement('i'));
      signal.classList.toggle('personal', status.personalized);
    })
    .catch(() => { document.querySelector('#profileSignal').lastChild.textContent = ' OFFLINE'; });
})();
