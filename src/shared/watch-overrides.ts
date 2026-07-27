/**
 * Hand-checked streaming URLs for the titles no algorithm can reach: entries the
 * site indexes under an unrelated name, spin-offs it files under the main
 * franchise, and its own typos. `null` means the title is genuinely absent from
 * that site, so the UI says so instead of opening an empty search.
 *
 * Keyed by AniList media id — titles drift, ids don't.
 */
export interface WatchOverride {
  animeSama?: string | null
  franime?: string | null
}

export const WATCH_OVERRIDES: Record<number, WatchOverride> = {
  // Absent from Anime-Sama's catalogue
  3455: { animeSama: null }, // To LOVE-Ru
  6166: { animeSama: null }, // Asobi ni Iku yo! / Cat Planet Cuties
  11617: { animeSama: null }, // High School DxD
  15451: { animeSama: null }, // High School DxD NEW
  20745: { animeSama: null }, // High School DxD BorN
  97767: { animeSama: null }, // High School DxD HERO
  21093: { animeSama: null }, // Monster Musume no Iru Nichijou

  // Indexed under a name the title can't produce
  21355: { animeSama: 'https://anime-sama.to/catalogue/re-zero/' },
  116741: {
    // The Slime Diaries — both sites file it under the parent franchise
    animeSama: 'https://anime-sama.to/catalogue/tensei-shitara-slime-datta-ken/',
    franime: 'https://franime.fr/anime/that-time-i-got-reincarnated-as-a-slime'
  },
  153332: {
    // Tensei Kizoku — Anime-Sama uses an English name of its own, and FrAnime's
    // own URL has a typo ("servings"), so neither can be derived.
    animeSama: 'https://anime-sama.to/catalogue/noble-new-world-adventures/',
    franime: 'https://franime.fr/anime/the-aristocrats-otherworldly-adventure-servings-gods-who-go-too-far'
  }
}

export function overrideFor(animeId: number): WatchOverride | undefined {
  return WATCH_OVERRIDES[animeId]
}
