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
  const settings = {read(key) {try {return localStorage.getItem('kgw-poradnik-' + key);} catch (_) {return null;}}, write(key, value) {try {localStorage.setItem('kgw-poradnik-' + key, value);return true;} catch (_) {return false;}}};
  let bookmark = chapters.findIndex(el => el.id === settings.read('bookmark'));
  function updateBookmark() {
    $('save-page').setAttribute('aria-pressed', String(bookmark === current));
    $('save-page').textContent = bookmark === current ? 'Zakładka zapisana' : 'Zapisz zakładkę';
    $('resume-reading').hidden = bookmark < 0;
    if (bookmark >= 0) {$('resume-reading').href = '#' + chapters[bookmark].id;$('resume-reading').textContent = 'Twoja zakładka: ' + titles[bookmark];}
  }
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
    $('dock-title').textContent = titles[current];
    $('reading-time').textContent = `Około ${Math.max(1,Math.ceil(words[current].split(/\s+/).length/180))} min czytania`;
    $('reader-feedback').textContent = '';
    $('share-fallback').hidden = true;
    updateBookmark();
    chapters.forEach((chapter, i) => {chapter.hidden = i !== current;});
    toc.forEach((link, i) => {if (i === current) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');});
    $('chapter-status').textContent = `Strona ${current + 1} z ${chapters.length}`;
    $('page-select').value = String(current);
    $('read-progress').style.width = `${(current + 1) / chapters.length * 100}%`;
    $('prev-chapter').disabled = current === 0;
    $('next-chapter').disabled = current === chapters.length - 1;
    $('quick-prev').disabled = current === 0;
    $('quick-next').disabled = current === chapters.length - 1;
    const pageImage = `/poradnik/strona-${String(current + 1).padStart(2, '0')}.webp`;
    $('book-page').src = pageImage;
    $('book-page').alt = `Strona ${current + 1}: ${titles[current]}. Pełna treść dostępna w trybie Czytaj tekst.`;
    if (moveFocus && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
      (mode === 'text' ? chapters[current] : $('book-page')).animate([{opacity:.35,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:260,easing:'ease-out'});
    }
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
  $('quick-prev').addEventListener('click', () => navigate(current - 1));
  $('quick-next').addEventListener('click', () => navigate(current + 1));
  $('save-page').addEventListener('click', () => {
    if (bookmark === current) {if (settings.write('bookmark','')) {bookmark=-1;updateBookmark();$('reader-feedback').textContent='Zakładka usunięta.';}return;}
    if (settings.write('bookmark',chapters[current].id)) {bookmark=current;updateBookmark();$('reader-feedback').textContent='Wrócisz tutaj z przycisku na początku poradnika.';}
    else $('reader-feedback').textContent='Przeglądarka blokuje zapis. Możesz skopiować link do rozdziału.';
  });
  $('resume-reading').addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();if(bookmark>=0)navigate(bookmark);});
  $('share-page').addEventListener('click',async()=>{
    const url=new URL(location.href);url.hash=chapters[current].id;
    try {await navigator.clipboard.writeText(url.href);$('reader-feedback').textContent='Link skopiowany. Możesz przesłać go bliskim.';}
    catch (_) {$('share-fallback').value=url.href;$('share-fallback').hidden=false;$('share-fallback').focus();$('share-fallback').select();$('reader-feedback').textContent='Skopiuj zaznaczony adres.';}
  });
  function setFocus(active) {
    document.body.classList.toggle('guide-focused',active);
    $('focus-reader').setAttribute('aria-pressed',String(active));
    $('focus-reader').textContent=active?'Wróć do strony':'Tryb skupienia';
    $('czytelnia').scrollIntoView({block:'start',behavior:'instant'});
  }
  $('focus-reader').addEventListener('click',()=>setFocus(!document.body.classList.contains('guide-focused')));
  const dialog=$('page-dialog');
  $('book-zoom').addEventListener('click',()=>{
    $('zoom-image').src=$('book-page').src;$('zoom-image').alt=$('book-page').alt;
    $('zoom-title').textContent=`Strona ${current+1} / 16`;
    setZoom(false);dialog.showModal();document.body.classList.add('guide-zoom-open');$('zoom-close').focus();
  });
  function setZoom(zoomed) {
    $('zoom-canvas').classList.toggle('is-zoomed',zoomed);$('zoom-toggle').setAttribute('aria-pressed',String(zoomed));
    $('zoom-toggle').textContent=zoomed?'Dopasuj stronę':'Powiększ';$('zoom-canvas').scrollTop=0;$('zoom-canvas').scrollLeft=0;
  }
  $('zoom-toggle').addEventListener('click',()=>setZoom(!$('zoom-canvas').classList.contains('is-zoomed')));
  $('zoom-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>document.body.classList.remove('guide-zoom-open'));
  document.addEventListener('keydown',event=>{
    if (dialog.open || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key==='Escape' && document.body.classList.contains('guide-focused')) {setFocus(false);$('focus-reader').focus();return;}
    if (event.target.closest('input,select,textarea,[contenteditable=true]') || !event.target.closest('.reader-main'))return;
    if(event.key==='ArrowRight'){event.preventDefault();navigate(current+1);}
    if(event.key==='ArrowLeft'){event.preventDefault();navigate(current-1);}
  });
  $('page-select').addEventListener('change', event => navigate(Number(event.target.value)));
  $('mode-text').addEventListener('click', () => setMode('text'));
  $('mode-book').addEventListener('click', () => setMode('book'));
  $('back-to-text').addEventListener('click', () => {setMode('text');chapters[current].querySelector('h2').focus();});
  function readHash() {const i = chapters.findIndex(el => '#' + el.id === location.hash);if (i >= 0) {showPage(i);return true;}return false;}
  window.addEventListener('hashchange', readHash);
  window.addEventListener('popstate', readHash);
  const sizes = ['', '1.25rem', '1.45rem'];
  const applyFont = () => {root.style.setProperty('--reading-size', sizes[font]);$('font-size').setAttribute('aria-label', `${font ? 'Tekst powiększony. ' : ''}${font === 2 ? 'Przywróć zwykły tekst' : 'Powiększ tekst'}`);$('font-size').title = ['Zwykły tekst', 'Duży tekst', 'Bardzo duży tekst'][font];};
  font = Math.min(2, Math.max(0, Math.floor(Number(settings.read('font'))) || 0));applyFont();
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
