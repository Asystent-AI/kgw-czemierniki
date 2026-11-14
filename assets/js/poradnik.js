(() => {
  'use strict';
  // Czytnik poradnika: jedna strona naraz, spis, wyszukiwarka, kartkowanie i ustawienia.
  // Bez JavaScriptu wszystkie strony są widoczne jedna pod drugą (treść nie zależy od skryptu).
  // Lektor, syreny i dodatki są w poradnik-audio.js i korzystają z window.KGWPoradnik.
  const root = document.getElementById('poradnik');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const html = document.documentElement;
  const chapters = Array.from(root.querySelectorAll('#text-view > .guide-chapter'));
  const N = chapters.length;
  if (!N) return;
  const SEL = 'h2, h3, p, li, .litry > div, .telefony > .num';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    read(key) {try {return localStorage.getItem('kgw-poradnik-' + key);} catch (_) {return null;}},
    write(key, value) {try {localStorage.setItem('kgw-poradnik-' + key, value);return true;} catch (_) {return false;}}
  };
  // Komunikat dla czytników ekranu: wyczyszczenie i wpis po chwili, żeby region na pewno go ogłosił.
  const announce = (el, text) => {
    if (!el) return;
    el.textContent = '';
    setTimeout(() => {el.textContent = text;}, 40);
  };
  const clean = el => {
    const copy = el.cloneNode(true);
    // Tekst ukryty dla czytników zastępujemy spacją: bywa jedynym separatorem ("4 godziny").
    copy.querySelectorAll('.sr-only').forEach(n => n.parentNode.replaceChild(document.createTextNode(' '), n));
    return copy.textContent.replace(/\s+/g, ' ').trim();
  };
  const blocksOf = chapter => Array.from(chapter.querySelectorAll(SEL)).filter(b => !b.closest('.web-extra, .plan-download'));
  const titles = chapters.map(ch => clean(ch.querySelector('h2')));
  const texts = chapters.map(ch => blocksOf(ch).map(clean).join(' '));
  const normal = s => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  // Wyszukiwarka pomija spis treści ze strony 2: zawiera wszystkie tytuły i pasowałby do każdego tematu.
  const findTexts = chapters.map(ch => blocksOf(ch).filter(b => !b.closest('.spis')).map(clean).join(' '));
  const searchable = findTexts.map((t, i) => normal(titles[i] + ' ' + t));
  // Nagłówki i numery telefonów ważą przy wyborze strony otwieranej Enterem.
  const heads = chapters.map(ch => normal(Array.from(ch.querySelectorAll('h3, .num')).map(clean).join(' ')));
  const minutes = texts.map(t => Math.max(1, Math.round(t.split(/\s+/).length / 170)));
  const pad = n => String(n).padStart(2, '0');
  const toc = Array.from(root.querySelectorAll('[data-toc]'));
  const baseTitle = document.title;
  const status = $('reader-status');
  let current = -1, mode = 'text';

  /* ---------- Ustalanie strony z adresu ---------- */
  // Kotwica może wskazywać stronę (#woda) albo dowolny element w niej (#tytul-woda).
  function indexFromHash(hash) {
    if (!hash || hash.length < 2) return -1;
    let id = hash.slice(1);
    try {id = decodeURIComponent(id);} catch (_) { /* zostaw surowe */ }
    const el = document.getElementById(id);
    const chapter = el && el.closest ? el.closest('#text-view > .guide-chapter') : null;
    return chapter ? chapters.indexOf(chapter) : -1;
  }

  /* ---------- Przewijanie pod przyklejone paski ---------- */
  const gora = document.querySelector('.gora');
  const dock = $('reader-dock');
  function stickyOffset() {
    let top = 0;
    if (dock && getComputedStyle(dock).position === 'sticky' && dock.offsetParent) {
      top = (parseFloat(getComputedStyle(dock).top) || 0) + dock.offsetHeight;
    } else if (gora && getComputedStyle(gora).position === 'sticky') {
      top = gora.offsetHeight;
    }
    return top + 14;
  }
  function setOffsets() {
    const g = gora && getComputedStyle(gora).position === 'sticky' ? gora.offsetHeight : 0;
    html.style.setProperty('--gora-h', g + 'px');
    html.style.setProperty('--sticky-offset', stickyOffset() + 'px');
  }
  // Skok bez płynnego przewijania z main.css (scroll-behavior: smooth): po zmianie strony treść jest już nowa.
  function jumpTo(y) {
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(0, Math.max(0, y));
    html.style.scrollBehavior = prev;
  }
  function scrollToCurrent() {
    const target = mode === 'text' ? chapters[current] : $('book-view');
    jumpTo(target.getBoundingClientRect().top + window.pageYOffset - stickyOffset());
  }

  /* ---------- Pokazywanie strony ---------- */
  function setDisabled(id, value) {const el = $(id);if (el) el.disabled = value;}
  function showPage(index, opts) {
    opts = opts || {};
    if (!Number.isInteger(index) || index < 0 || index >= N) return;
    const changed = index !== current;
    current = index;
    if (changed && opts.source !== 'select') status.textContent = '';
    chapters.forEach((ch, i) => {ch.hidden = i !== current;});
    toc.forEach((link, i) => {if (i === current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');});
    $('dock-title').textContent = titles[current];
    $('dock-meta').textContent = `Strona ${current + 1} z ${N}`;
    if (dock) dock.style.setProperty('--progress', ((current + 1) / N).toFixed(4));
    $('page-select').value = String(current);
    ['dock-prev', 'prev-chapter'].forEach(id => setDisabled(id, current === 0));
    ['dock-next', 'next-chapter'].forEach(id => setDisabled(id, current === N - 1));
    const next = $('next-chapter');
    if (next) next.title = current < N - 1 ? `Strona ${current + 2}: ${titles[current + 1]}` : '';
    const prev = $('prev-chapter');
    if (prev) prev.title = current > 0 ? `Strona ${current}: ${titles[current - 1]}` : '';
    $('reading-time').textContent = minutes[current] === 1 ? 'Czytanie: około 1 minuty' : `Czytanie: około ${minutes[current]} minut`;
    const skip = $('reader-skip');
    if (skip) skip.href = '#' + chapters[current].querySelector('h2').id;
    if (!opts.keepTitle) document.title = `${titles[current]} | Poradnik KGW Czemierniki`;
    $('share-fallback').hidden = true;
    updateBookmark();
    if (mode === 'book') setBookImage(current);
    if (opts.scroll) scrollToCurrent();
    if (opts.focus) {
      if (mode === 'text') chapters[current].querySelector('h2').focus({preventScroll: true});
      else $('book-zoom').focus({preventScroll: true});
    }
    if (changed && opts.animate && !reduced()) {
      const el = mode === 'text' ? chapters[current] : $('book-page');
      if (el.animate) el.animate([{opacity: 0.4, transform: 'translateY(8px)'}, {opacity: 1, transform: 'none'}], {duration: 240, easing: 'ease-out'});
    }
    if (changed) root.dispatchEvent(new CustomEvent('poradnik:page', {detail: {index: current, source: opts.source || ''}}));
  }
  // history: 'push' (skok ze spisu, kafelka, strzałek), 'replace' (lista stron, lektor), 'none'.
  function navigate(index, opts) {
    opts = opts || {};
    if (!Number.isInteger(index) || index < 0 || index >= N) return;
    const focus = opts.focus !== false, scroll = opts.scroll !== false;
    if (index === current) {
      if (scroll) scrollToCurrent();
      if (focus) chapters[current].querySelector('h2').focus({preventScroll: true});
      return;
    }
    const url = '#' + chapters[index].id;
    try {
      if (opts.history === 'replace') history.replaceState({chapter: index}, '', url);
      else if (opts.history !== 'none') history.pushState({chapter: index}, '', url);
    } catch (_) { /* np. file:// w starszych przeglądarkach */ }
    showPage(index, {focus, scroll, animate: true, source: opts.source});
  }

  /* ---------- Linki do stron (spis, kafelki, skróty, spis w treści) ---------- */
  root.addEventListener('click', event => {
    if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    const i = indexFromHash(link.getAttribute('href'));
    if (i < 0) return;
    event.preventDefault();
    if (mode === 'book' && link.closest('#text-view')) setMode('text');
    if (link.closest('.reader-toc') && matchMedia('(max-width: 900px)').matches) $('reader-toc').open = false;
    navigate(i);
  });
  const step = delta => navigate(current + delta);
  $('dock-prev').addEventListener('click', () => step(-1));
  $('dock-next').addEventListener('click', () => step(1));
  $('prev-chapter').addEventListener('click', () => step(-1));
  $('next-chapter').addEventListener('click', () => step(1));
  // Lista stron nie przenosi fokusu ani nie mnoży historii: strzałką da się przejrzeć opcje (WCAG 3.2.2).
  $('page-select').addEventListener('change', event => {
    const i = Number(event.target.value);
    navigate(i, {history: 'replace', focus: false, source: 'select'});
    announce(status, `Strona ${i + 1} z ${N}: ${titles[i]}`);
  });
  window.addEventListener('popstate', event => {
    const i = indexFromHash(location.hash);
    if (i >= 0) {showPage(i, {scroll: true, source: 'history'});return;}
    if (!location.hash) {
      const s = event.state && Number.isInteger(event.state.chapter) ? event.state.chapter : 1;
      showPage(s, {scroll: false, source: 'history'});
      document.title = baseTitle;
    }
  });

  /* ---------- Ustawienia w pasku czytnika ---------- */
  const settings = $('reader-settings');
  function closeSettings(returnFocus) {
    if (!settings.open) return;
    settings.open = false;
    if (returnFocus) settings.querySelector('summary').focus();
  }
  document.addEventListener('click', event => {if (settings.open && !settings.contains(event.target)) closeSettings(false);});
  // Esc zamyka otwarty panel; przy zamkniętym trafia do obsługi dokumentu (koniec trybu skupienia).
  settings.addEventListener('keydown', event => {if (event.key === 'Escape' && settings.open) {event.stopPropagation();closeSettings(true);}});
  // Wyjście fokusem poza panel zamyka go, żeby nie zasłaniał elementu z fokusem.
  settings.addEventListener('focusout', event => {if (settings.open && event.relatedTarget && !settings.contains(event.relatedTarget)) closeSettings(false);});

  // Wielkość tekstu: widoczna etykieta ze stanem (WCAG 2.5.3), bez osobnego aria-label.
  const SIZES = ['', '1.375rem', '1.625rem'], SIZE_NAMES = ['zwykły', 'duży', 'bardzo duży'];
  let font = Math.min(2, Math.max(0, Math.floor(Number(store.read('font'))) || 0));
  function applyFont() {
    if (SIZES[font]) root.style.setProperty('--reading-size', SIZES[font]);
    else root.style.removeProperty('--reading-size');
    $('font-label').textContent = SIZE_NAMES[font];
  }
  $('font-size').addEventListener('click', () => {font = (font + 1) % SIZES.length;applyFont();store.write('font', String(font));});

  // Tryb nocny: stała etykieta, stan w aria-pressed. Domyślnie jasna kolorystyka strony Koła,
  // nocna tylko z wyboru użytkownika (klucz 'motyw'; dawny 'theme' z ustawieniem systemu pomijamy).
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  // Kolor Koła na sztywno: skrypt w nagłówku mógł już podmienić meta na kolor nocny.
  const lightThemeColor = '#461571';
  function setTheme(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    if (dark) html.dataset.reader = 'dark'; else delete html.dataset.reader;
    $('reader-theme').setAttribute('aria-pressed', String(dark));
    if (themeMeta) themeMeta.content = dark ? '#150f1c' : lightThemeColor;
  }
  setTheme(store.read('motyw') === 'dark');
  $('reader-theme').addEventListener('click', () => {const dark = root.dataset.theme !== 'dark';setTheme(dark);store.write('motyw', dark ? 'dark' : 'light');});

  // Tryb skupienia: stała etykieta i aria-pressed; czytany akapit zostaje w tym samym miejscu ekranu.
  function setFocusMode(active) {
    const top = stickyOffset();
    const anchor = blocksOf(chapters[current]).find(b => b.getBoundingClientRect().bottom > top);
    const before = anchor ? anchor.getBoundingClientRect().top : 0;
    document.body.classList.toggle('guide-focused', active);
    $('focus-reader').setAttribute('aria-pressed', String(active));
    setOffsets();
    if (anchor && mode === 'text') jumpTo(window.pageYOffset + anchor.getBoundingClientRect().top - before);
    else scrollToCurrent();
  }
  $('focus-reader').addEventListener('click', () => setFocusMode(!document.body.classList.contains('guide-focused')));

  /* ---------- Zakładka i udostępnianie ---------- */
  let bookmark = chapters.findIndex(ch => ch.id === store.read('bookmark'));
  function updateBookmark() {
    $('save-page').textContent = bookmark === current ? 'Usuń zakładkę' : 'Zapisz zakładkę';
    const resume = $('resume-reading');
    resume.hidden = bookmark < 0;
    if (bookmark >= 0) {
      resume.href = '#' + chapters[bookmark].id;
      $('resume-title').textContent = `strona ${bookmark + 1}, ${titles[bookmark]}`;
    }
  }
  $('save-page').addEventListener('click', () => {
    if (bookmark === current) {
      if (store.write('bookmark', '')) {bookmark = -1;updateBookmark();announce(status, 'Zakładka usunięta.');}
      return;
    }
    if (store.write('bookmark', chapters[current].id)) {
      bookmark = current;updateBookmark();
      announce(status, 'Zakładka zapisana. Wrócisz tu przyciskiem "Twoja zakładka" na początku strony.');
    } else announce(status, 'Przeglądarka blokuje zapis. Możesz skopiować link do tej strony.');
  });
  const pageUrl = () => {const u = new URL(location.href);u.hash = chapters[current].id;return u.href;};
  $('share-page').addEventListener('click', async () => {
    const url = pageUrl();
    try {
      await navigator.clipboard.writeText(url);
      announce(status, 'Link skopiowany. Możesz przesłać go bliskim.');
      const btn = $('share-page');
      btn.textContent = 'Link skopiowany';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {btn.textContent = 'Kopiuj link do tej strony';}, 2500);
    } catch (_) {
      const input = $('share-fallback');
      input.value = url;input.hidden = false;input.focus();input.select();
      announce(status, 'Skopiuj zaznaczony adres.');
    }
  });
  const shareNative = $('share-native');
  if (navigator.share && shareNative) {
    shareNative.hidden = false;
    shareNative.addEventListener('click', () => {
      navigator.share({title: `${titles[current]}: poradnik KGW Czemierniki`, text: 'Czemierniki trzymają się razem! Poradnik dla mieszkańców', url: pageUrl()}).catch(() => { /* anulowane */ });
    });
  }

  /* ---------- Tryb kartkowania ---------- */
  const bookImg = $('book-page');
  const variants = bookImg.dataset.variants === '1';
  const pageBase = i => `/poradnik/strona-${pad(i + 1)}`;
  const srcsetFor = i => variants ? `${pageBase(i)}-720.webp 720w, ${pageBase(i)}-1080.webp 1080w, ${pageBase(i)}.webp 1444w` : '';
  const srcFor = i => variants ? `${pageBase(i)}-1080.webp` : `${pageBase(i)}.webp`;
  function preload(i) {
    if (i < 0 || i >= N) return;
    const img = new Image();
    img.sizes = bookImg.sizes;
    if (variants) img.srcset = srcsetFor(i);
    img.src = srcFor(i);
    return img;
  }
  function setBookImage(i) {
    bookImg.alt = `Strona ${i + 1} z ${N}: ${titles[i]}. Pełna treść jest w trybie "Czytaj tekst".`;
    $('book-zoom').setAttribute('aria-label', `Powiększ stronę ${i + 1}: ${titles[i]}`);
    const view = $('book-view');
    if (bookImg.dataset.page === String(i)) {view.removeAttribute('aria-busy');return;}
    view.setAttribute('aria-busy', 'true');
    const img = preload(i);
    const done = () => {
      if (mode !== 'book') {view.removeAttribute('aria-busy');return;}
      if (current !== i) return;
      if (variants) bookImg.srcset = srcsetFor(i);
      bookImg.src = srcFor(i);
      bookImg.dataset.page = String(i);
      view.removeAttribute('aria-busy');
    };
    (img.decode ? img.decode() : Promise.resolve()).then(done, done);
    preload(i + 1);preload(i - 1);
  }
  function setMode(next) {
    mode = next;
    $('text-view').hidden = mode !== 'text';
    $('book-view').hidden = mode !== 'book';
    $('mode-text').setAttribute('aria-pressed', String(mode === 'text'));
    $('mode-book').setAttribute('aria-pressed', String(mode === 'book'));
    $('font-size').disabled = mode !== 'text';
    root.classList.toggle('is-book', mode === 'book');
    if (mode === 'book') setBookImage(current);
    root.dispatchEvent(new CustomEvent('poradnik:mode', {detail: mode}));
  }
  $('mode-text').addEventListener('click', () => {setMode('text');closeSettings(true);});
  $('mode-book').addEventListener('click', () => {setMode('book');closeSettings(true);scrollToCurrent();});
  $('back-to-text').addEventListener('click', () => {setMode('text');scrollToCurrent();chapters[current].querySelector('h2').focus({preventScroll: true});});
  // Przesunięcie palcem w bok zmienia stronę; zwykłe dotknięcie otwiera powiększenie.
  let swipe = null, swiped = false;
  $('book-zoom').addEventListener('pointerdown', e => {swipe = e.isPrimary ? {x: e.clientX, y: e.clientY} : null;swiped = false;});
  $('book-zoom').addEventListener('pointerup', e => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {swiped = true;step(dx < 0 ? 1 : -1);}
  });

  /* ---------- Powiększenie strony ---------- */
  const dialog = $('page-dialog');
  const zoomImg = $('zoom-image'), zoomCanvas = $('zoom-canvas');
  const zoomReady = () => zoomCanvas.removeAttribute('aria-busy');
  zoomImg.addEventListener('load', zoomReady);
  zoomImg.addEventListener('error', zoomReady);
  function setZoomImage(i) {
    const src = `${pageBase(i)}.webp`;
    if (!zoomImg.src.endsWith(src) || !zoomImg.complete) zoomCanvas.setAttribute('aria-busy', 'true');
    zoomImg.src = src;
    if (zoomImg.complete) zoomReady();
    zoomImg.alt = `Strona ${i + 1} z ${N}: ${titles[i]}`;
    $('zoom-title').textContent = `Strona ${i + 1} z ${N}`;
    $('zoom-prev').disabled = i === 0;
    $('zoom-next').disabled = i === N - 1;
    // Fokus na wyłączonym przycisku przepadłby na <body>: przenosimy go na "Zamknij".
    const a = document.activeElement;
    if (dialog.open && (!a || a === document.body || a.disabled)) $('zoom-close').focus();
    [i - 1, i + 1].forEach(k => {if (k >= 0 && k < N) {const im = new Image();im.src = `${pageBase(k)}.webp`;}});
  }
  function setZoom(zoomed, point) {
    const canvas = $('zoom-canvas');
    canvas.classList.toggle('is-zoomed', zoomed);
    $('zoom-toggle').textContent = zoomed ? 'Zmniejsz' : 'Powiększ';
    if (zoomed && point) {
      const img = $('zoom-image');
      canvas.scrollLeft = point.x * img.offsetWidth - canvas.clientWidth / 2;
      canvas.scrollTop = point.y * img.offsetHeight - canvas.clientHeight / 2;
    } else {canvas.scrollTop = 0;canvas.scrollLeft = 0;}
  }
  $('book-zoom').addEventListener('click', () => {
    if (swiped) {swiped = false;return;}
    if (typeof dialog.showModal !== 'function') {window.open(`${pageBase(current)}.webp`, '_blank', 'noopener');return;}
    setZoomImage(current);setZoom(false);
    dialog.showModal();
    document.body.classList.add('guide-zoom-open');
    $('zoom-close').focus();
  });
  $('zoom-image').addEventListener('click', e => {
    const r = e.currentTarget.getBoundingClientRect();
    setZoom(!$('zoom-canvas').classList.contains('is-zoomed'), {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height});
  });
  $('zoom-toggle').addEventListener('click', () => setZoom(!$('zoom-canvas').classList.contains('is-zoomed'), {x: 0.5, y: 0.25}));
  const zoomStep = delta => {
    const i = current + delta;
    if (i < 0 || i >= N) return;
    navigate(i, {focus: false, scroll: false});
    setZoomImage(i);setZoom(false);
  };
  $('zoom-prev').addEventListener('click', () => zoomStep(-1));
  $('zoom-next').addEventListener('click', () => zoomStep(1));
  $('zoom-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {if (event.target === dialog) dialog.close();});
  dialog.addEventListener('close', () => {document.body.classList.remove('guide-zoom-open');if (mode === 'book') scrollToCurrent();});

  /* ---------- Klawiatura ---------- */
  document.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (dialog.open) {
      // W oknie podglądu strzałki zmieniają stronę (poza powiększeniem, gdzie przewijają obraz).
      if (zoomCanvas.classList.contains('is-zoomed')) return;
      if (event.key === 'ArrowRight') {event.preventDefault();zoomStep(1);}
      if (event.key === 'ArrowLeft') {event.preventDefault();zoomStep(-1);}
      return;
    }
    if (event.shiftKey) return;
    if (event.key === 'Escape' && document.body.classList.contains('guide-focused') && !settings.open) {
      setFocusMode(false);$('focus-reader').focus();return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const t = event.target;
    // <main tabindex="-1"> dostaje fokus po kliknięciu w tekst i po linku pomijania: to też czytnik.
    const inReader = t === document.body || t === html || t.tagName === 'MAIN' || (t.closest && t.closest('.reader-main'));
    if (!inReader || (t.closest && t.closest('input, select, textarea, [contenteditable="true"], .reader-settings, .audio-bar, .web-extra'))) return;
    event.preventDefault();
    step(event.key === 'ArrowRight' ? 1 : -1);
  });

  /* ---------- Wyszukiwarka ---------- */
  const searchInput = $('guide-search');
  let searchTimer = 0;
  // Proste dopasowanie odmiany: końcowa samogłoska odpada ("woda" znajdzie "wody", "latarka" "latarkę"),
  // a rdzeń musi zaczynać słowo w tekście.
  const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stem = w => (/[aeiouy]$/.test(w) && w.length > 3 ? w.slice(0, -1) : w);
  const patterns = words => words.map(w => new RegExp('(^|[^a-z0-9])' + esc(stem(w)) + '[a-z0-9]*'));
  const hits = (re, text) => (text.match(new RegExp(re.source, 'g')) || []).length;
  function excerpt(i, res) {
    const box = toc[i].querySelector('.search-excerpt');
    box.textContent = '';
    if (!res.length) return;
    const text = findTexts[i], m = res[0].exec(normal(text));
    if (!m) return; // trafienie tylko w tytule
    const pos = m.index + m[1].length, len = m[0].length - m[1].length;
    const from = Math.max(0, pos - 40), to = Math.min(text.length, pos + len + 70);
    box.append((from > 0 ? '…' : '') + text.slice(from, pos));
    const mark = document.createElement('mark');
    mark.textContent = text.slice(pos, pos + len);
    box.append(mark, text.slice(pos + len, to) + (to < text.length ? '…' : ''));
  }
  function search() {
    // Interpunkcja z klawiatury telefonu ("gaz.", "woda,") nie może blokować wyników.
    const words = normal(searchInput.value).replace(/[^a-z0-9\s-]+/g, ' ').split(/\s+/).filter(Boolean);
    const res = patterns(words);
    let count = 0, first = -1, best = -1;
    toc.forEach((link, i) => {
      const found = res.every(r => r.test(searchable[i]));
      link.hidden = !found;
      if (found) {
        count++;
        // Enter otwiera stronę najlepiej pasującą: tytuł, potem nagłówki i numery, potem liczba trafień.
        const score = res.reduce((sum, r) => sum + (r.test(normal(titles[i])) ? 1000 : 0) + hits(r, heads[i]) * 20 + hits(r, searchable[i]), 0);
        if (score > best) {best = score;first = i;}
      }
      excerpt(i, found ? res : []);
    });
    // Sam numer ("112", "991") to pytanie o telefon: Enter otwiera listę ważnych telefonów.
    // (co najmniej 3 cyfry: "3" ma pierwszeństwo w tytule "Zapas na co najmniej 3 dni").
    const phones = chapters.findIndex(c => c.id === 'wazne-telefony');
    if (words.length && best < 1000 && words.every(w => /^\d{3,}$/.test(w)) && phones >= 0 && !toc[phones].hidden) first = phones;
    $('clear-search').hidden = !words.length;
    if (words.length && !$('reader-toc').open) $('reader-toc').open = true;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const msg = !words.length ? '' : count === 0
        ? 'Nic nie znaleziono. Spróbuj innego słowa, np. "prąd". Polskie litery nie są konieczne.'
        : count === 1 ? 'Znaleziono na 1 stronie. Naciśnij Enter albo wybierz ją z listy.' : `Znaleziono na ${count} stronach. Wybierz stronę z listy.`;
      if ($('search-status').textContent !== msg) $('search-status').textContent = msg;
    }, 700);
    // Puste pole (albo sama interpunkcja): Enter nie zmienia strony.
    return words.length ? first : -1;
  }
  searchInput.addEventListener('input', search);
  searchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const first = search();
      if (first >= 0) navigate(first);
    }
    if (event.key === 'Escape' && searchInput.value) {event.preventDefault();searchInput.value = '';search();}
  });
  $('clear-search').addEventListener('click', () => {searchInput.value = '';search();searchInput.focus();});

  /* ---------- Start ---------- */
  applyFont();
  const startHash = indexFromHash(location.hash);
  const start = startHash >= 0 ? startHash : (history.state && Number.isInteger(history.state.chapter) ? history.state.chapter : 1);
  showPage(start, {keepTitle: startHash < 0});
  try {history.replaceState(Object.assign({}, history.state, {chapter: start}), '');} catch (_) { /* brak History API */ }
  root.querySelector('.reader-layout').classList.add('is-ready');
  setOffsets();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(setOffsets);
    if (dock) ro.observe(dock);
    if (gora) ro.observe(gora);
  } else window.addEventListener('resize', setOffsets);
  // Przy wejściu z linku do strony przeglądarka sama przewija do kotwicy; poprawiamy tylko przesunięcie pod paski.
  if (startHash >= 0) {
    window.addEventListener('load', () => {
      let id = location.hash.slice(1);
      try {id = decodeURIComponent(id);} catch (_) { /* surowe */ }
      const el = document.getElementById(id) || chapters[current];
      const top = el.getBoundingClientRect().top;
      if (Math.abs(top - stickyOffset()) < 200) jumpTo(top + window.pageYOffset - stickyOffset());
    }, {once: true});
  }
  if (document.body.classList.contains('guide-focused')) $('focus-reader').setAttribute('aria-pressed', 'true');

  window.KGWPoradnik = {
    chapters,
    titles,
    blocksOf,
    selector: SEL,
    current: () => current,
    mode: () => mode,
    navigate,
    stickyOffset,
    announce
  };
  root.dispatchEvent(new CustomEvent('poradnik:ready'));
})();
