(() => {
  let token = sessionStorage.getItem('zvm-owner-token') || '';
  let profileState = null;
  let currentDraft = null;
  const authGate = document.querySelector('#authGate');
  const dashboard = document.querySelector('#dashboard');
  const notice = document.querySelector('#notice');
  let noticeTimer;

  function notify(message) {
    notice.textContent = message;
    notice.classList.add('show');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove('show'), 2800);
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/vending/owner${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'x-owner-token': token, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status });
    return data;
  }

  async function unlock() {
    try {
      profileState = await api('/profiles');
      sessionStorage.setItem('zvm-owner-token', token);
      authGate.hidden = true;
      dashboard.hidden = false;
      renderState();
    } catch (error) {
      sessionStorage.removeItem('zvm-owner-token');
      document.querySelector('#authError').textContent = error.message;
    }
  }

  document.querySelector('#authForm').addEventListener('submit', event => {
    event.preventDefault();
    token = document.querySelector('#tokenInput').value;
    unlock();
  });

  function renderState() {
    document.querySelector('#activeVersion').textContent = profileState.active?.version || 'SAFE BASELINE';
    document.querySelector('#draftCount').textContent = profileState.drafts.length;
    document.querySelector('#approvedCount').textContent = profileState.approved.length;
    document.querySelector('#showcaseCount').textContent = profileState.showcase?.items?.length || 0;
    const select = document.querySelector('#draftSelect');
    select.innerHTML = profileState.drafts.map(item => `<option value="${escapeHtml(item.version)}">${escapeHtml(item.version)}</option>`).join('');
    if (profileState.drafts.length) loadDraft(profileState.drafts[0].version);
    else {
      document.querySelector('#draftEmpty').hidden = false;
      document.querySelector('#profileForm').hidden = true;
    }
    renderHistory();
    renderShowcase();
  }

  async function loadDraft(version) {
    if (!version) return;
    currentDraft = await api(`/drafts/${encodeURIComponent(version)}`);
    document.querySelector('#draftEmpty').hidden = true;
    document.querySelector('#profileForm').hidden = false;
    document.querySelector('#profileMeta').innerHTML = `<span>${escapeHtml(currentDraft.version)}</span><span>${escapeHtml(currentDraft.methodVersion)}</span><span>${currentDraft.analysis.noteCount} NOTES</span><span>${currentDraft.analysis.characterCount.toLocaleString()} CHARACTERS</span>`;
    const labels = { reasoning: 'Reasoning Engine', knowledge: 'Knowledge Map', voice: 'Voice Model', judgment: 'Judgment Model' };
    document.querySelector('#dimensions').innerHTML = Object.entries(labels).map(([key, label]) => {
      const items = currentDraft.dimensions[key] || [];
      return `<section class="dimension" data-dimension="${key}"><div class="dimension-head"><h3>${label}</h3><span>${items.length} INFERENCES</span></div><div class="traits">${items.map((item, index) => traitHtml(item, index)).join('')}</div></section>`;
    }).join('');
  }

  function traitHtml(item, index) {
    return `<article class="trait" data-id="${escapeHtml(item.id)}" data-index="${index}"><div class="trait-top"><input type="checkbox" ${item.approved !== false ? 'checked' : ''} aria-label="Approve ${escapeHtml(item.label)}"><strong>${escapeHtml(item.label)}</strong><span class="confidence">${Math.round(item.confidence * 100)}% CONF.</span></div><textarea maxlength="360" aria-label="Edit ${escapeHtml(item.label)} description">${escapeHtml(item.description)}</textarea><p><b>WHY:</b> ${escapeHtml(item.rationale)}</p></article>`;
  }

  document.querySelector('#draftSelect').addEventListener('change', event => loadDraft(event.target.value));
  document.querySelector('#learnButton').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'ANALYZING LOCALLY…';
    try {
      const draft = await api('/learn', { method: 'POST', body: '{}' });
      notify(`DRAFT CREATED: ${draft.version}`);
      profileState = await api('/profiles');
      renderState();
    } catch (error) { notify(error.message.toUpperCase()); }
    finally { button.disabled = false; button.textContent = '↻ LEARN FROM VAULT'; }
  });

  document.querySelector('#profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!currentDraft) return;
    const dimensions = {};
    document.querySelectorAll('.dimension').forEach(section => {
      dimensions[section.dataset.dimension] = [...section.querySelectorAll('.trait')].map((card, index) => {
        const original = currentDraft.dimensions[section.dataset.dimension][index];
        return { id: original.id, label: original.label, confidence: original.confidence, approved: card.querySelector('input').checked, description: card.querySelector('textarea').value };
      });
    });
    const button = event.submitter;
    button.disabled = true;
    try {
      const approved = await api(`/drafts/${encodeURIComponent(currentDraft.version)}/approve`, { method: 'POST', body: JSON.stringify({ dimensions }) });
      notify(`PROFILE ACTIVE: ${approved.version}`);
      profileState = await api('/profiles');
      renderState();
    } catch (error) { notify(error.message.toUpperCase()); }
    finally { button.disabled = false; }
  });

  function renderHistory() {
    const active = profileState.active?.version;
    const list = document.querySelector('#historyList');
    list.innerHTML = profileState.approved.length ? profileState.approved.map(item => `<div class="history-row ${item.version === active ? 'active' : ''}"><strong>${escapeHtml(item.version)}</strong><span>${item.characteristicCount} CHARACTERISTICS</span><span>${formatDate(item.approvedAt)}</span>${item.version === active ? '<span>● ACTIVE</span>' : `<button data-activate="${escapeHtml(item.version)}">REVERT / ACTIVATE</button>`}</div>`).join('') : '<div class="empty">No approved profile versions yet.</div>';
    list.querySelectorAll('[data-activate]').forEach(button => button.addEventListener('click', async () => {
      try {
        await api(`/profiles/${encodeURIComponent(button.dataset.activate)}/activate`, { method: 'POST', body: '{}' });
        profileState = await api('/profiles');
        renderState();
        notify('ACTIVE PROFILE CHANGED');
      } catch (error) { notify(error.message.toUpperCase()); }
    }));
  }

  document.querySelectorAll('.tabs button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('.panel').forEach(panel => panel.classList.remove('active'));
    document.querySelector(`#${button.dataset.tab}Panel`).classList.add('active');
  }));

  document.querySelector('#evalForm').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    button.textContent = 'VENDING 3 BATCHES…';
    try {
      const run = await api('/evaluate', { method: 'POST', body: JSON.stringify({ input: document.querySelector('#evalInput').value, product: document.querySelector('#evalProduct').value }) });
      document.querySelector('#evalResults').innerHTML = run.outputs.map(({ mode, artifact }) => `<article class="eval-card"><small>${escapeHtml(mode.toUpperCase())}</small><h3>${escapeHtml(artifact.title)}</h3><p>${escapeHtml(artifact.message)}</p><small>${escapeHtml(artifact.profileVersion)}</small></article>`).join('');
      notify('COMPARISON RECORDED PRIVATELY');
    } catch (error) { notify(error.message.toUpperCase()); }
    finally { button.disabled = false; button.textContent = 'RUN 3-WAY TEST →'; }
  });

  function renderShowcase() {
    const items = profileState.showcase?.items || [];
    const container = document.querySelector('#showcaseItems');
    container.innerHTML = items.length
      ? items.map(showcaseItemHtml).join('')
      : '<div class="empty showcase-empty">No public projects approved. Personal-history questions will receive a privacy-safe boundary response.</div>';
    bindShowcaseRemoveButtons();
  }

  function showcaseItemHtml(item, index) {
    return `<article class="showcase-item" data-id="${escapeAttr(item.id || `project-${index + 1}`)}"><button class="remove-project" type="button" aria-label="Remove project">×</button><label>PUBLIC PROJECT TITLE<input class="project-title" maxlength="100" value="${escapeAttr(item.title || '')}" required></label><label>PUBLIC TAGS · COMMA SEPARATED<input class="project-tags" maxlength="200" value="${escapeAttr((item.tags || []).join(', '))}"></label><label class="wide">APPROVED PUBLIC DESCRIPTION<textarea class="project-description" maxlength="420" required>${escapeHtml(item.description || '')}</textarea></label><label class="wide">WHY IT IS INTERESTING · OPTIONAL<textarea class="project-interest" maxlength="320">${escapeHtml(item.whyInteresting || '')}</textarea></label></article>`;
  }

  function bindShowcaseRemoveButtons() {
    document.querySelectorAll('.remove-project').forEach(button => button.addEventListener('click', () => {
      button.closest('.showcase-item').remove();
      if (!document.querySelector('.showcase-item')) document.querySelector('#showcaseItems').innerHTML = '<div class="empty showcase-empty">No public projects approved. Save to publish the empty showcase.</div>';
    }));
  }

  document.querySelector('#addProjectButton').addEventListener('click', () => {
    const container = document.querySelector('#showcaseItems');
    container.querySelector('.showcase-empty')?.remove();
    container.insertAdjacentHTML('beforeend', showcaseItemHtml({ id: `project-${Date.now()}`, title: '', description: '', whyInteresting: '', tags: [] }, container.children.length));
    bindShowcaseRemoveButtons();
    container.querySelector('.showcase-item:last-child .project-title').focus();
  });

  document.querySelector('#showcaseForm').addEventListener('submit', async event => {
    event.preventDefault();
    const items = [...document.querySelectorAll('.showcase-item')].map(card => ({
      id: card.dataset.id,
      title: card.querySelector('.project-title').value,
      description: card.querySelector('.project-description').value,
      whyInteresting: card.querySelector('.project-interest').value,
      tags: card.querySelector('.project-tags').value.split(',').map(value => value.trim()).filter(Boolean),
      approved: true,
    }));
    const button = event.submitter;
    button.disabled = true;
    try {
      profileState.showcase = await api('/showcase', { method: 'PUT', body: JSON.stringify({ items }) });
      document.querySelector('#showcaseCount').textContent = profileState.showcase.items.length;
      renderShowcase();
      notify('PUBLIC SHOWCASE SAVED');
    } catch (error) { notify(error.message.toUpperCase()); }
    finally { button.disabled = false; }
  });

  function escapeHtml(value) { const div = document.createElement('div'); div.textContent = String(value ?? ''); return div.innerHTML; }
  function escapeAttr(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;'); }
  function formatDate(value) { return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
  if (token) unlock();
})();
