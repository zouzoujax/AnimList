# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron 43 on Windows 11 — the renderer is web technology, but it ships as an installed
desktop application with a frameless window, native Snap Layouts, Mica material and Windows
toast notifications. Nothing is served over a network; the packaged renderer runs on `file://`.

## Users

One person: the author, Zaidal, tracking the anime they watch on their own Windows 11 PC.
There is no second audience, no sharing, no account and no multi-user story — the product is
single-user by design, not by lack of ambition.

The situation is a private evening one: an episode has just been watched, or is about to be.
The two jobs that dominate are *tick what I just watched* and *find what to watch next*. A
distant third is *look back at what I have watched*, which is where the statistics live.

## Product Purpose

Keep a complete, permanent record of a personal anime history — episode by episode — and make
the next episode easy to find, without an account, a server or a subscription.

Success is that the app is opened without thinking about it, the tick takes one click, and the
history is still intact and correct years later. A silent data loss would be a total failure
even if every other feature worked.

## Positioning

Local-first with no compromise: the entire library lives in two files under `%APPDATA%`, owned
and readable by the user. Anime metadata comes from AniList's public GraphQL API without a key,
cached to disk so the app works offline.

The mechanism a neighbouring tracker could not truthfully copy is the reconciliation between
two incompatible catalogues. TheTVDB — which TV Time and OpenTV use — models a long anime as
one series with numbered seasons; AniList splits the same show into one entry per broadcast
cour. Episodes therefore cannot be matched by number: they are poured in broadcast order along
a chain of AniList entries linked by `SEQUEL` relations, spilling into the next entry when one
fills up, with a franchise-title search patching the holes AniList's relation graph leaves.
That is what makes a real TV Time history importable at all.

## Operating Context

- Windows 11 desktop, installed via an NSIS installer, launched from the Start menu or taskbar.
- Watching happens elsewhere — Crunchyroll, Anime-Sama, ADN, FrAnime — so each series page
  offers direct links out, and states whether a link leads to the anime itself or to a search.
- Episodes arrive weekly during a season, so the app is opened in short bursts rather than long
  sessions. The calendar and the airing notifications exist for that rhythm.
- A large history was imported once, from a TV Time / OpenTV GDPR export: 2 660 episodes across
  52 source series, which became 85 AniList entries.

## Capabilities and Constraints

**Confirmed capabilities.** Episode grid with per-episode dates, runtimes, notes and moods;
five statuses plus favourites; custom lists; bulk actions; rewatch passes; scores, series notes
and moods; discovery (trending, season, upcoming, search, trailers, cast, relations,
recommendations); weekly calendar; statistics with streaks, a yearly heatmap and badges;
Windows notifications with a configurable lead time and per-series muting; MyAnimeList and
TV Time / OpenTV import; JSON export and restore; four themes crossed with four layouts;
in-app updates from GitHub Releases.

**Technical constraints.**
- One runtime dependency, `electron-updater`. Everything else is bundled; no native modules, so
  no C++ toolchain and no ABI trouble at packaging time.
- The main process owns the data. The renderer mutates through IPC and resynchronises on a
  `store:change` echo. Episode ticks are optimistic so they stay instant.
- AniList tolerates roughly 30 requests a minute, so every call is serialised through a
  two-lane queue: what the user is waiting for overtakes bulk background work.
- Data lives in `animelist.json` (library, preferences, lists) plus an append-only
  `animelist-history.jsonl` (one watched episode per line). Both are written atomically.
- Schema migrations are versioned and one-way; a file written by a newer build makes the store
  read-only rather than being rewritten.
- The packaged renderer runs on `file://` with a strict CSP, `contextIsolation` on and
  `nodeIntegration` off. No Referer is sent, which is why embedded YouTube refuses to play and
  trailers open in the system browser instead.

**Deliberately undecided.** Whether the app is ever distributed to anyone else. It is currently
unsigned, so Windows SmartScreen warns on install and on update.

## Brand Commitments

- Name: **AnimeList**. Author credit: **Zaidal**, shown in the settings.
- Interface language is French throughout, including error messages and empty states.
- The accent colour is user-configurable and propagates through the whole interface, charts
  included. No theme may hard-code a brand hue that ignores it.
- Four existing themes are binding and must keep working: Nébuleuse (frosted glass, aurora),
  Papier (light, editorial, flat), Terminal (monospace, sharp, high contrast), Synthwave
  (saturated, fully rounded, neon). Four layouts likewise: Classique, Rail, Barre haute,
  Tableau de bord. Themes and layouts combine freely.

## Evidence on Hand

- A real imported history: 2 660 episodes, 86 entries, verified with zero duplicates and zero
  episodes beyond a series' cap.
- Measured watch-link coverage: 87 % direct Anime-Sama links across 85 titles, the rest falling
  back to search. Anime-Sama slugs are unguessable (`Kaiju No. 8` → `kaiju-n8`), so they are
  read from the site catalogue and the season URL is verified before being offered.
- 323 unit tests, ESLint with no errors, both TypeScript projects clean.
- Nine screenshots in `docs/screenshots/`, produced by `npm run screenshots`. They are built
  from a fixed demonstration library of public AniList entries seeded into a throwaway
  user-data folder — never the real library, because the repository is public and the history
  is personal. The cast is fixed rather than "trending" so a re-run produces a diffable set.
- There are no users besides the author, no testimonials, no benchmarks and no pricing. Future
  work must not invent any.

## Product Principles

1. **The record is sacred.** Any change that could lose or silently corrode watch history is
   wrong regardless of what it enables. Backups, atomic writes, versioned migrations and a
   read-only fallback exist for this one reason.
2. **The tick must be instant.** The most frequent action in the product is marking an episode
   watched. It never waits on the network or on a disk write.
3. **Imported dates are not watched dates.** A row carried in from another app records when it
   was ticked there, so it is excluded from day-based statistics until a human corrects it.
   Honesty about data provenance beats a fuller-looking graph.
4. **Local and inspectable.** No account, no telemetry, no server. The data stays in files the
   user can open, and the app degrades to a disk cache rather than failing when offline.
5. **Say what is uncertain.** A guessed watch link is labelled as a guess, an unmatched import
   is listed rather than dropped, and a stale result says it is stale.

## Accessibility & Inclusion

No external standard is contractually required, but the interface is held to keyboard and
contrast basics: a visible `:focus-visible` ring everywhere, a skip link ahead of the eight-item
navigation, `aria-live` announcements for toasts, `aria-current` on the active nav item, and
accessible names on icon-only controls — the Rail layout hides labels, so the name cannot come
from the text.

Body and secondary text must clear 4.5:1 against its background in every theme. This is load
bearing rather than aspirational: the Papier theme shipped a secondary colour at 3.36:1 and it
had to be corrected to 4.60:1.

Charts encode magnitude with length, position or lightness and stay single-hue, so colour is
never the only carrier of a value.
