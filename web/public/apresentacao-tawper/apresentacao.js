(() => {
  'use strict';
  const slides = [...document.querySelectorAll('.slide')];
  const notes = JSON.parse(document.getElementById('speaker-data').textContent);
  const $ = (id) => document.getElementById(id);
  const overview = $('overview');
  let index = 0, toastTimer;
  const params = new URLSearchParams(location.search);
  if (params.has('export')) document.body.classList.add('export', 'no-motion');

  function fit() {
    const rect = $('viewport').getBoundingClientRect();
    document.documentElement.style.setProperty('--scale', Math.min(rect.width / 1600, rect.height / 900));
  }
  function updateNotes() {
    const n = notes[index];
    $('notes-title').textContent = `${String(index + 1).padStart(2, '0')}. ${n.title}`;
    $('notes-text').textContent = n.notes;
    $('notes-sources').textContent = `Fontes: ${n.sources}\n\nImagem: ${n.visual}`;
  }
  function show(n, updateHash = true) {
    index = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach((slide, i) => {
      const active = i === index;
      slide.classList.toggle('active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
      if (!active) slide.querySelectorAll('video').forEach(v => v.pause());
    });
    $('slide-counter').textContent = `${String(index + 1).padStart(2, '0')} / ${slides.length}`;
    $('slide-title').textContent = notes[index].title;
    $('prev').disabled = index === 0;
    $('next').disabled = index === slides.length - 1;
    $('progress').style.width = `${(index + 1) / slides.length * 100}%`;
    document.title = `${String(index + 1).padStart(2, '0')} · ${notes[index].title} — Tawper`;
    if (updateHash) history.replaceState(null, '', `#slide-${String(index + 1).padStart(2, '0')}`);
    updateNotes();
    document.querySelectorAll('.overview-card').forEach((card, i) => card.setAttribute('aria-current', String(i === index)));
    window.dispatchEvent(new CustomEvent('slidechange', { detail: { index, total: slides.length } }));
  }
  function toggleNotes() {
    const open = $('notes-panel').classList.toggle('open');
    $('notes-button').setAttribute('aria-expanded', String(open));
    updateNotes();
  }
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500);
  }
  function openOverview() {
    if (!overview.open) overview.showModal();
    overview.querySelector('[aria-current="true"]')?.focus();
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { toast('Use F11 para colocar o navegador em tela cheia.'); }
  }
  const grid = $('overview-grid');
  notes.forEach((n, i) => {
    const button = document.createElement('button');
    button.className = 'overview-card';
    const img = document.createElement('img');
    img.src = `previas/slide-${String(i + 1).padStart(2, '0')}.jpg`;
    img.alt = ''; img.loading = 'lazy';
    const label = document.createElement('span');
    label.textContent = `${String(i + 1).padStart(2, '0')} · ${n.title}`;
    button.append(img, label);
    button.addEventListener('click', () => { show(i); overview.close(); });
    grid.append(button);
  });
  $('prev').addEventListener('click', () => show(index - 1));
  $('next').addEventListener('click', () => show(index + 1));
  $('notes-button').addEventListener('click', toggleNotes);
  $('close-notes').addEventListener('click', toggleNotes);
  $('overview-button').addEventListener('click', openOverview);
  $('close-overview').addEventListener('click', () => overview.close());
  $('fullscreen-button').addEventListener('click', fullscreen);
  $('print-button').addEventListener('click', () => window.print());
  overview.addEventListener('click', event => { if (event.target === overview) overview.close(); });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target.isContentEditable) return;
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (overview.open) return;
    if (event.target.closest('video')) return;
    if (event.target.closest('button,a') && [' ', 'Enter'].includes(event.key)) return;
    const actions = {
      ArrowRight: () => show(index + 1), PageDown: () => show(index + 1),
      ArrowLeft: () => show(index - 1), PageUp: () => show(index - 1),
      ' ': () => show(index + 1), Home: () => show(0), End: () => show(slides.length - 1),
      n: toggleNotes, N: toggleNotes, g: openOverview, G: openOverview, f: fullscreen, F: fullscreen,
      Escape: () => { if ($('notes-panel').classList.contains('open')) toggleNotes(); }
    };
    if (actions[event.key]) { event.preventDefault(); actions[event.key](); }
  });
  let touchStart;
  $('viewport').addEventListener('touchstart', event => {
    if (event.target.isContentEditable || event.target.closest('video,a,button')) return;
    touchStart = {x: event.touches[0].clientX, y: event.touches[0].clientY};
  }, {passive:true});
  $('viewport').addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
    touchStart = null;
  }, {passive:true});
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', () => { document.body.classList.toggle('presenting', !!document.fullscreenElement); fit(); });
  window.addEventListener('hashchange', () => { const n = Number(location.hash.match(/slide-(\d+)/)?.[1]); if (n) show(n - 1, false); });
  window.addEventListener('beforeprint', () => slides.forEach(s => s.inert = false));
  window.addEventListener('afterprint', () => show(index, false));
  document.fonts.ready.then(fit);
  const initial = Number(location.hash.match(/slide-(\d+)/)?.[1]) || 1;
  show(initial - 1, false); fit();
  window.TawperDeck = Object.freeze({show, fit, get index() { return index; }, total: slides.length});
  if(!document.querySelector('meta[name="tawper-edit-document"]')){
    const edit=document.createElement('button');edit.id='open-text-editor';edit.title='Abrir versão editável';
    edit.innerHTML='✎ <span class="toolbar-label">Editar textos</span>';
    edit.addEventListener('click',()=>{location.href=`apresentacao-editavel.html?editar=1${location.hash}`;});
    $('toolbar').lastElementChild.prepend(edit);
  }
})();
