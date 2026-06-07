# release-janitor

CLI do sprzątania obrazów kontenerowych w GHCR (GitHub Container Registry) oraz release'ów na GitHubie.

## Instalacja

```bash
npm install -g release-janitor
```

Lub uruchom bez instalacji:

```bash
npx release-janitor <command> [options]
```

## Uwierzytelnianie

Ustaw zmienną środowiskową `GITHUB_TOKEN` z tokenem posiadającym odpowiednie uprawnienia:

- **Obrazy (GHCR):** `read:packages`, `delete:packages`
- **Release'y:** `repo`

```bash
export GITHUB_TOKEN=ghp_...
```

Alternatywnie przekaż token przez flagę `--token <token>`.

## Komendy

### `images` — Czyszczenie obrazów GHCR

```
release-janitor images [options]

Opcje:
  -o, --owner <owner>        Nazwa organizacji lub użytkownika GitHub (wymagane)
  -p, --package <name>       Nazwa pakietu (pominięcie = wszystkie pakiety kontenerowe)
  -t, --token <token>        Token GitHub (domyślnie: $GITHUB_TOKEN)
  --dry-run                  Pokaż co zostałoby usunięte, bez usuwania
  --keep-latest <n>          Zachowaj N najnowszych wersji (domyślnie: 5)
  --older-than <days>        Usuń tylko wersje starsze niż N dni
  --untagged                 Usuń tylko wersje bez tagów (dangling)
  -y, --yes                  Pomiń pytanie o potwierdzenie
  -h, --help                 Wyświetl pomoc
```

#### Przykłady

```bash
# Podgląd (dry run) — bez usuwania
release-janitor images -o myorg --dry-run

# Zachowaj 3 ostatnie wersje obrazu "myapp"
release-janitor images -o myorg -p myapp --keep-latest 3

# Usuń wszystkie obrazy bez tagów starsze niż 30 dni
release-janitor images -o myorg --untagged --older-than 30

# Usuń bez pytania o potwierdzenie
release-janitor images -o myorg -p myapp --keep-latest 5 --yes
```

---

### `releases` — Czyszczenie release'ów GitHub

```
release-janitor releases [options]

Opcje:
  -o, --owner <owner>        Nazwa organizacji lub użytkownika GitHub (wymagane)
  -r, --repo <repo>          Nazwa repozytorium (wymagane)
  -t, --token <token>        Token GitHub (domyślnie: $GITHUB_TOKEN)
  --dry-run                  Pokaż co zostałoby usunięte, bez usuwania
  --keep-latest <n>          Zachowaj N najnowszych release'ów (domyślnie: 5)
  --older-than <days>        Usuń tylko release'y starsze niż N dni
  --drafts-only              Usuń tylko wersje robocze (draft)
  --pre-releases-only        Usuń tylko pre-release'y
  -y, --yes                  Pomiń pytanie o potwierdzenie
  -h, --help                 Wyświetl pomoc
```

#### Przykłady

```bash
# Podgląd — co zostałoby usunięte
release-janitor releases -o myorg -r myrepo --dry-run

# Zachowaj 10 ostatnich release'ów
release-janitor releases -o myorg -r myrepo --keep-latest 10

# Usuń tylko wersje robocze (draft), bez pytania
release-janitor releases -o myorg -r myrepo --drafts-only --yes

# Usuń pre-release'y starsze niż 60 dni
release-janitor releases -o myorg -r myrepo --pre-releases-only --older-than 60
```

## Logika filtrowania

Flagi filtrujące działają jako warunki **AND**:

1. `--keep-latest N` — wyklucza N najnowszych wersji z kandydatów do usunięcia
2. `--older-than <days>` — spośród kandydatów wybiera tylko te starsze niż N dni
3. `--untagged` / `--drafts-only` / `--pre-releases-only` — dalej zawęża zbiór

Przykład: `--keep-latest 5 --older-than 30 --untagged` usunie tylko obrazy bez tagów, starsze niż 30 dni, spoza 5 najnowszych.

## Budowanie ze źródeł

```bash
git clone https://github.com/kjaniec-dev/release-janitor.git
cd release-janitor
npm install
npm run build
npm start -- images --help
```
