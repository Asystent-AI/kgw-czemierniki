# kgw.czemierniki.org

Strona informacyjna Koła Gospodyń Wiejskich Czemierniki. Hugo (jedna binarka, bez npm),
ten sam system wizualny co siostrzana strona Klubu Pasjonatów Ogrodnictwa
([pasjonaci-czemierniki](https://github.com/Asystent-AI/pasjonaci-czemierniki)):
obie strony tworzą jedną, wzajemnie podlinkowaną całość.

## Praca lokalna

```powershell
# z katalogu strona-kgw/:
..\.bin\hugo.exe server --port 1314
# albo z katalogu nadrzędnego KGW Czemierniki:
.bin\hugo.exe server --source strona-kgw --port 1314
```

Podgląd na http://localhost:1314 (wpis "kgw" w `.claude/launch.json`).
Binarka Hugo w `.bin/` katalogu nadrzędnego, wersja przypięta na **0.164.0**.

## Współdzielone z Pasjonatami

- **CSS** (`assets/css/main.css`), **JS** (`assets/js/strona.js`) i **fonty** są kopiami
  z repo pasjonaci-czemierniki. Poprawka tam oznacza ręczne przeniesienie tutaj (świadoma
  duplikacja: strony wdrażają się niezależnie, a wspólny theme wiązałby oba repo).
- **Backend formularzy** to ten sam kontener `pasjonaci-formularz` (Flask, źródło w repo
  Pasjonatów, `formularz/app.py`). Formularze tej strony wysyłają tematy `kontakt-kgw`
  i `sponsor-kgw`, oba obsługiwane w słownikach tytułów maili w `app.py`.
- **Statystyki**: to samo Umami, osobna witryna `kgw.czemierniki.org`
  (id w `hugo.toml`). Panel: https://statystyki.czemierniki.org
- **Zdjęcia** w `static/zdjecia/` to wybór z plenerów Klubu (generuje
  `narzedzia/assety_www.py` w katalogu nadrzędnym).

Assety logo (odznaka, favicon, og.jpg) generuje `narzedzia/assety_kgw.py`
z `input/KGW_Czemierniki_-_Logo.png` (pieczęć z ciemiernikiem, fiolet i zieleń z tej samej rodziny co znak Klubu).

### Maile pisane ręcznie z Gmaila

Szablon firmowy Koła leży poza tym repo, w `output/2026-08-26-szablon-mail-kgw.html`
(otwierasz w przeglądarce, `Ctrl+A`, `Ctrl+C`, wklejasz do okna wiadomości w Gmailu).
Dwa obrazy ciągnie z tej domeny, bo w ręcznym mailu nie ma jak osadzić `cid`:

- `static/odznaka-240.png`: pieczęć w nagłówku,
- `static/logotyp-pion-mail.png`: logotyp pionowy w stopce przy podpisie, 183 x 246 px
  (2 x wymiar wyświetlania), z `input/KGW_Czemierniki_-_Logo_pionowe_bez_tła.png`.
  **PNG, nie webp** (Outlook nie renderuje webp).

Jeśli któryś z tych plików zniknie ze `static/`, stopka maili rozsypie się u odbiorców,
a nie u nas.

## Wdrożenie (Coolify/Traefik na Hetznerze)

Serwer: `<serwer>`. Strona chodzi jako kontener `kgw-www` (`nginx:alpine`,
`restart unless-stopped`, sieć `coolify`, labele Traefik z `certresolver=letsencrypt`)
serwujący `/var/www/kgw`. Kontener stoi poza panelem Coolify, jak `pasjonaci-czemierniki`.

Aktualizacja strony (bez restartu kontenera):

```powershell
cd strona-kgw
..\.bin\hugo.exe --quiet --destination public --baseURL https://kgw.czemierniki.org/
tar czf - -C public . | ssh <serwer> "tar xzf - -C /var/www/kgw"
```

Ścieżki `/api` (formularze) i `/statystyki` (tracker, tylko `script.js` + `api/send`)
kieruje do wspólnych kontenerów **file provider** Traefika:
`/data/coolify/proxy/dynamic/kgw-www.yaml` (kopia zapasowa w `/opt/kgw-www/`).
Zawężenie statystyk do dwóch ścieżek to wymóg bezpieczeństwa: szerszy `PathPrefix`
wystawiałby publicznie API panelu Umami.

Poprzednia zawartość domeny (zaślepka "w przygotowaniu") była aplikacją Coolify;
jej kontener `ctqc771...` jest zatrzymany z `--restart=no`. Aplikację można
usunąć z panelu Coolify: pliki i kontener nie są już używane.

## Zanim dopiszesz treść

- Nazwa rejestrowa: **"Koło Gospodyń Wiejskich Czemierniki"** (bez "w").
  "W Czemiernikach" wyłącznie w zwrocie "z siedzibą w Czemiernikach".
- Adres ul. Zamkowa 11 to adres rejestrowy (remiza OSP), **nie miejsce spotkań**:
  nie zapraszać tam nikogo.
- Fakty (daty, nazwiska, kwoty, partnerzy) wyłącznie potwierdzone: z bazy wiedzy
  Koła albo od Zarządu. Skład Zarządu celowo niepublikowany do czasu potwierdzenia
  odpisem z KRKGW.
- Proste cudzysłowy "tak", separator tysięcy kropką (5.000 zł), bez myślnika em.

## Struktura

- `/poradnik/`: poradnik online MMS, opublikowany 13.11.2026 na podstawie ostatecznego
  wydania z 8.11.2026, wersja multimedialna od 14.11.2026. Pliki: `layouts/poradnik.html`,
  partiale `layouts/_partials/poradnik/` (`syreny.html`, `metronom.html`, `woda.html`)
  i `layouts/_partials/poradnik-jsonld.html`, `assets/css/poradnik.css`,
  `assets/js/poradnik.js` (czytnik) i `assets/js/poradnik-audio.js` (lektor i dodatki),
  łączone przez Hugo w jeden plik `js/poradnik-czytnik.js`. Dane: `data/poradnik.json`
  (treść 16 stron), `data/lektor.json` (nagrania i synchronizacja), `data/syreny.json`
  (nagrania RCB i wykres tonu), `data/poradnik-source.json` (sumy SHA-256 źródeł).
  Pliki statyczne: `static/poradnik/` (`audio/`, `syreny/`, ilustracje, strony, PDF, TXT).
  - Czytnik: jedna strona naraz, przyklejony pasek (poprzednia, tytuł z numerem strony,
    następna, Posłuchaj, Ustawienia), spis treści z wyszukiwarką (wiele słów, bez polskich
    znaków i interpunkcji, proste odmiany, wycinek z podświetleniem; Enter otwiera
    najlepiej pasującą stronę: tytuł, potem nagłówki, a sam numer, np. "112", otwiera
    "Ważne telefony"), adresy z hashem
    i historia przeglądarki, tytuł karty z nazwą strony, kafelki tematów. Ustawienia:
    tekst lub kartkowanie oryginalnych stron (srcset 720/1080/1444, przesunięcie palcem,
    okno powiększenia z przybliżaniem w punkcie kliknięcia), rozmiar tekstu (3 stopnie),
    tryb nocny (domyślnie wg systemu, bez mignięcia przy ładowaniu), tryb skupienia,
    zakładka na żądanie, kopiowanie i udostępnianie linku. Strzałki zmieniają strony
    poza polami formularza, Esc zamyka okna i tryb skupienia.
  - Lektor: głos syntetyczny AI (ElevenLabs, model Eleven v4, głos Piotr), nagrania
    z 14.11.2026, oznaczone na stronie jako AI. 16 plików `audio/NN-slug.mp3` (96 kb/s)
    i całość `poradnik-czemierniki-lektor.mp3` (64 kb/s, rozdziały ID3 "Strona N").
    Odtwarzacz na dole ekranu: pauza, suwak, 10 s wstecz/dalej, tempo 0,8-1,5, akapit
    wstecz/dalej, automatyczne przejście do następnej strony (domyślnie wyłączone),
    śledzenie tekstu, podświetlanie czytanego akapitu (segmenty w `data/lektor.json`,
    bloki wg selektora `h2, h3, p, li, .litry > div, .telefony > .num` bez `.web-extra`),
    kliknięcie akapitu przewija nagranie, Media Session (ekran blokady, grafiki 512 px),
    zapamiętana pozycja i tempo. Po zmianie treści strony trzeba nagrać ją ponownie
    i przeliczyć segmenty; skrypty i scenariusze: `narzedzia/lektor_poradnika/`
    w repozytorium agenta.
  - Dodatki wersji internetowej (oznaczone na stronie): nagrania sygnałów alarmowych RCB
    na stronie 12 (licencja CC BY-NC-ND 4.0, zmieniony wyłącznie format WAV na MP3;
    fragment 20 s, wyciszenie i obniżona głośność ustawiane w odtwarzaczu, ostrzeżenie
    przed głośnym dźwiękiem, przycisk "Wycisz syrenę" i Esc), metronom 110/min do
    ćwiczenia uciśnięć na stronie 13 (tryb 30:2 i ciągły, dźwięk z Web Audio), kalkulator
    zapasu wody na stronie 4 (3 l na osobę na dobę, jak w tekście), plan domowy do wydruku
    (`nasz-domowy-plan.pdf`, strona 15 z oryginału).
  - Obrazy responsywne generuje `narzedzia/obrazy_poradnika.py` w repozytorium agenta
    (warianty 480/800 WebP i AVIF, strony 720/1080, kafelki `temat-NN`, grafiki 512 px,
    `og-poradnik.jpg`); oryginały nie są zmieniane.
  - Bez JavaScript wszystkie strony są widoczne kolejno, a w miejsce przycisków lektora
    i syren są linki do plików MP3. Nie zapisujemy danych domowego planu. LocalStorage
    (klucze `kgw-poradnik-*`) przechowuje rozmiar tekstu, motyw, zakładkę oraz pozycję
    i ustawienia lektora.
  - Kontrola 14.11.2026 (po trzech rundach audytu i wdrożeniu): produkcja bez poziomego
    przewijania przy 320, 360 i 412 px, lektor odtwarza pliki z serwera (HTTP 200,
    Accept-Ranges), po błędzie wczytania nagranie zatrzymuje się, a "Spróbuj ponownie"
    wznawia od miejsca przerwania, wyszukiwarka "112" otwiera "Ważne telefony", konsola
    bez błędów. Pułapka CSS: skrót `text-wrap` resetuje `text-wrap-mode` i przywraca
    zawijanie elementom z `white-space: nowrap`, dlatego w poradniku jest `text-wrap-style`.
  - Informacja o wydaniu nie oznacza aktualizacji danych miejscowych; źródłowy tekst
    zachowuje daty. Nazewnictwo online: "poradnik" zamiast "książeczka"; archiwalne
    odwzorowanie wydania drukowanego i pliki do pobrania zachowują oryginalne brzmienie.

- `layouts/home.html`: strona główna (hero, kafle, czym żyjemy, pas Dożynek,
  sekcja Klubu, partnerzy, dołącz)
- `layouts/wesprzyj.html`: drogi wsparcia + konto + formularz (temat `sponsor-kgw`)
- `layouts/kontakt.html`: formularz (temat `kontakt-kgw`) + dane kontaktowe
- `layouts/page.html`: podstrony tekstowe (polityka prywatności)
- `content/prywatnosc.md`: polityka opisuje **stan faktyczny** tej strony
  (bez formularza konkursowego!); przy zmianach backendu sprawdź, czy mówi prawdę
- `data/galeria.yaml`: lista zdjęć do podglądu (lightbox)

Progi mobilne i pułapki CSS: `README.md` w repo Pasjonatów, sekcja o audycie
(obowiązują tu tak samo, bo CSS jest ten sam).
