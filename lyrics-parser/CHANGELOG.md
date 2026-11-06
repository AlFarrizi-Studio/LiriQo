# Changelog — liriqo-lyrics-parser

## 1.2.0 (Phase 20 — parser v2, backward-compatible)

### Added

- **Central provider registry** (`src/registry.js`): canonical provider IDs, compatibility aliases
  (`musixmatch -> musixmatch_richsync`, `unison -> unison_community`, plus short historical
  spellings), canonical priority orders mirroring the production scheduler
  (`CANONICAL_HIGH_ORDER`, `CANONICAL_TEXT_ORDER`, `CANONICAL_PLAIN_ORDER`), capability map
  (`PROVIDER_MIN_TIER`) and display names. New IDs: `kuwo`, `migu`, `petitlyrics`,
  `musixmatch_richsync`.
- **Kuwo LRCX parser** (`src/kuwo.js`, `parseKuwoLrcx`): native word/character timing from a
  decoded LRCX body (`[kuwo:NNN]` octal key arithmetic over `<a,b[,c]>` markers). CJK-safe
  reconstruction, negative marker handling, line-only fallback. Transport decoding (zlib/XOR)
  stays server-side by design.
- **Migu MRC parser** (`src/migu.js`, `parseMiguMrc`, `stripMiguMetaLines`): native unit timing
  from a decrypted MRC body (QRC-style `unit(marker)` layout, absolute milliseconds).
  XXTEA/UTF-16LE decoding stays server-side by design.
- **PetitLyrics WSY parser** (`src/petitlyrics.js`, `parsePetitLyricsWsy`,
  `classifyPetitLyricsText`): native per-character timing from WSY XML with CDATA/entity
  decoding, Japanese/Latin mixed text, surrogate-pair safety, inferred-end parity with the
  server, and the same degenerate-unit evidence bar.
- **`normalizeProviderTrack(track, options)`** (provider-agnostic normalizer): evidence-based
  `tier` (Jagorawi/Cipali/Bocimi), `timingOrigin`, `granularity` metadata computed from real
  validated units — never from the mere presence of `words[]`.
- **Primary-only responses**: when `tracks` is missing/empty but `primary` is present, the
  primary track is parsed (documented; no double-counting when already in `tracks`).
- **Raw route support in `parseTrack`/`parseLiriQoResponse`**: `krc` (KuGou), `lrcx` (Kuwo),
  `mrc` (Migu), `wsy` (PetitLyrics) raw payloads are parsed when a response exposes them.
- **Granularity & provenance metadata**: per-line `granularity` (`word`/`character`/`phrase`)
  and result-level `timingOrigin`/`granularity` on normalized results; `phrase` labels coarse
  Musixmatch RichSync chunks without inventing word splits.
- **Examples** (`examples/`): `basic-usage.mjs`, `native-word.mjs`, `native-character.mjs`,
  `normalized-response.mjs` — all runnable offline (fixtures embedded).
- **Tests**: deterministic suites for Kuwo, Migu, PetitLyrics, Musixmatch RichSync, registry
  and response-level selection/ranking (82 tests total, up from 38).

### Changed

- `parseMusixmatchRichsync`: word ends are now annotated `derivedEnd: true` (RichSync `o`
  offsets are native starts; unit ends are derived from the next native start or the line end).
- `normalizedTrackToLyrics`: translations are aligned BEFORE instrumental insertion (fixes
  count mismatches caused by inserted instrumental lines); object-indexed top-level `words`
  accepted in addition to arrays.
- `parseLiriQoResponse` selection: quality-first ranking (evidence-based native granular
  timing wins over mere word claims), then canonical registry priority, then stable response
  order. Unknown providers never outrank known providers of equal claim strength.
- `pickTrack`: same quality-first ordering; `syncLevel: "character"` accepted as granular.
- `npm run check` covers all modules; `npm run examples` added.

### Backward compatibility

- All 1.1.0 exports keep their names, signatures and result contracts
  (`richsynced`/`synced`/`plain`/`provider`/`syncedProvider`/`plainProvider`/`route` and the
  Better Lyrics line/parts shape).
- Two additive fields appear on parsed output: per-line `granularity` (only when native parts
  exist) and result-level `timingOrigin`/`granularity`; RichSync parts gain `derivedEnd: true`.
  Consumers using strict deep-equality on these shapes should treat the new fields as
  documented additions.
- `lrclib_wordsync` remains excluded from rich results (derived timing is never native).

## 1.1.0

- Initial parser: Apple Music / Unison TTML, QQ QRC, NetEase YRC, Musixmatch richsync,
  LRCLib/YTM line and plain routes, translation attachment, Better Lyrics result contract.
