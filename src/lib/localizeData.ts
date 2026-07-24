import type { LanguageCode } from '../i18n/LanguageContext';

/**
 * Reads a `${base}_${language}` field from a data record, falling back to
 * `${base}_en` if the translated field is missing. Used for JSON data content
 * (zones, landmarks, scams, taxi guide, emergency) where each translatable
 * field is stored as sibling keys like `name_en` / `name_ka` / `name_ru`.
 */
export function localizedField(
  item: Record<string, unknown>,
  base: string,
  language: LanguageCode,
): string {
  const value = item[`${base}_${language}`] ?? item[`${base}_en`];
  return typeof value === 'string' ? value : '';
}

/** Same as localizedField but for string-array fields like `tips_en` / `tips_ka`. */
export function localizedList(
  item: Record<string, unknown>,
  base: string,
  language: LanguageCode,
): string[] {
  const value = item[`${base}_${language}`] ?? item[`${base}_en`];
  return Array.isArray(value) ? (value as string[]) : [];
}
