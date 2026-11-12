(() => {
  const machine = document.querySelector('.vending-machine');
  const input = document.querySelector('#thoughtInput');
  const products = [...document.querySelectorAll('.product')];
  const productGrid = document.querySelector('.product-grid');
  const lever = document.querySelector('#lever');
  const surprise = document.querySelector('#surpriseButton');
  const count = document.querySelector('#charCount');
  const meter = document.querySelector('#meterFill');
  const screen = document.querySelector('#screenMessage');
  const overlay = document.querySelector('#artifactOverlay');
  const artifact = document.querySelector('#artifact');
  const toast = document.querySelector('#toast');
  const parallaxShell = document.querySelector('.machine-parallax-shell');
  const calibrationPanel = document.querySelector('#calibrationPanel');
  const calibrationStep = document.querySelector('#calibrationStep');
  const calibrationText = document.querySelector('#calibrationText');
  const calibrationOptions = document.querySelector('#calibrationOptions');
  const calibrationReply = document.querySelector('#calibrationReply');
  const calibrationReplyLabel = document.querySelector('#calibrationReplyLabel');
  const calibrationSecondary = document.querySelector('#calibrationSecondary');
  const calibrationContinue = document.querySelector('#calibrationContinue');
  const leverLabel = document.querySelector('#leverLabel');
  const agentLogEl = document.querySelector('#agentLog');
  const draftBox = document.querySelector('#calibrationDraft');
  const draftTitle = document.querySelector('#calibrationDraftTitle');
  const draftBody = document.querySelector('#calibrationDraftBody');
  const keepButton = document.querySelector('#calibrationKeep');
  let selectedProduct = 'reality_check';
  let working = false;
  let conversationPhase = 'idle';
  let stateToken = '';
  let confirmationStage = 'plan';
  let lastArtifact = null;
  let toastTimer;
  let pullFeedbackAnimation;
  let modeAnimating = false;
  let typingRun = 0;
  const lastPrompt = {};

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

  const surprisePrompts = {
    reality_check: [
      'Which project contains the most fragile assumption?',
      'What part of my portfolio looks convincing but still lacks evidence?',
      'Which project has the weakest complete interaction loop?',
      'What should I test before developing one of these projects further?',
      'Where does my design process confuse a polished prototype with validation?',
      'Which recurring idea in my work is most likely to fail in the real world?',
    ],
    unexpected_connection: [
      'What does my design practice have in common with ecology?',
      'Connect one of my projects to a scientific concept I did not mention.',
      'What can my portfolio learn from the way animals combine imperfect senses?',
      'Connect my visual language to the structure of a technical field manual.',
      'What does spatial memory reveal about one of my interaction systems?',
      'Find a defensible connection between two projects that seem unrelated.',
    ],
    wild_card: [
      'Combine two of my projects into a product that should not exist.',
      'Redesign one project without screens, menus, or text.',
      'Turn one project into a five-minute public experiment.',
      'Reverse the roles of the user and the system in one of my projects.',
      'Give one project a strange constraint that makes its purpose clearer.',
      'Invent a sixth project using the smallest useful parts of the existing five.',
    ],
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
    if (announce && conversationPhase === 'idle') {
      screen.textContent = `02 — ${productNames[id]} READY.`;
      tinySound(280, .045);
    }
  }

  function syncInputState() {
    const length = input.value.length;
    count.textContent = `${String(length).padStart(4, '0')} / 1200`;
    meter.style.width = `${Math.max(2, length / 12)}%`;
    if (length > 1 && conversationPhase === 'idle') screen.textContent = `01 — ${productNames[selectedProduct]} READY.`;
  }

  function setModeControlsDisabled(disabled) {
    products.forEach(button => { button.disabled = disabled; });
    surprise.disabled = disabled;
    productGrid.setAttribute('aria-busy', String(disabled));
  }

  function reelDelay(step, total, surpriseRun) {
    const progress = step / Math.max(1, total - 1);
    return Math.round((surpriseRun ? 48 : 42) + Math.pow(progress, 2.15) * (surpriseRun ? 150 : 105));
  }

  async function spinToProduct(target, { surpriseRun = false } = {}) {
    if (working || modeAnimating) return false;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      selectProduct(target);
      return true;
    }

    modeAnimating = true;
    setModeControlsDisabled(true);
    machine.classList.add('mode-spinning');
    surprise.classList.toggle('is-spinning', surpriseRun);
    screen.textContent = surpriseRun ? '02 — SHUFFLING MODE…' : '02 — SELECTING MODE…';

    const ids = Object.keys(productNames);
    const start = ids.indexOf(selectedProduct);
    const total = surpriseRun ? 13 : 8;

    for (let step = 0; step < total; step += 1) {
      const id = step === total - 1 ? target : ids[(start + step + 1) % ids.length];
      products.forEach(button => button.classList.toggle('reel-highlight', button.dataset.product === id));
      tinySound(185 + (ids.indexOf(id) * 65), .025);
      await wait(reelDelay(step, total, surpriseRun));
    }

    products.forEach(button => button.classList.remove('reel-highlight'));
    machine.classList.remove('mode-spinning');
    surprise.classList.remove('is-spinning');
    selectProduct(target);
    setModeControlsDisabled(false);
    modeAnimating = false;
    return true;
  }

  function pickSurprisePrompt(product) {
    const prompts = surprisePrompts[product];
    const options = prompts.filter(prompt => prompt !== lastPrompt[product]);
    const prompt = options[Math.floor(Math.random() * options.length)];
    lastPrompt[product] = prompt;
    return prompt;
  }

  async function typePrompt(text) {
    const run = ++typingRun;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.value = '';
    syncInputState();
    input.focus();

    if (reducedMotion) {
      input.value = text;
      syncInputState();
      return;
    }

    for (let index = 0; index < text.length; index += 1) {
      if (run !== typingRun) return;
      input.value += text[index];
      syncInputState();
      await wait(index % 4 === 0 ? 18 : 10);
    }
  }

  products.forEach(button => button.addEventListener('click', () => spinToProduct(button.dataset.product)));

  input.addEventListener('input', syncInputState);
  input.addEventListener('keydown', () => { typingRun += 1; });
  input.addEventListener('pointerdown', () => { typingRun += 1; }, { passive: true });

  surprise.addEventListener('click', async () => {
    const options = Object.keys(productNames).filter(item => item !== selectedProduct);
    const target = options[Math.floor(Math.random() * options.length)];
    const selected = await spinToProduct(target, { surpriseRun: true });
    if (!selected) return;
    setModeControlsDisabled(true);
    try {
      await typePrompt(pickSurprisePrompt(target));
      screen.textContent = `01 — ${productNames[target]} READY. PULL THE LEVER.`;
      showToast('QUESTION LOADED');
    } finally {
      setModeControlsDisabled(false);
    }
  });

  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function resetCalibration({ preserveInput = true } = {}) {
    conversationPhase = 'idle';
    stateToken = '';
    calibrationPanel.hidden = true;
    calibrationText.textContent = '';
    calibrationOptions.innerHTML = '';
    calibrationReply.value = '';
    calibrationReply.closest('label').hidden = false;
    agentLogEl.hidden = true;
    agentLogEl.innerHTML = '';
    draftBox.hidden = true;
    keepButton.hidden = true;
    input.disabled = false;
    setModeControlsDisabled(false);
    leverLabel.textContent = 'PULL TO CALIBRATE';
    lever.setAttribute('aria-label', 'Pull lever to calibrate');
    if (!preserveInput) input.value = '';
    syncInputState();
  }

  function renderOptions(options) {
    calibrationOptions.innerHTML = '';
    options.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option;
      button.addEventListener('click', () => {
        calibrationReply.value = option;
        [...calibrationOptions.children].forEach(item => item.classList.toggle('selected', item === button));
        calibrationReply.focus();
      });
      calibrationOptions.appendChild(button);
    });
  }

  function renderProgress(lamps) {
    agentLogEl.innerHTML = '';
    const items = Array.isArray(lamps) ? lamps : [];
    agentLogEl.hidden = items.length === 0;
    items.forEach(item => {
      const li = document.createElement('li');
      li.className = item.state;
      li.textContent = item.label;
      agentLogEl.appendChild(li);
    });
  }

  function renderConversationTurn(data) {
    stateToken = data.stateToken || '';
    input.disabled = true;
    setModeControlsDisabled(true);
    calibrationPanel.hidden = false;
    calibrationReply.value = '';
    draftBox.hidden = true;
    keepButton.hidden = true;
    renderProgress(data.progress);

    if (data.type === 'clarification') {
      conversationPhase = 'clarification';
      calibrationStep.textContent = `ONE QUESTION · ${data.turn || 1} / ${data.maxTurns || 1}`;
      calibrationText.textContent = data.question;
      renderOptions(Array.isArray(data.options) ? data.options : []);
      calibrationReply.closest('label').hidden = false;
      calibrationReplyLabel.textContent = 'YOUR ANSWER';
      calibrationReply.placeholder = 'A few words is plenty…';
      calibrationSecondary.textContent = 'YOU DECIDE';
      calibrationContinue.textContent = 'ANSWER';
      leverLabel.textContent = 'PULL TO ANSWER';
      lever.setAttribute('aria-label', 'Pull lever to answer the machine\'s question');
      screen.textContent = '02 — ONE QUESTION BEFORE I PACK IT.';
      calibrationReply.focus();
      return;
    }

    conversationPhase = 'confirmation';
    confirmationStage = data.stage || 'plan';
    renderOptions([]);
    calibrationReply.closest('label').hidden = !data.canRevise;
    calibrationSecondary.textContent = 'START OVER';

    if (confirmationStage === 'draft') {
      const draft = data.draft || {};
      calibrationStep.textContent = 'PACKED · TAKE IT?';
      calibrationText.textContent = '';
      draftTitle.textContent = draft.title || '';
      draftBody.textContent = draft.message || '';
      draftBox.hidden = false;
      calibrationReplyLabel.textContent = data.canRevise
        ? `SEND IT BACK? SAY WHY — OPTIONAL (${data.feedbackRoundsLeft} LEFT)`
        : 'NO MORE REPACKS';
      calibrationReply.placeholder = 'Too vague? Too long? Tell me…';
      calibrationContinue.textContent = 'TAKE IT';
      leverLabel.textContent = 'DISPENSE';
      lever.setAttribute('aria-label', 'Pull lever to dispense this object');
      screen.textContent = '03 — PACKED. TAKE IT OR SEND IT BACK.';
    } else {
      calibrationStep.textContent = 'ORDER SLIP';
      const lines = [`YOU: ${data.originalProductLabel}`];
      if (data.productChanged) lines.push(`ME: ${data.productLabel}${data.why ? ` — ${data.why}` : ''}`);
      lines.push(data.understanding);
      calibrationText.textContent = lines.join('\n');
      keepButton.textContent = `KEEP ${data.originalProductLabel}`;
      keepButton.hidden = !data.productChanged;
      calibrationReplyLabel.textContent = 'CHANGE THE ORDER — OPTIONAL';
      calibrationReply.placeholder = 'Not quite? Say what you meant…';
      calibrationContinue.textContent = data.productChanged ? `TAKE ${data.productLabel}` : 'LOOKS RIGHT';
      leverLabel.textContent = 'CONFIRM ORDER';
      lever.setAttribute('aria-label', 'Pull lever to confirm the order');
      screen.textContent = '03 — CHECK THE SLIP. RIGHT?';
    }
    if (data.canRevise) calibrationReply.focus();
    else lever.focus();
  }

  async function sendTurn(payload) {
    if (working) return;
    working = true;
    lever.disabled = true;
    machine.classList.add('thinking');
    screen.textContent = 'CHECKING THE SHELF…';
    tinySound(120, .09);
    const started = Date.now();
    let keepWorking = false;

    try {
      const response = await fetch('/api/vending/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = data.error
          || ([408, 504].includes(response.status)
            ? 'The model took too long to respond. Pull again.'
            : 'The calibration mechanism jammed. Pull again.');
        throw new Error(message);
      }
      if (data.type !== 'working') machine.classList.remove('thinking');

      if (data.type === 'artifact') {
        conversationPhase = 'complete';
        calibrationPanel.hidden = true;
        machine.classList.add('working');
        await wait(Math.max(0, 1900 - (Date.now() - started)));
        lastArtifact = data;
        screen.textContent = data.privacyRecall ? 'PRIVACY SENSOR — BATCH SAFELY RECALLED.' : '04 — OBJECT READY. LIFT THE COLLECTION DOOR.';
        renderArtifact(data);
        tinySound(420, .12);
        await wait(250);
        openArtifact();
      } else if (data.type === 'working') {
        stateToken = data.stateToken || stateToken;
        renderProgress(data.progress);
        screen.textContent = 'PACKING…';
        machine.classList.add('thinking');
        keepWorking = true;
      } else if (data.type === 'clarification' || data.type === 'confirmation') {
        await wait(Math.max(0, 500 - (Date.now() - started)));
        renderConversationTurn(data);
        tinySound(280, .06);
      } else {
        throw new Error('The calibration mechanism returned an unknown ticket.');
      }
    } catch (error) {
      const message = /failed to fetch|load failed|networkerror/i.test(String(error.message || ''))
        ? 'Network request failed. Pull again.'
        : error.message;
      screen.textContent = `JAM 05 — ${message}`;
      showToast(message.toUpperCase());
      tinySound(82, .18);
    } finally {
      working = false;
      lever.disabled = false;
      if (!keepWorking) machine.classList.remove('thinking');
      setTimeout(() => machine.classList.remove('working'), 450);
    }
    if (keepWorking) await sendTurn({ stateToken, action: 'continue' });
  }

  async function advanceConversation() {
    if (working) return;

    if (conversationPhase === 'idle') {
      const thought = input.value.trim();
      if (thought.length < 2) {
        screen.textContent = 'ERROR 01 — THE MACHINE CANNOT VEND EMPTY AIR.';
        input.focus();
        showToast('INSERT A THOUGHT FIRST');
        tinySound(95, .12);
        return;
      }
      await sendTurn({ input: thought, product: selectedProduct });
      return;
    }

    if (conversationPhase === 'clarification') {
      const answer = calibrationReply.value.trim();
      if (!answer) {
        showToast('ANSWER OR LET THE MACHINE DECIDE');
        calibrationReply.focus();
        return;
      }
      await sendTurn({ stateToken, action: 'answer', answer });
      return;
    }

    if (conversationPhase === 'confirmation') {
      const correction = calibrationReply.value.trim();
      const canRevise = !calibrationReply.closest('label').hidden;
      await sendTurn(correction && canRevise
        ? { stateToken, action: 'revise', answer: correction }
        : { stateToken, action: 'dispense' });
    }
  }

  lever.addEventListener('click', () => {
    triggerPullFeedback();
    advanceConversation();
  });
  input.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') advanceConversation();
  });
  calibrationReply.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') advanceConversation();
  });
  calibrationContinue.addEventListener('click', advanceConversation);
  calibrationSecondary.addEventListener('click', () => {
    if (conversationPhase === 'clarification') sendTurn({ stateToken, action: 'skip' });
    else {
      resetCalibration();
      input.focus();
    }
  });
  keepButton.addEventListener('click', () => {
    if (conversationPhase === 'confirmation') sendTurn({ stateToken, action: 'keep' });
  });
  document.querySelector('#calibrationReset').addEventListener('click', () => {
    resetCalibration();
    input.focus();
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
    await navigator.clipboard.writeText(`“${lastArtifact.title}”\n\n${lastArtifact.message}\n\n— ZVM-01 · ${lastArtifact.productLabel} · ${lastArtifact.serial}`);
    showToast('OBJECT COPIED');
  });

  document.querySelector('#saveButton').addEventListener('click', () => {
    if (!lastArtifact) return;
    const text = `“${lastArtifact.title}”\n\n${lastArtifact.message}\n\n— ZVM-01 · ${lastArtifact.productLabel} · ${lastArtifact.serial}\nProfile: ${lastArtifact.profileVersion}`;
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
    resetCalibration();
    input.select();
    screen.textContent = '01 — EDIT THE THOUGHT OR CALIBRATE AGAIN.';
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
