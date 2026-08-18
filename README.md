# kgw.czemierniki.org

Strona informacyjna Koła Gospodyń Wiejskich Czemierniki. Hugo (jedna binarka, bez npm),
ten sam system wizualny co siostrzana strona Klubu Pasjonatów Ogrodnictwa
([pasjonaci-czemierniki](https://github.com/Asystent-AI/pasjonaci-czemierniki)) —
obie strony tworzą jedną, wzajemnie podlinkowaną całość.

## Praca lokalna

```bash
../.bin/hugo.exe server --source strona-kgw --port 1314
```

Podgląd na http://localhost:1314 (wpis „kgw" w `.claude/launch.json`).
Binarka Hugo w `.bin/` katalogu nadrzędnego, wersja przypięta na **0.164.0**.

## Współdzielone z Pasjonatami

- **CSS** (`assets/css/main.css`), **JS** (`assets/js/strona.js`) i **fonty** są kopiami
  z repo pasjonaci-czemierniki. Poprawka tam = ręczne przeniesienie tutaj (świadoma
  duplikacja: strony wdrażają się niezależnie, a wspólny theme wiązałby oba repo).
- **Backend formularzy** to ten sam kontener `pasjonaci-formularz` (Flask, źródło w repo
  Pasjonatów, `formularz/app.py`). Formularze tej strony wysyłają tematy `kontakt-kgw`
  i `sponsor-kgw` — słowniki tytułów maili w `app.py` znają oba.
- **Statystyki**: to samo Umami, osobna witryna `kgw.czemierniki.org`
  (id w `hugo.toml`). Panel: https://statystyki.czemierniki.org
- **Zdjęcia** w `static/zdjecia/` to wybór z plenerów Klubu (generuje
  `narzedzia/assety_www.py` w katalogu nadrzędnym).

Assety logo (odznaka, favicon, og.jpg) generuje `narzedzia/assety_kgw.py`
z `input/KGW_Czemierniki_-_Logo.png` (pieczęć z ciemiernikiem, fiolet + zieleń —
ta sama rodzina co znak Klubu).

## Wdrożenie (Coolify/Traefik na Hetznerze)

Serwer: root@204.168.196.86. Strona chodzi jako kontener `kgw-www` (nginx:alpine,
restart unless-stopped, sieć `coolify`, labele Traefik z certresolver=letsencrypt)
serwujący `/var/www/kgw`. Kontener stoi poza panelem Coolify, jak `pasjonaci-czemierniki`.

Aktualizacja strony (bez restartu kontenera):

```bash
cd strona-kgw && ../.bin/hugo.exe --quiet --destination public --baseURL https://kgw.czemierniki.org/
tar czf - -C public . | ssh root@204.168.196.86 "tar xzf - -C /var/www/kgw"
```

Ścieżki `/api` (formularze) i `/statystyki` (tracker, tylko `script.js` + `api/send`)
kieruje do wspólnych kontenerów **file provider** Traefika:
`/data/coolify/proxy/dynamic/kgw-www.yaml` (kopia zapasowa w `/opt/kgw-www/`).
Zawężenie statystyk do dwóch ścieżek to wymóg bezpieczeństwa — szerszy PathPrefix
wystawiałby publicznie API panelu Umami.

Poprzednia zawartość domeny (zaślepka „w przygotowaniu") była aplikacją Coolify;
jej kontener `ctqc771...` jest zatrzymany z `--restart=no`. Aplikację można
usunąć z panelu Coolify — pliki i kontener nie są już używane.

## Zanim dopiszesz treść

- Nazwa rejestrowa: **„Koło Gospodyń Wiejskich Czemierniki"** — bez „w".
  „W Czemiernikach" wyłącznie w zwrocie „z siedzibą w Czemiernikach".
- Adres ul. Zamkowa 11 to adres rejestrowy (remiza OSP), **nie miejsce spotkań** —
  nie zapraszać tam nikogo.
- Fakty (daty, nazwiska, kwoty, partnerzy) wyłącznie potwierdzone: z bazy wiedzy
  Koła albo od Zarządu. Skład Zarządu celowo niepublikowany do czasu potwierdzenia
  odpisem z KRKGW.
- Cudzysłowy polskie „tak”, separator tysięcy kropką (5.000 zł), bez myślnika em.

## Struktura

- `layouts/home.html` — strona główna (hero, kafle, czym żyjemy, pas Dożynek,
  sekcja Klubu, partnerzy, dołącz)
- `layouts/wesprzyj.html` — drogi wsparcia + konto + formularz (temat `sponsor-kgw`)
- `layouts/kontakt.html` — formularz (temat `kontakt-kgw`) + dane kontaktowe
- `layouts/page.html` — podstrony tekstowe (polityka prywatności)
- `content/prywatnosc.md` — polityka opisuje **stan faktyczny** tej strony
  (bez formularza konkursowego!); przy zmianach backendu sprawdź, czy mówi prawdę
- `data/galeria.yaml` — lista zdjęć do podglądu (lightbox)

Progi mobilne i pułapki CSS: `README.md` w repo Pasjonatów, sekcja o audycie —
obowiązują tu tak samo, bo CSS jest ten sam.
