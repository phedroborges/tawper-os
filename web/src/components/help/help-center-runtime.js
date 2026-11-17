// Gerado a partir de docs/manual/central-ajuda.js.
'use strict';
/**
 * @param {Document | HTMLElement} root
 * @param {{embedded?: boolean}} options
 */
export function initializeHelpCenter(root = document, {embedded = false} = {}) {

  const controller = new AbortController();
  const getById = id => root.querySelector('#' + CSS.escape(id));
  const listen = (target, event, handler) => target.addEventListener(event, handler, {signal: controller.signal});
  const articles = Array.from(root.querySelectorAll('.help-article'));
  const search = getById('help-search');
  const home = getById('help-home');
  const layout = getById('article-layout');
  const resultSection = getById('result-section');
  const resultList = getById('result-list');
  const categorySection = getById('category-section');
  const popularSection = getById('popular-section');
  const printButton = getById('print-article');
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const stopWords = new Set(['como','para','uma','com','que','qual','quais','por','dos','das','sobre','meu','minha','nao','posso','fazer','quero','preciso','de','do','da','no','na','os','as','em','um']);
  const index = articles.map(article => ({
    article,
    title: article.dataset.title,
    category: article.dataset.category,
    categoryName: article.dataset.categoryName,
    summary: article.querySelector('.article-summary').textContent,
    text: normalize(article.textContent + ' ' + article.id.replace(/-/g, ' ')),
  }));
  let currentCategory = '';
  let activeArticle = null;

  function resultCard(item) {
    const link = document.createElement('a'); link.className = 'result-card'; link.href = '#' + item.article.id;
    const category = document.createElement('small'); category.textContent = item.categoryName;
    const title = document.createElement('h3'); title.textContent = item.title;
    const summary = document.createElement('p'); summary.textContent = item.summary;
    link.append(category, title, summary); return link;
  }
  function showResults() {
    const raw = search.value.trim();
    const tokens = normalize(raw).split(/\s+/).filter(word => word.length > 1 && !stopWords.has(word));
    const hasQuery = raw.length > 0;
    getById('clear-search').hidden = !hasQuery;
    categorySection.hidden = hasQuery || Boolean(currentCategory);
    popularSection.hidden = hasQuery || Boolean(currentCategory);
    resultSection.hidden = !hasQuery && !currentCategory;
    resultList.replaceChildren();
    if (resultSection.hidden) { getById('search-status').textContent = ''; return; }
    const matches = index.filter(item => !currentCategory || item.category === currentCategory)
      .filter(item => !hasQuery || (tokens.length ? tokens.every(token => item.text.includes(token)) : normalize(item.title).includes(normalize(raw))))
      .map(item => ({item, score: tokens.reduce((total, token) => total + (normalize(item.title).includes(token) ? 10 : 0) + (normalize(item.summary).includes(token) ? 3 : 0), 0)}))
      .sort((a,b) => b.score - a.score);
    const name = root.querySelector('[data-category-id="' + currentCategory + '"]')?.dataset.categoryName || '';
    getById('result-title').textContent = hasQuery ? 'Resultados para “' + raw + '”' : name;
    getById('result-count').textContent = matches.length + (matches.length === 1 ? ' artigo' : ' artigos');
    getById('search-status').textContent = matches.length + ' resultado(s) encontrado(s).';
    if (!matches.length) {
      const empty = document.createElement('div'); empty.className = 'empty-result';
      const heading = document.createElement('h3'); heading.textContent = 'Não encontramos essa dúvida.';
      const paragraph = document.createElement('p'); paragraph.textContent = 'Tente palavras como cliente, visita, proposta ou tarefa. Você também pode voltar aos assuntos ou consultar como pedir ajuda.';
      const link = document.createElement('a'); link.href = '#pedir-ajuda'; link.textContent = 'Como pedir ajuda';
      empty.append(heading,paragraph,link); resultList.append(empty);
    } else matches.forEach(match => resultList.append(resultCard(match.item)));
  }
  function showHome(category = '') {
    activeArticle = null; currentCategory = category;
    home.hidden = false; layout.hidden = true; printButton.hidden = true;
    articles.forEach(article => { article.hidden = true; });
    if (!embedded) document.title = 'Central de ajuda · Tawper';
    showResults();
  }
  function showArticle(article, target = article) {
    activeArticle = article; home.hidden = true; layout.hidden = false; printButton.hidden = false;
    articles.forEach(item => { item.hidden = item !== article; });
    root.querySelectorAll('.category-sidebar [data-category-id]').forEach(link => {
      if (link.dataset.categoryId === article.dataset.category) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    const categoryLink = getById('breadcrumb-category');
    categoryLink.textContent = article.dataset.categoryName; categoryLink.href = '#categoria/' + article.dataset.category;
    getById('breadcrumb-title').textContent = article.dataset.title;
    const toc = getById('article-toc-links'); toc.replaceChildren();
    article.querySelectorAll('h2[id]').forEach(heading => {
      const link = document.createElement('a'); link.href = '#' + heading.id; link.textContent = heading.textContent; toc.append(link);
    });
    if (!embedded) document.title = article.dataset.title + ' · Ajuda Tawper';
    requestAnimationFrame(() => target.scrollIntoView({block:'start'}));
  }
  function route() {
    let key;
    try { key = decodeURIComponent(location.hash.slice(1)); } catch { key = ''; }
    if (!key || key === 'inicio') { currentCategory = ''; search.value = ''; showHome(); return; }
    if (key === 'conteudo') { getById('conteudo').focus(); return; }
    if (key.startsWith('categoria/')) {
      const category = key.slice('categoria/'.length);
      const valid = index.some(item => item.category === category);
      search.value = ''; showHome(valid ? category : ''); requestAnimationFrame(() => resultSection.scrollIntoView({block:'start'})); return;
    }
    const target = getById(key);
    const article = target?.closest('.help-article');
    if (article) showArticle(article, target);
    else { search.value = ''; showHome(); }
  }
  listen(search, 'input', () => { currentCategory = ''; showResults(); });
  listen(search, 'keydown', event => {
    if (event.key === 'Escape') { search.value = ''; currentCategory = ''; showResults(); }
  });
  listen(getById('help-search-form'), 'submit', event => {event.preventDefault(); showResults(); if (!resultSection.hidden) resultSection.scrollIntoView({block:'start'});});
  listen(getById('clear-search'), 'click', () => { search.value = ''; currentCategory = ''; showResults(); search.focus(); });
  listen(getById('focus-search'), 'click', () => {
    if (location.hash !== '#inicio') location.hash = 'inicio';
    else { search.value = ''; showHome(); }
    requestAnimationFrame(() => { search.scrollIntoView({block:'center'}); search.focus(); });
  });
  root.querySelectorAll('[data-cases]').forEach(group => {
    const buttons = Array.from(group.querySelectorAll('[data-case]'));
    const panels = Array.from(group.querySelectorAll('[data-case-panel]'));
    buttons.forEach(button => listen(button, 'click', () => {
      buttons.forEach(item => item.setAttribute('aria-pressed',String(item === button)));
      panels.forEach(panel => { panel.hidden = panel.dataset.casePanel !== button.dataset.case; });
    }));
  });
  const printState = new Map();
  listen(window, 'beforeprint', () => {
    if (!activeArticle) return;
    activeArticle.querySelectorAll('details').forEach(detail => {printState.set(detail,detail.open); detail.open = true;});
  });
  listen(window, 'afterprint', () => {printState.forEach((open,detail) => { detail.open = open; }); printState.clear();});
  listen(printButton, 'click', () => { if (activeArticle) window.print(); });
  listen(root, 'click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (link && link.getAttribute('href') === location.hash) {
      event.preventDefault(); route();
      if (location.hash === '#inicio') window.scrollTo({top:0});
    }
  });
  listen(window, 'hashchange',route);
  route();
  return () => {
    controller.abort();
    printState.forEach((open, detail) => { detail.open = open; });
  };
}
