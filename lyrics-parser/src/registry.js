/**
 * LiriQo provider registry - single source of truth for provider identity,
 * aliases, canonical priority orders and sync capabilities.
 *
 * Canonical orders mirror the production Termux scheduler
 * (termux-server/src/services/LyricsService.js HIGH_ORDER / TEXT_ORDER /
 * PLAIN_ORDER, mapped to the public provider IDs used in API responses):
 *
 *   HIGH (Jagorawi-capable, native word/syllable/character):
 *     apple_music_liriqo, musixmatch_richsync, unison_community, netease,
 *     petitlyrics, kugou_legato, kuwo, migu, qq_portato
 *   TEXT (line-sync eligible):
 *     apple_music_liriqo, lrclib, unison_community, netease, kugou_legato,
 *     kuwo, migu, qq_portato, ytm_line
 *   PLAIN: TEXT order + petitlyrics + musixmatch_richsync
 */

export const CANONICAL_HIGH_ORDER = [
  "apple_music_liriqo", "musixmatch_richsync", "unison_community", "netease",
  "petitlyrics", "kugou_legato", "kuwo", "migu", "qq_portato",
];

export const CANONICAL_TEXT_ORDER = [
  "apple_music_liriqo", "lrclib", "unison_community", "netease", "kugou_legato",
  "kuwo", "migu", "qq_portato", "ytm_line",
];

export const CANONICAL_PLAIN_ORDER = [
  ...CANONICAL_TEXT_ORDER, "petitlyrics", "musixmatch_richsync",
];

/**
 * Compatibility aliases. Applied only where the alias represents the same
 * parser semantics:
 *  - `musixmatch` responses carry richsync/timed payloads identical to the
 *    canonical Musixmatch RichSync route.
 *  - `unison` is the short form of `unison_community`.
 *  - the remaining aliases are short historical spellings of the same
 *    provider payload.
 * `lrclib_wordsync` intentionally has NO alias: derived (proportional)
 * timing must never be treated as native word-sync.
 */
export const PROVIDER_ALIASES = {
  musixmatch: "musixmatch_richsync",
  unison: "unison_community",
  apple: "apple_music_liriqo",
  apple_music: "apple_music_liriqo",
  kugou: "kugou_legato",
  qq: "qq_portato",
  qqmusic: "qq_portato",
  ytm: "ytm_line",
};

/** Resolve a provider id (or legacy alias) to its canonical registry id. */
export function canonicalProvider(provider) {
  if (typeof provider !== "string" || !provider) return null;
  return PROVIDER_ALIASES[provider] ?? provider;
}

/** Lower rank wins; unknown providers sort after every known provider. */
export function providerRank(provider, order) {
  const index = order.indexOf(canonicalProvider(provider));
  return index < 0 ? order.length : index;
}

/**
 * Minimum achievable sync tier per provider (0 = native
 * syllable/word/character, 1 = line, 2 = plain). Derived-timing providers
 * (lrclib_wordsync) are NOT Jagorawi-capable.
 */
export const PROVIDER_MIN_TIER = {
  apple_music_liriqo: 0,
  musixmatch_richsync: 0,
  unison_community: 0,
  netease: 0,
  petitlyrics: 0,
  kugou_legato: 0,
  kuwo: 0,
  migu: 0,
  qq_portato: 0,
  lrclib: 1,
  ytm_line: 1,
};

export const PROVIDER_NAMES = {
  apple_music_liriqo: "Apple Music",
  apple_music: "Apple Music",
  apple: "Apple Music",
  qq_portato: "QQ Music",
  qq: "QQ Music",
  qqmusic: "QQ Music",
  kugou_legato: "KuGou",
  kugou: "KuGou",
  kuwo: "Kuwo Music",
  migu: "Migu Music",
  netease: "NetEase Cloud Music",
  musixmatch: "Musixmatch",
  musixmatch_richsync: "Musixmatch",
  lrclib: "LRCLib",
  unison_community: "Unison",
  unison: "Unison",
  ytm_line: "YouTube Music",
  ytm: "YouTube Music",
  petitlyrics: "PetitLyrics",
};
