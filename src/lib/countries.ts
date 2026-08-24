import countriesData from '../data/countries.json';
import type { LanguageCode } from '../i18n/LanguageContext';
import type { EmergencyEmbassy } from './remoteData';

// Full ISO 3166-1 country list with names in all three app languages, plus a
// link to emergency.json's embassy entry for the ~10 countries that have one
// in Georgia. Generated from ICU data rather than hand-translated — see the
// CLAUDE.md log entry for how to regenerate it.

export type Country = {
  code: string;
  name_en: string;
  name_ka: string;
  name_ru: string;
  /** emergency.json embassy id, or null if that country has none in Georgia. */
  embassyId: string | null;
};

export const countries = countriesData as Country[];

const byCode = new Map(countries.map((c) => [c.code, c]));
const byEmbassyId = new Map(
  countries.filter((c) => c.embassyId).map((c) => [c.embassyId as string, c]),
);

export function countryName(country: Country, language: LanguageCode): string {
  if (language === 'ka') return country.name_ka;
  if (language === 'ru') return country.name_ru;
  return country.name_en;
}

/**
 * Resolves whatever is stored as the user's country.
 *
 * Accepts both the current format (ISO code, e.g. "US") and the original one
 * (an emergency.json embassy id, e.g. "usa") that was stored before the picker
 * covered every country — so testers who already chose a country don't have
 * their embassy silently disappear.
 */
export function findCountry(storedId: string | null): Country | null {
  if (!storedId) return null;
  return byCode.get(storedId) ?? byEmbassyId.get(storedId) ?? null;
}

/**
 * The embassy for a stored country id, or null when that country has none in
 * Georgia (which the UI shows explicitly rather than leaving blank).
 */
export function findEmbassy(
  storedId: string | null,
  embassies: EmergencyEmbassy[],
): EmergencyEmbassy | null {
  const country = findCountry(storedId);
  if (!country?.embassyId) return null;
  return embassies.find((e) => e.id === country.embassyId) ?? null;
}

/**
 * Common names people actually type that don't appear in the official ICU
 * names — including the ISO alpha-3 codes ("usa", "deu") most people think of
 * as *the* country code. Without these, "usa" found nothing at all and "uk"
 * returned Ukraine. Extend freely; keys must be lowercase.
 */
const ALIASES: Record<string, string[]> = {
  US: ['usa', 'us', 'america', 'united states of america', 'ამერიკა', 'сша', 'америка'],
  GB: [
    'uk', 'gb', 'gbr', 'britain', 'great britain', 'england', 'scotland', 'wales',
    'ბრიტანეთი', 'ინგლისი', 'англия', 'великобритания', 'британия',
  ],
  DE: ['deu', 'ger', 'deutschland'],
  FR: ['fra'],
  IL: ['isr'],
  TR: ['tur', 'türkiye', 'turkiye'],
  PL: ['pol', 'polska'],
  UA: ['ukr'],
  AZ: ['aze'],
  AM: ['arm'],
  AE: ['uae', 'emirates', 'united arab emirates'],
  NL: ['holland', 'nld', 'nederland'],
  KR: ['south korea', 'kor'],
  KP: ['north korea'],
  CZ: ['czech republic', 'czechia'],
  CH: ['swiss', 'che'],
  ES: ['esp', 'espana', 'españa'],
  IT: ['ita', 'italia'],
  RU: ['rus', 'россия'],
  CN: ['chn', 'prc'],
  JP: ['jpn', 'nippon'],
  IN: ['ind'],
  BR: ['bra', 'brasil'],
  CA: ['can'],
  AU: ['aus'],
  GE: ['geo', 'sakartvelo'],
};

// Flattened for lookup: alias -> country code.
const aliasToCode = new Map<string, string>();
for (const [code, list] of Object.entries(ALIASES)) {
  for (const alias of list) aliasToCode.set(alias, code);
}

/**
 * Searches all three name languages plus ISO codes and common aliases.
 *
 * Results are ranked, not just filtered: an exact code/alias hit and a
 * "starts with" hit both outrank a mid-string hit. Without this, searching
 * "uk" listed Ukraine above the United Kingdom, and "america" surfaced
 * American Samoa instead of the United States.
 */
export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return countries;

  const aliasCode = aliasToCode.get(q);

  const scored: { country: Country; rank: number }[] = [];
  for (const c of countries) {
    const names = [c.name_en.toLowerCase(), c.name_ka.toLowerCase(), c.name_ru.toLowerCase()];
    let rank: number;

    if (c.code.toLowerCase() === q || aliasCode === c.code) {
      rank = 0; // exact code or known alias
    } else if (names.some((n) => n.startsWith(q))) {
      rank = 1;
    } else if (names.some((n) => n.includes(q))) {
      rank = 2;
    } else if (ALIASES[c.code]?.some((a) => a.startsWith(q))) {
      rank = 3; // partial alias, e.g. "brit" -> Britain
    } else {
      continue;
    }
    scored.push({ country: c, rank });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.country.name_en.localeCompare(b.country.name_en, 'en'))
    .map((s) => s.country);
}
