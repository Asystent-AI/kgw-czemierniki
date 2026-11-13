(() => {
  'use strict';
  const root = document.getElementById('poradnik');
  if (!root) return;
  const $ = id => document.getElementById(id);
  const chapters = [...root.querySelectorAll('.guide-chapter')];
  const toc = [...root.querySelectorAll('[data-toc]')];
  const titles = chapters.map(el => el.querySelector('h2').textContent.trim());
  const normal = text => text.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
  const words = chapters.map(el => el.textContent.replace(/\s+/g, ' ').trim());
  const searchText = words.map(normal);
  let current = 0, mode = 'text', font = 0, speechToken = 0, speaking = false;
  let voices = [];
  const synth = window.speechSynthesis;
  const settings = {read(key) {try {return localStorage.getItem('kgw-poradnik-' + key);} catch (_) {return null;}}, write(key, value) {try {localStorage.setItem('kgw-poradnik-' + key, value);} catch (_) {}}};
  const stopSpeech = () => {
    speechToken++;
    speaking = false;
    if (synth) synth.cancel();
    $('stop-audio').hidden = true;
    $('read-aloud').textContent = 'Posłuchaj rozdziału';
    $('audio-status').textContent = synth && !voices.length ? 'Odsłuch wymaga polskiego głosu w przeglądarce lub systemie urządzenia.' : '';
  };
  function showPage(index, moveFocus = false) {
    if (!Number.isInteger(index) || index < 0 || index >= chapters.length) return;
    stopSpeech();
    current = index;
    chapters.forEach((chapter, i) => {chapter.hidden = i !== current;});
    toc.forEach((link, i) => {if (i === current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');});
    $('chapter-status').textContent = `Strona ${current + 1} z ${chapters.length}`;
    $('page-select').value = String(current);
    $('read-progress').style.width = `${(current + 1) / chapters.length * 100}%`;
    $('prev-chapter').disabled = current === 0;
    $('next-chapter').disabled = current === chapters.length - 1;
    const pageImage = `/poradnik/strona-${String(current + 1).padStart(2, '0')}.webp`;
    $('book-page').src = pageImage;
    $('book-page').alt = `Strona ${current + 1}: ${titles[current]}. Pełna treść dostępna w trybie Czytaj tekst.`;
    $('book-zoom').href = pageImage;
    if (moveFocus) {
      $('czytelnia').scrollIntoView({block: 'start', behavior: 'instant'});
      if (mode === 'text') chapters[current].querySelector('h2').focus({preventScroll: true});
      else $('book-zoom').focus({preventScroll: true});
    }
  }
  function navigate(index) {
    if (!Number.isInteger(index) || index < 0 || index >= chapters.length) return;
    history.pushState(null, '', '#' + chapters[index].id);
    showPage(index, true);
  }
  function setMode(next) {
    mode = next;
    $('text-view').hidden = mode !== 'text';
    $('book-view').hidden = mode !== 'book';
    $('mode-text').setAttribute('aria-pressed', String(mode === 'text'));
    $('mode-book').setAttribute('aria-pressed', String(mode === 'book'));
    $('font-size').disabled = mode !== 'text';
  }
  root.querySelectorAll('[data-chapter]').forEach(link => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (matchMedia('(max-width:760px)').matches) root.querySelector('.reader-toc').open = false;
    navigate(Number(link.dataset.chapter));
  }));
  $('prev-chapter').addEventListener('click', () => navigate(current - 1));
  $('next-chapter').addEventListener('click', () => navigate(current + 1));
  $('page-select').addEventListener('change', event => navigate(Number(event.target.value)));
  $('mode-text').addEventListener('click', () => setMode('text'));
  $('mode-book').addEventListener('click', () => setMode('book'));
  $('back-to-text').addEventListener('click', () => {setMode('text');chapters[current].querySelector('h2').focus();});
  function readHash() {const i = chapters.findIndex(el => '#' + el.id === location.hash);if (i >= 0) {showPage(i);return true;}return false;}
  window.addEventListener('hashchange', readHash);
  window.addEventListener('popstate', readHash);
  const sizes = ['', '1.25rem', '1.45rem'];
  const applyFont = () => {root.style.setProperty('--reading-size', sizes[font]);$('font-size').setAttribute('aria-label', `${font ? 'Tekst powiększony. ' : ''}${font === 2 ? 'Przywróć zwykły tekst' : 'Powiększ tekst'}`);$('font-size').title = ['Zwykły tekst', 'Duży tekst', 'Bardzo duży tekst'][font];};
  font = Math.min(2, Math.max(0, Number(settings.read('font')) || 0));applyFont();
  $('font-size').addEventListener('click', () => {font = (font + 1) % sizes.length;applyFont();settings.write('font', String(font));});
  const setTheme = dark => {root.dataset.theme = dark ? 'dark' : 'light';$('reader-theme').textContent = dark ? 'Tryb dzienny' : 'Tryb nocny';$('reader-theme').setAttribute('aria-pressed', String(dark));};
  setTheme(settings.read('theme') === 'dark');
  $('reader-theme').addEventListener('click', () => {const dark = root.dataset.theme !== 'dark';setTheme(dark);settings.write('theme', dark ? 'dark' : 'light');});
  function search() {
    const query = normal($('guide-search').value.trim());let count = 0;
    toc.forEach((link, i) => {
      const pos = searchText[i].indexOf(query);
      const found = !query || pos >= 0;link.hidden = !found;if (found) count++;
      link.querySelector('.search-excerpt').textContent = query && found ? (pos > 35 ? '…' : '') + words[i].slice(Math.max(0, pos - 35), pos + query.length + 65) + '…' : '';
    });
    $('clear-search').hidden = !query;
    $('search-status').textContent = query ? (count ? `Pasujące strony: ${count}. Wybierz rozdział z listy.` : 'Brak wyników. Spróbuj innego słowa.') : '';
  }
  $('guide-search').addEventListener('input', search);
  $('clear-search').addEventListener('click', () => {$('guide-search').value = '';search();$('guide-search').focus();});
  if (synth && 'SpeechSynthesisUtterance' in window) {
    function refreshVoices() {
      voices = synth.getVoices().filter(voice => voice.lang.toLowerCase().startsWith('pl'));
      $('read-aloud').hidden = false;
      $('read-aloud').disabled = voices.length === 0;
      if (!voices.length) $('audio-status').textContent = 'Odsłuch wymaga polskiego głosu w przeglądarce lub systemie urządzenia.';
      else if (!speaking) $('audio-status').textContent = '';
    }
    synth.addEventListener('voiceschanged', refreshVoices);
    refreshVoices();
    $('stop-audio').addEventListener('click', stopSpeech);
    $('read-aloud').addEventListener('click', () => {
      if (speaking) {if (synth.paused) {synth.resume();$('read-aloud').textContent = 'Wstrzymaj';} else {synth.pause();$('read-aloud').textContent = 'Wznów';}return;}
      stopSpeech();
      const voice = voices.find(v => v.localService) || voices[0];
      if (!voice) return;
      const chunks = words[current].match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [words[current]];
      const token = speechToken;let position = 0;speaking = true;
      $('stop-audio').hidden = false;$('read-aloud').textContent = 'Wstrzymaj';
      $('audio-status').textContent = 'Czyta głos urządzenia. Możesz zatrzymać odsłuch w dowolnej chwili.';
      function nextChunk() {
        if (token !== speechToken) return;
        if (position >= chunks.length) {stopSpeech();return;}
        const utterance = new SpeechSynthesisUtterance(chunks[position++]);utterance.lang = 'pl-PL';utterance.voice = voice;utterance.rate = .95;
        utterance.onend = nextChunk;
        utterance.onerror = event => {if (token !== speechToken || event.error === 'interrupted' || event.error === 'canceled') return;stopSpeech();$('audio-status').textContent = 'Odsłuch jest niedostępny. Możesz czytać tekst lub pobrać poradnik.';};
        synth.speak(utterance);
      }
      nextChunk();
    });
    window.addEventListener('pagehide', stopSpeech);
  }
  // All chapters remain readable if JavaScript is unavailable.
  root.querySelectorAll('.js-control').forEach(el => {el.hidden = false;});
  if (matchMedia('(max-width:760px)').matches) root.querySelector('.reader-toc').open = false;
  if (!readHash()) showPage(1);
  else requestAnimationFrame(() => $('czytelnia').scrollIntoView({block: 'start', behavior: 'instant'}));
})();
