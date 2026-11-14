(() => {
  'use strict';
  // Lektor (nagrania z podświetlaniem czytanego fragmentu), syreny RCB, metronom
  // uciśnięć i kalkulator wody. Czytnik (poradnik.js) udostępnia window.KGWPoradnik.
  // Zasada: dźwięk startuje wyłącznie po kliknięciu i gra tylko jedno źródło naraz.
  const root = document.getElementById('poradnik');
  const api = window.KGWPoradnik;
  if (!root || !api) return;
  const $ = id => document.getElementById(id);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mmss = s => {s = Math.max(0, Math.floor(s || 0));return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;};
  const few = n => n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20);
  const plural = (n, one, some, many) => n === 1 ? one : few(n) ? some : many;
  const spoken = s => {
    s = Math.max(0, Math.round(s || 0));
    const m = Math.floor(s / 60), r = s % 60;
    const ms = m ? `${m} ${plural(m, 'minuta', 'minuty', 'minut')}` : '';
    const rs = r || !m ? `${r} ${plural(r, 'sekunda', 'sekundy', 'sekund')}` : '';
    return [ms, rs].filter(Boolean).join(' ');
  };
  const track = (name, data) => {try {if (window.umami && window.umami.track) window.umami.track(name, data);} catch (_) { /* statystyki są opcjonalne */ }};
  const exclusive = source => root.dispatchEvent(new CustomEvent('poradnik:sound', {detail: source}));
  const onOther = (source, stop) => root.addEventListener('poradnik:sound', e => {if (e.detail !== source) stop();});
  const AC = window.AudioContext || window.webkitAudioContext;
  let sharedCtx = null;
  const audioContext = () => {
    if (!AC) return null;
    if (!sharedCtx) {try {sharedCtx = new AC();} catch (_) {return null;}}
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => { /* bez dźwięku */ });
    return sharedCtx;
  };

  /* ====================================================================== */
  /* Lektor                                                                 */
  /* ====================================================================== */
  const dataEl = $('poradnik-audio-data');
  let manifest = null;
  try {manifest = dataEl ? JSON.parse(dataEl.textContent) : null;} catch (_) {manifest = null;}
  const bar = $('audio-bar');
  if (manifest && Array.isArray(manifest.chapters) && bar) initLektor(manifest);

  function initLektor(m) {
    const chapters = api.chapters, N = chapters.length;
    const tracks = chapters.map((_, i) => m.chapters.find(c => c.index === i) || null);
    const blocks = chapters.map(ch => api.blocksOf(ch));
    // Strażnik zgodności: gdy treść strony zmieniła się po nagraniu, gra bez podświetlania.
    const canLight = tracks.map((t, i) => !!t && (!t.blocks || t.blocks === blocks[i].length));
    const audio = new Audio();
    audio.preload = 'none';
    const play = $('ab-play'), seek = $('ab-seek'), rateSel = $('ab-rate'), autoBox = $('ab-auto'), followBox = $('ab-follow');
    const abStatus = $('ab-status');
    const KEY = 'kgw-poradnik-lektor';
    let saved = {};
    try {saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {};} catch (_) {saved = {};}
    saved.pos = saved.pos && typeof saved.pos === 'object' ? saved.pos : {};
    const RATES = [0.8, 1, 1.25, 1.5];
    let rate = RATES.indexOf(saved.rate) >= 0 ? saved.rate : 1;
    let auto = saved.auto === true, follow = saved.follow !== false;
    let ch = -1, seg = -1, lit = [], raf = 0, userScroll = 0, autoScrollUntil = 0, lastSave = 0, seeking = false, lastAria = -1, prefetched = -1, advanceTimer = 0, pendingJump = null;
    const persist = () => {try {localStorage.setItem(KEY, JSON.stringify(saved));} catch (_) { /* tryb prywatny */ }};
    const posOf = i => {const t = tracks[i];const p = t ? Number(saved.pos[t.slug]) || 0 : 0;return t && p > 5 && p < t.duration - 5 ? p : 0;};
    function savePos(force) {
      // Bez metadanych (np. po błędzie wczytania) currentTime = 0 skasowałby punkt wznowienia.
      if (ch < 0 || audio.readyState < 1 || (!force && Date.now() - lastSave < 5000)) return;
      lastSave = Date.now();
      saved.pos[tracks[ch].slug] = audio.ended ? 0 : Math.round(audio.currentTime * 10) / 10;
      saved.rate = rate;saved.auto = auto;saved.follow = follow;saved.last = tracks[ch].slug;
      persist();
    }
    const setStatus = text => {if (abStatus.textContent !== text) api.announce(abStatus, text);};
    const engaged = () => ch >= 0 && !bar.hidden;
    const titleOf = i => `Strona ${i + 1}: ${api.titles[i]}`;
    // Kropka tylko wtedy, gdy tytuł nie kończy się już znakiem interpunkcyjnym ("Sąsiedzi!").
    const sentence = t => (/[.!?…]$/.test(t) ? t : t + '.');
    // Te same zaokrąglenia co widoczny licznik (sekundy w dół) i napis na karcie (całość zaokrąglona).
    const valueText = (t, d) => `${spoken(Math.floor(t))}, całość: ${spoken(Math.round(d))}`;
    const failed = () => !!audio.error;

    /* --- przyciski w treści i w pasku czytnika --- */
    function paintButtons() {
      const playing = !audio.paused && !audio.ended && !failed();
      root.querySelectorAll('.listen-btn[data-listen]').forEach(btn => {
        const v = btn.dataset.listen;
        const i = v === 'all' ? -2 : Number(v);
        const label = btn.querySelector('.listen-label');
        if (i === -2) {
          const on = playing && auto;
          btn.classList.toggle('is-playing', on);
          if (label) label.textContent = on ? 'Wstrzymaj lektora' : 'Posłuchaj całego poradnika';
          return;
        }
        const mine = i === ch;
        btn.classList.toggle('is-playing', mine && playing);
        let text = 'Posłuchaj tej strony';
        if (mine && playing) text = 'Wstrzymaj';
        else if (mine && audio.ended) text = 'Posłuchaj jeszcze raz';
        else if (mine && audio.currentTime > 1) text = `Wznów od ${mmss(audio.currentTime)}`;
        else if (!mine && posOf(i)) text = `Wznów od ${mmss(posOf(i))}`;
        if (label) label.textContent = text;
      });
      const dockBtn = $('dock-listen');
      if (dockBtn) {
        const mine = ch === api.current();
        dockBtn.classList.toggle('is-playing', mine && playing);
        dockBtn.querySelector('.sr-only').textContent = mine && playing ? 'Wstrzymaj lektora' : 'Posłuchaj tej strony';
        dockBtn.hidden = !tracks[api.current()];
      }
      play.classList.toggle('is-playing', playing);
      $('ab-play-label').textContent = playing ? 'Wstrzymaj' : 'Odtwórz';
    }

    /* --- podświetlanie czytanego fragmentu --- */
    function clearLit() {lit.forEach(el => el.classList.remove('is-reading'));lit = [];}
    function segmentAt(t) {
      const s = tracks[ch] ? tracks[ch].segments : [];
      let lo = 0, hi = s.length - 1, r = s.length ? 0 : -1;
      while (lo <= hi) {const mid = (lo + hi) >> 1;if (s[mid][0] <= t + 0.05) {r = mid;lo = mid + 1;} else hi = mid - 1;}
      return r;
    }
    function inView(el) {
      const r = el.getBoundingClientRect();
      const top = api.stickyOffset(), bottom = (bar.hidden ? innerHeight : bar.getBoundingClientRect().top) - 16;
      return r.top >= top && r.bottom <= bottom;
    }
    function followText(el) {
      if (!follow || !el || audio.paused || ch !== api.current() || api.mode() !== 'text' || Date.now() - userScroll < 4000) return;
      if (inView(el)) return;
      // Czytelnik przewinął poza czytaną stronę (np. do plików do pobrania): nie ściągamy go z powrotem.
      const box = chapters[ch].getBoundingClientRect();
      if (box.bottom < api.stickyOffset() || box.top > innerHeight) return;
      const top = api.stickyOffset();
      const room = (bar.hidden ? innerHeight : bar.getBoundingClientRect().top) - top;
      const y = el.getBoundingClientRect().top + window.pageYOffset - top - Math.max(0, room * 0.2);
      autoScrollUntil = Date.now() + 1500;
      window.scrollTo({top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth'});
    }
    function light(index, force) {
      if (index === seg && !force) return;
      seg = index;
      clearLit();
      const s = tracks[ch] && tracks[ch].segments[index];
      if (!s || !canLight[ch]) return;
      lit = s[2].map(b => blocks[ch][b]).filter(Boolean);
      lit.forEach(el => el.classList.add('is-reading'));
      followText(lit[0]);
    }
    // Jedna klatka widoku; pętla (loop) działa tylko w czasie odtwarzania i zawsze jest jedna.
    function tick() {
      if (ch < 0 || bar.hidden) return;
      const t = audio.currentTime;
      if (!audio.ended) light(segmentAt(t));
      if (!seeking) {
        seek.value = String(t);
        $('ab-time').textContent = mmss(t);
        const sec = Math.floor(t);
        if (sec !== lastAria) {lastAria = sec;seek.setAttribute('aria-valuetext', valueText(t, tracks[ch].duration));}
      }
      if (auto && prefetched !== ch && ch < N - 1 && tracks[ch + 1] && t > tracks[ch].duration * 0.8) {
        prefetched = ch;
        try {fetch(tracks[ch + 1].file, {priority: 'low'}).catch(() => {});} catch (_) { /* bez wstępnego pobrania */ }
      }
      savePos(false);
    }
    function loop() {
      tick();
      raf = !audio.paused && !audio.ended && !failed() && !bar.hidden ? requestAnimationFrame(loop) : 0;
    }

    /* --- wczytanie i odtwarzanie --- */
    function artworkFor(i) {
      const src = chapters[i].dataset.art || '/poradnik/okladka-512.jpg';
      return [{src: new URL(src, location.href).href, sizes: '512x512', type: 'image/jpeg'}];
    }
    function positionState() {
      if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || !Number.isFinite(audio.duration)) return;
      try {navigator.mediaSession.setPositionState({duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration)});} catch (_) { /* starsze przeglądarki */ }
    }
    function load(i) {
      const t = tracks[i];
      if (!t) return false;
      if (ch === i && !failed()) return true;
      if (ch === i) {audio.src = t.file;return true;} // po błędzie sieci wczytaj plik od nowa
      if (ch >= 0) {savePos(true);chapters[ch].classList.remove('lektor-active');}
      if (pendingJump) {audio.removeEventListener('loadedmetadata', pendingJump);pendingJump = null;}
      ch = i;seg = -1;lastAria = -1;
      clearLit();
      audio.preload = 'auto';
      audio.src = t.file;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      chapters[i].classList.add('lektor-active');
      $('ab-title').textContent = titleOf(i);
      $('ab-total').textContent = mmss(Math.round(t.duration));
      $('ab-time').textContent = '0:00';
      seek.max = String(t.duration);
      seek.value = '0';
      seek.setAttribute('aria-valuetext', valueText(0, t.duration));
      const dl = $('ab-download');
      dl.href = t.file;
      dl.querySelector('span').textContent = `(MP3, ${(t.bytes / 1048576).toFixed(1).replace('.', ',')} MB)`;
      $('ab-next').hidden = true;
      if ('mediaSession' in navigator && window.MediaMetadata) {
        try {navigator.mediaSession.metadata = new MediaMetadata({title: titleOf(i), artist: 'Koło Gospodyń Wiejskich Czemierniki', album: 'Czemierniki trzymają się razem!', artwork: artworkFor(i)});} catch (_) { /* bez metadanych */ }
      }
      return true;
    }
    function openBar() {
      if (!bar.hidden) return;
      bar.hidden = false;
      document.body.classList.add('audio-open');
      setBarHeight();
    }
    function start(i, at) {
      clearTimeout(advanceTimer);
      // Ponowna próba po błędzie: ponowne wczytanie pliku zeruje pozycję, więc wracamy do miejsca przerwania.
      if (ch === i && failed() && !Number.isFinite(at)) at = audio.currentTime > 1 ? audio.currentTime : posOf(i);
      if (!load(i)) return;
      openBar();
      exclusive('lektor');
      if (Number.isFinite(at)) {
        if (pendingJump) {audio.removeEventListener('loadedmetadata', pendingJump);pendingJump = null;}
        const jump = () => {pendingJump = null;try {audio.currentTime = at;} catch (_) { /* metadane jeszcze się wczytują */ }};
        if (audio.readyState >= 1) jump(); else {pendingJump = jump;audio.addEventListener('loadedmetadata', jump, {once: true});}
      }
      const p = audio.play();
      if (p && p.catch) p.catch(err => {
        paintButtons();
        if (err && err.name === 'NotAllowedError') setStatus('Naciśnij przycisk odtwarzania, aby posłuchać.');
      });
      track('lektor-start', {strona: i + 1});
    }
    function toggle(i) {
      if (!tracks[i]) return;
      if (ch === i && !audio.paused && !audio.ended && !failed()) {audio.pause();return;}
      if (ch === i) {start(i, audio.ended ? 0 : undefined);return;}
      start(i, posOf(i));
    }
    function closeBar() {
      clearTimeout(advanceTimer);
      audio.pause();
      cancelAnimationFrame(raf);raf = 0;
      savePos(true);
      clearLit();seg = -1;
      bar.hidden = true;
      bar.removeAttribute('aria-busy');
      $('ab-panel').hidden = true;
      $('ab-more').setAttribute('aria-expanded', 'false');
      document.body.classList.remove('audio-open');
      if (ch >= 0) chapters[ch].classList.remove('lektor-active');
      paintButtons();
      const btn = chapters[api.current()].querySelector('.listen-btn');
      if (btn) btn.focus({preventScroll: true});
    }
    function goNextPage() {
      if (ch < 0 || ch >= N - 1 || !tracks[ch + 1]) return;
      const next = ch + 1;
      const followPage = api.current() === ch;
      if (followPage) {
        autoScrollUntil = Date.now() + 1500;
        api.navigate(next, {history: 'replace', focus: false, scroll: follow && Date.now() - userScroll > 4000, source: 'lektor'});
      }
      start(next, 0);
      setStatus(sentence(`Czyta lektor: ${titleOf(next)}`));
    }

    /* --- obsługa przycisków --- */
    root.addEventListener('click', e => {
      const btn = e.target.closest('.listen-btn[data-listen]');
      if (!btn) return;
      e.preventDefault();
      if (btn.dataset.listen === 'all') {
        if (!audio.paused && auto && !failed()) {audio.pause();return;}
        auto = true;autoBox.checked = true;savePos(true);
        const from = ch >= 0 && !audio.ended && (failed() || audio.currentTime > 1) ? ch : 0;
        // Także dla bieżącej strony: przewija do tekstu, żeby śledzenie lektora miało co pokazywać.
        api.navigate(from, {focus: false, source: 'lektor'});
        if (from === ch) start(ch); else start(from, 0);
        return;
      }
      toggle(Number(btn.dataset.listen));
    });
    const dockBtn = $('dock-listen');
    if (dockBtn) dockBtn.addEventListener('click', () => toggle(api.current()));
    play.addEventListener('click', () => {
      if (!audio.paused && !audio.ended && !failed()) audio.pause();
      else start(ch < 0 ? api.current() : ch, audio.ended ? 0 : undefined);
    });
    const jumpBy = d => {if (ch < 0) return;audio.currentTime = Math.min(Math.max(0, audio.currentTime + d), tracks[ch].duration - 0.2);tick();};
    $('ab-back').addEventListener('click', () => jumpBy(-10));
    $('ab-fwd').addEventListener('click', () => jumpBy(10));
    const toSegment = d => {
      if (ch < 0) return;
      const s = tracks[ch].segments;
      let k = segmentAt(audio.currentTime);
      // "Poprzedni" w pierwszych 2 s fragmentu cofa do wcześniejszego, później na początek bieżącego
      if (d < 0 && audio.currentTime - s[Math.max(0, k)][0] > 2) d = 0;
      k = Math.min(s.length - 1, Math.max(0, k + d));
      audio.currentTime = s[k][0] + 0.01;
      tick();
    };
    $('ab-prev-par').addEventListener('click', () => toSegment(-1));
    $('ab-next-par').addEventListener('click', () => toSegment(1));
    rateSel.value = String(rate);
    rateSel.addEventListener('change', () => {
      rate = Number(rateSel.value) || 1;
      audio.defaultPlaybackRate = rate;audio.playbackRate = rate;
      savePos(true);positionState();
    });
    autoBox.checked = auto;
    autoBox.addEventListener('change', () => {auto = autoBox.checked;savePos(true);paintButtons();});
    followBox.checked = follow;
    followBox.addEventListener('change', () => {follow = followBox.checked;savePos(true);if (follow) {userScroll = 0;followText(lit[0]);}});
    $('ab-close').addEventListener('click', closeBar);
    $('ab-more').addEventListener('click', () => {
      const open = $('ab-panel').hidden;
      $('ab-panel').hidden = !open;
      $('ab-more').setAttribute('aria-expanded', String(open));
      setBarHeight();
    });
    $('ab-show').addEventListener('click', () => {
      if (ch < 0) return;
      userScroll = 0;
      autoScrollUntil = Date.now() + 1500;
      if (api.current() !== ch) api.navigate(ch, {focus: false, source: 'lektor'});
      if (api.mode && api.mode() !== 'text') return;
      const el = lit[0] || chapters[ch];
      requestAnimationFrame(() => {
        const y = el.getBoundingClientRect().top + window.pageYOffset - api.stickyOffset() - 40;
        autoScrollUntil = Date.now() + 1500;
        window.scrollTo({top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth'});
      });
    });
    // Chipy znikają po użyciu: fokus przechodzi na przycisk odtwarzania, a nie na <body>.
    $('ab-next').addEventListener('click', () => {play.focus();goNextPage();});
    $('ab-retry').addEventListener('click', () => {
      play.focus();
      $('ab-retry').hidden = true;
      if (ch >= 0) start(ch);
    });
    seek.addEventListener('input', () => {
      seeking = true;
      const v = Number(seek.value);
      $('ab-time').textContent = mmss(v);
      seek.setAttribute('aria-valuetext', valueText(v, Number(seek.max)));
    });
    seek.addEventListener('change', () => {seeking = false;audio.currentTime = Number(seek.value);tick();});

    /* --- zdarzenia nagrania --- */
    audio.addEventListener('play', () => {
      paintButtons();
      cancelAnimationFrame(raf);raf = requestAnimationFrame(loop);
      if (document.activeElement === $('ab-next')) play.focus();
      $('ab-next').hidden = true;
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    });
    audio.addEventListener('playing', () => {
      setStatus(sentence(`Czyta lektor: ${titleOf(ch)}`));
      bar.removeAttribute('aria-busy');
      $('ab-retry').hidden = true;
      positionState();
    });
    audio.addEventListener('canplay', () => bar.removeAttribute('aria-busy'));
    audio.addEventListener('pause', () => {
      cancelAnimationFrame(raf);raf = 0;
      bar.removeAttribute('aria-busy');
      paintButtons();savePos(true);
      if (!audio.ended && !failed()) setStatus('Wstrzymano.');
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
      positionState();
    });
    audio.addEventListener('waiting', () => {bar.setAttribute('aria-busy', 'true');setStatus('Wczytuję nagranie…');});
    audio.addEventListener('ratechange', positionState);
    audio.addEventListener('seeked', () => {positionState();if (engaged() && !audio.ended) light(segmentAt(audio.currentTime), true);});
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      // Po błędzie przeglądarka potrafi zostawić paused === false: bez tego zmiana strony włączałaby lektora.
      if (!audio.paused) audio.pause();
      cancelAnimationFrame(raf);raf = 0;
      bar.removeAttribute('aria-busy');
      paintButtons();
      $('ab-retry').hidden = false;
      setStatus(navigator.onLine === false
        ? 'Brak internetu. Pobrany wcześniej PDF lub tekst przeczytasz bez połączenia.'
        : 'Nie udało się wczytać nagrania. Sprawdź internet i spróbuj ponownie.');
    });
    audio.addEventListener('ended', () => {
      cancelAnimationFrame(raf);raf = 0;
      clearLit();seg = -1;
      savePos(true);
      paintButtons();
      track('lektor-koniec', {strona: ch + 1});
      if (ch === N - 1) {setStatus('To już cały poradnik. Dziękujemy za wysłuchanie.');return;}
      if (auto && tracks[ch + 1]) {
        setStatus(sentence(`Koniec strony ${ch + 1}. Za chwilę strona ${ch + 2}: ${api.titles[ch + 1]}`));
        advanceTimer = setTimeout(goNextPage, 1500);
        return;
      }
      $('ab-next').hidden = !tracks[ch + 1];
      $('ab-next-label').textContent = `strona ${ch + 2}`;
      setStatus(`Koniec strony ${ch + 1}.`);
    });

    // Ręczna zmiana strony w trakcie odtwarzania przełącza lektora na nową stronę.
    root.addEventListener('poradnik:page', e => {
      const d = e.detail || {};
      if (d.source !== 'lektor' && !audio.paused && !audio.ended && !failed() && d.index !== ch && tracks[d.index]) start(d.index, 0);
      else if (d.source !== 'lektor' && d.index !== ch) clearTimeout(advanceTimer);
      paintButtons();
      if (ch === d.index && lit.length) lit.forEach(el => el.classList.add('is-reading'));
    });
    // Kliknięcie akapitu przewija nagranie do tego miejsca (tylko gdy lektor jest w użyciu).
    root.querySelector('#text-view').addEventListener('click', e => {
      if (!engaged() || e.target.closest('a, button, input, select, textarea, label, summary, .web-extra')) return;
      if (String(window.getSelection ? window.getSelection() : '').trim()) return;
      const chapter = e.target.closest('.guide-chapter');
      if (!chapter || chapters.indexOf(chapter) !== ch || !canLight[ch]) return;
      const el = e.target.closest(api.selector);
      const b = el ? blocks[ch].indexOf(el) : -1;
      if (b < 0) return;
      const k = tracks[ch].segments.findIndex(s => s[2].indexOf(b) >= 0);
      if (k < 0) return;
      // W czasie pauzy dotknięcie tylko ustawia miejsce (napis "Wznów od..."), nie włącza dźwięku.
      audio.currentTime = tracks[ch].segments[k][0] + 0.01;
      light(k, true);
      tick();
      paintButtons();
    });
    // Każde przewinięcie, którego nie zrobił lektor, wstrzymuje na chwilę śledzenie tekstu
    // (kółko, palec, klawisze, pasek przewijania, linki do kotwic, wyszukiwanie w stronie).
    ['wheel', 'touchmove'].forEach(type => window.addEventListener(type, () => {userScroll = Date.now();}, {passive: true}));
    window.addEventListener('scroll', () => {if (Date.now() > autoScrollUntil) userScroll = Date.now();}, {passive: true});
    window.addEventListener('keydown', e => {if (['PageDown', 'PageUp', 'Home', 'End', 'ArrowDown', 'ArrowUp', ' '].indexOf(e.key) >= 0 && !e.target.closest('.audio-bar')) userScroll = Date.now();});
    window.addEventListener('pagehide', () => savePos(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) savePos(true);
      else if (engaged() && !audio.ended) light(segmentAt(audio.currentTime), true);
    });
    onOther('lektor', () => {if (!audio.paused) audio.pause();});

    function setBarHeight() {document.documentElement.style.setProperty('--ab-h', bar.hidden ? '0px' : bar.offsetHeight + 'px');}
    if ('ResizeObserver' in window) new ResizeObserver(setBarHeight).observe(bar);
    else window.addEventListener('resize', setBarHeight);

    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession, set = (a, f) => {try {ms.setActionHandler(a, f);} catch (_) { /* nieobsługiwane */ }};
      set('play', () => start(ch < 0 ? api.current() : ch));
      set('pause', () => audio.pause());
      set('stop', closeBar);
      set('seekbackward', d => jumpBy(-((d && d.seekOffset) || 10)));
      set('seekforward', d => jumpBy((d && d.seekOffset) || 10));
      set('seekto', d => {if (d && Number.isFinite(d.seekTime)) {if (d.fastSeek && audio.fastSeek) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime;tick();}});
      set('previoustrack', () => {
        if (audio.currentTime > 3 || ch <= 0) {audio.currentTime = 0;return;}
        const prev = ch - 1;
        autoScrollUntil = Date.now() + 1500;
        if (api.current() === ch) api.navigate(prev, {history: 'replace', focus: false, source: 'lektor'});
        start(prev, 0);
      });
      set('nexttrack', goNextPage);
    }
    root.classList.add('has-lektor');
    paintButtons();
  }

  /* ====================================================================== */
  /* Syreny RCB                                                             */
  /* ====================================================================== */
  const sirenBox = root.querySelector('.sirens');
  if (sirenBox) initSirens(sirenBox);

  function initSirens(box) {
    const cards = Array.from(box.querySelectorAll('.siren-card'));
    const live = box.querySelector('.siren-live'), liveText = box.querySelector('.siren-live-text'), liveTime = box.querySelector('.siren-time');
    const sr = box.querySelector('.siren-sr'), errorBox = box.querySelector('.siren-error');
    const showError = text => {if (errorBox) {errorBox.textContent = text;errorBox.hidden = false;} else sr.textContent = text;};
    const SAMPLE = 20, FADE = 0.5, VOLUME = 0.5;
    let active = null; // {card, media, mode, gain, raf}
    function paint(card, mode) {
      card.querySelectorAll('.siren-play').forEach(btn => {
        const on = active && active.card === card && active.mode === btn.dataset.mode;
        btn.classList.toggle('is-playing', !!on);
        btn.querySelector('.siren-label').textContent = on ? 'Zatrzymaj' : btn.dataset.label;
      });
      card.classList.toggle('is-playing', !!(active && active.card === card));
      card.dataset.view = mode || card.dataset.view || 'sample';
    }
    function frame() {
      if (!active) return;
      const {card, media, mode} = active;
      const total = mode === 'sample' ? SAMPLE : (Number(card.dataset.duration) || media.duration || 1);
      const t = media.currentTime;
      const x = Math.min(1, t / total) * 300;
      const rect = card.querySelector(`.wave-${mode} .wave-clip rect`);
      if (rect) rect.setAttribute('width', x.toFixed(1));
      const head = card.querySelector('.siren-head');
      if (head) head.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      liveTime.textContent = `${mmss(t)} / ${mmss(total)}`;
      if (mode === 'sample' && active.gain && t >= SAMPLE - FADE && !active.fading) {
        active.fading = true;
        const g = active.gain.gain, c = active.gain.context;
        g.cancelScheduledValues(c.currentTime);g.setValueAtTime(g.value, c.currentTime);g.linearRampToValueAtTime(0.0001, c.currentTime + FADE);
      }
      if (mode === 'sample' && t >= SAMPLE) {stop();return;}
      active.raf = requestAnimationFrame(frame);
    }
    function stop(reason) {
      if (!active) return;
      const {card, media, mode} = active;
      const hadFocus = live.contains(document.activeElement);
      cancelAnimationFrame(active.raf);
      media.pause();
      try {media.currentTime = 0;} catch (_) { /* jeszcze bez metadanych */ }
      card.querySelectorAll('.wave-clip rect').forEach(r => r.setAttribute('width', '0'));
      const head = card.querySelector('.siren-head');
      if (head) head.setAttribute('transform', 'translate(0 0)');
      active = null;
      live.hidden = true;
      paint(card);
      liveText.textContent = '';
      if (reason === 'error') showError('Nie udało się wczytać nagrania. Sprawdź internet i spróbuj ponownie.');
      else sr.textContent = 'Nagranie zatrzymane.';
      // Przycisk "Wycisz syrenę" znika razem z paskiem: fokus wraca na przycisk tej karty.
      if (hadFocus) {const back = card.querySelector(`.siren-play[data-mode="${mode}"]`);if (back) back.focus();}
    }
    function playSiren(card, mode) {
      if (active) {const same = active.card === card && active.mode === mode;stop();if (same) return;}
      exclusive('syrena');
      let media = card._media;
      if (!media) {
        media = card._media = new Audio(card.dataset.src);
        media.preload = 'auto';
        const ctx = audioContext();
        if (ctx && ctx.createMediaElementSource) {
          try {
            const src = ctx.createMediaElementSource(media);
            card._gain = ctx.createGain();
            src.connect(card._gain).connect(ctx.destination);
          } catch (_) {card._gain = null;}
        }
        media.addEventListener('ended', () => {if (active && active.media === media) stop();});
        media.addEventListener('error', () => {if (active && active.media === media) stop('error');});
        // Głośność narasta dopiero od chwili, gdy dźwięk naprawdę rusza (na wolnym łączu po wczytaniu).
        media.addEventListener('playing', () => {
          if (!active || active.media !== media) return;
          liveText.textContent = active.text;
          if (active.gain && !active.fading) {
            const c = active.gain.context, g = active.gain.gain;
            g.cancelScheduledValues(c.currentTime);
            g.setValueAtTime(0.0001, c.currentTime);
            g.linearRampToValueAtTime(VOLUME, c.currentTime + FADE);
          }
        });
      } else audioContext();
      if (media.error) media.load(); // po błędzie sieci kolejna próba wczytuje plik od nowa
      if (errorBox) errorBox.hidden = true;
      const gain = card._gain;
      if (gain) {
        const c = gain.context;
        gain.gain.cancelScheduledValues(c.currentTime);
        gain.gain.setValueAtTime(0.0001, c.currentTime);
      } else media.volume = VOLUME;
      try {media.currentTime = 0;} catch (_) { /* od początku po wczytaniu */ }
      const text = `Nagranie szkoleniowe: ${card.dataset.name}. To nie jest alarm.`;
      const mine = active = {card, media, mode, gain, raf: 0, fading: false, text};
      paint(card, mode);
      live.hidden = false;
      liveText.textContent = media.readyState >= 3 ? text : 'Wczytuję nagranie…';
      sr.textContent = `Odtwarzam nagranie szkoleniowe: ${card.dataset.name}. To nie jest prawdziwy alarm.`;
      const p = media.play();
      // Odrzucona obietnica dotyczy tylko tego odtworzenia: nie zatrzymuje nagrania włączonego później.
      if (p && p.catch) p.catch(err => {if (active === mine) stop(err && err.name === 'NotAllowedError' ? '' : 'error');});
      active.raf = requestAnimationFrame(frame);
      track('syrena', {sygnal: card.dataset.siren, tryb: mode});
    }
    cards.forEach(card => {
      card.querySelectorAll('.siren-play').forEach(btn => {
        btn.dataset.label = btn.querySelector('.siren-label').textContent;
        btn.addEventListener('click', () => playSiren(card, btn.dataset.mode));
      });
    });
    box.querySelector('.siren-stop').addEventListener('click', () => {stop();});
    document.addEventListener('keydown', e => {if (e.key === 'Escape' && active) {e.preventDefault();stop();}});
    onOther('syrena', () => stop());
    root.addEventListener('poradnik:page', () => stop());
    root.addEventListener('poradnik:mode', () => stop());
    document.addEventListener('visibilitychange', () => {if (document.hidden) stop();});
  }

  /* ====================================================================== */
  /* Metronom uciśnięć                                                      */
  /* ====================================================================== */
  const metro = root.querySelector('.metronome');
  if (metro && AC) initMetronome(metro);
  else if (metro) metro.classList.add('no-audio');

  function initMetronome(box) {
    const btn = box.querySelector('.metro-start'), label = btn.querySelector('.metro-label');
    const count = box.querySelector('.metro-count'), unit = box.querySelector('.metro-unit'), pulse = box.querySelector('.metro-pulse');
    // Przerwa na 2 oddechy ratownicze trwa około 5 sekund.
    const BPM = 110, STEP = 60 / BPM, CYCLE = 30, PAUSE = 5;
    let ctx = null, timer = 0, next = 0, beat = 0, running = false, starting = false, queue = [], wake = null;
    const breaks = () => {const r = box.querySelector('input[name="metro-mode"]:checked');return !r || r.value === '30';};
    const click = (time, strong) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = strong ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(strong ? 0.5 : 0.32, time + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);
      o.connect(g).connect(ctx.destination);
      o.start(time);o.stop(time + 0.08);
    };
    const schedule = () => {
      if (!running) return;
      while (next < ctx.currentTime + 0.15) {
        const n = beat % CYCLE;
        click(next, n === 0);
        queue.push({time: next, n: n + 1, total: beat + 1});
        beat++;
        next += STEP;
        if (beat % CYCLE === 0 && breaks()) {
          for (let k = 0; k < PAUSE; k++) queue.push({time: next + k, pause: PAUSE - k});
          next += PAUSE;
        }
      }
    };
    const paintBeat = () => {
      if (!running) return;
      while (queue.length && queue[0].time <= ctx.currentTime) {
        const q = queue.shift();
        if (q.pause) {count.textContent = '2';unit.textContent = `oddechy, uciskaj za ${q.pause} s`;box.classList.add('is-break');}
        else {
          if (breaks()) {count.textContent = String(q.n);unit.textContent = 'z 30 uciśnięć';}
          else {count.textContent = String(q.total);unit.textContent = plural(q.total, 'uciśnięcie', 'uciśnięcia', 'uciśnięć');}
          box.classList.remove('is-break');
          if (!reduced()) {pulse.classList.remove('beat');void pulse.offsetWidth;pulse.classList.add('beat');}
        }
      }
      requestAnimationFrame(paintBeat);
    };
    const release = () => {if (wake) {wake.release().catch(() => {});wake = null;}};
    const stop = () => {
      starting = false;
      if (!running) return;
      running = false;clearInterval(timer);timer = 0;queue = [];
      label.textContent = 'Włącz metronom';btn.classList.remove('is-playing');
      count.textContent = '110';unit.textContent = 'uciśnięć na minutę';
      box.classList.remove('is-running', 'is-break');
      release();
    };
    btn.addEventListener('click', async () => {
      // Drugie kliknięcie w czasie uruchamiania (uśpiony dźwięk w przeglądarce) zatrzymuje, a nie dubluje.
      if (running || starting) {stop();return;}
      exclusive('metronom');
      ctx = audioContext();
      if (!ctx) return;
      starting = true;
      if (ctx.state === 'suspended') {try {await ctx.resume();} catch (_) { /* bez dźwięku */ }}
      if (!starting) return; // zatrzymano w trakcie uruchamiania
      starting = false;
      running = true;beat = 0;queue = [];next = ctx.currentTime + 0.12;
      label.textContent = 'Zatrzymaj metronom';btn.classList.add('is-playing');
      box.classList.add('is-running');
      clearInterval(timer);
      schedule();timer = setInterval(schedule, 25);paintBeat();
      track('metronom', {});
      // Ekran nie gaśnie, dopóki metronom pracuje (jeśli przeglądarka na to pozwala).
      try {
        if (navigator.wakeLock) {
          const lock = await navigator.wakeLock.request('screen');
          if (running) wake = lock; else lock.release().catch(() => {});
        }
      } catch (_) {wake = null;}
    });
    box.querySelectorAll('input[name="metro-mode"]').forEach(r => r.addEventListener('change', () => {if (running) {stop();}}));
    onOther('metronom', stop);
    root.addEventListener('poradnik:page', stop);
    root.addEventListener('poradnik:mode', stop);
    document.addEventListener('visibilitychange', () => {if (document.hidden) stop();});
  }

  /* ====================================================================== */
  /* Kalkulator wody                                                        */
  /* ====================================================================== */
  const calc = root.querySelector('.water-calc');
  if (calc) {
    const people = calc.querySelector('#woda-osoby'), days = calc.querySelector('#woda-dni'), out = calc.querySelector('.calc-result');
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || lo));
    const update = () => {
      const n = clamp(people.value, 1, 20), d = clamp(days.value, 3, 14);
      if (String(n) !== people.value) people.value = String(n);
      const l = n * d * 3;
      const bottles = Math.ceil(l / 1.5), jugs = Math.ceil(l / 5);
      out.textContent = '';
      const strong = document.createElement('strong');
      strong.textContent = `${l} ${plural(l, 'litr', 'litry', 'litrów')} wody`;
      // Po "około" dopełniacz: "około 12 butelek", "około 4 baniaków" (wartości są zawsze co najmniej 2).
      out.append(strong, ` do picia i jedzenia dla ${n} ${plural(n, 'osoby', 'osób', 'osób')} na ${d} dni. To około ${bottles} butelek po 1,5 l albo ${jugs} baniaków po 5 l.`);
      // aria-disabled zamiast disabled: przycisk z fokusem nie traci go na granicy zakresu.
      calc.querySelector('.calc-minus').setAttribute('aria-disabled', String(n <= 1));
      calc.querySelector('.calc-plus').setAttribute('aria-disabled', String(n >= 20));
    };
    const stepPeople = d => {const n = clamp(people.value, 1, 20);if ((d < 0 && n <= 1) || (d > 0 && n >= 20)) return;people.value = String(n + d);update();};
    calc.querySelector('.calc-minus').addEventListener('click', () => stepPeople(-1));
    calc.querySelector('.calc-plus').addEventListener('click', () => stepPeople(1));
    people.addEventListener('change', update);
    people.addEventListener('input', () => {if (people.value !== '') update();});
    days.addEventListener('change', update);
    calc.classList.add('is-ready');
    update();
  }
})();
