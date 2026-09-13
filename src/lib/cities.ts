import type { LanguageCode } from '../i18n/LanguageContext';

/**
 * The cities a partner can list under and a tourist can filter by.
 *
 * A city name used to reach the app from two very different places: the OS
 * reverse geocoder (localised to the phone's language — "Tbilisi", "თბილისი"
 * or "Тбилиси" for the same spot) and a partner typing into a form. A plain
 * prefix match between the two failed silently: an approved car listed under
 * "თბილისი" never showed to a tourist whose phone said "Tbilisi".
 *
 * Forms now pick from this list and store `en` as the canonical value;
 * `isSameCity` still accepts any spelling so rows saved before the picker
 * existed keep matching.
 */
export type City = { key: string; en: string; ka: string; ru: string; aliases?: string[] };

export const CITIES: City[] = [
  { key: 'tbilisi', en: 'Tbilisi', ka: 'თბილისი', ru: 'Тбилиси' },
  { key: 'batumi', en: 'Batumi', ka: 'ბათუმი', ru: 'Батуми' },
  { key: 'kutaisi', en: 'Kutaisi', ka: 'ქუთაისი', ru: 'Кутаиси' },
  { key: 'rustavi', en: 'Rustavi', ka: 'რუსთავი', ru: 'Рустави' },
  { key: 'gori', en: 'Gori', ka: 'გორი', ru: 'Гори' },
  { key: 'zugdidi', en: 'Zugdidi', ka: 'ზუგდიდი', ru: 'Зугдиди' },
  { key: 'poti', en: 'Poti', ka: 'ფოთი', ru: 'Поти' },
  { key: 'telavi', en: 'Telavi', ka: 'თელავი', ru: 'Телави' },
  { key: 'mtskheta', en: 'Mtskheta', ka: 'მცხეთა', ru: 'Мцхета' },
  { key: 'kobuleti', en: 'Kobuleti', ka: 'ქობულეთი', ru: 'Кобулети' },
  { key: 'borjomi', en: 'Borjomi', ka: 'ბორჯომი', ru: 'Боржоми' },
  { key: 'mestia', en: 'Mestia', ka: 'მესტია', ru: 'Местиа', aliases: ['местия'] },
  { key: 'sighnaghi', en: 'Sighnaghi', ka: 'სიღნაღი', ru: 'Сигнахи', aliases: ['signagi'] },
  { key: 'akhaltsikhe', en: 'Akhaltsikhe', ka: 'ახალციხე', ru: 'Ахалцихе' },
  { key: 'stepantsminda', en: 'Stepantsminda (Kazbegi)', ka: 'სტეფანწმინდა (ყაზბეგი)', ru: 'Степанцминда (Казбеги)', aliases: ['stepantsminda', 'kazbegi', 'სტეფანწმინდა', 'ყაზბეგი', 'степанцминда', 'казбеги'] },
  { key: 'gudauri', en: 'Gudauri', ka: 'გუდაური', ru: 'Гудаури' },
  { key: 'bakuriani', en: 'Bakuriani', ka: 'ბაკურიანი', ru: 'Бакуриани' },
  { key: 'ureki', en: 'Ureki', ka: 'ურეკი', ru: 'Уреки' },
  { key: 'kvareli', en: 'Kvareli', ka: 'ყვარელი', ru: 'Кварели' },
  { key: 'ambrolauri', en: 'Ambrolauri', ka: 'ამბროლაური', ru: 'Амбролаури' },
];

const ALIAS_TO_KEY = new Map<string, string>();
for (const city of CITIES) {
  for (const alias of [city.en, city.ka, city.ru, ...(city.aliases ?? [])]) {
    ALIAS_TO_KEY.set(clean(alias), city.key);
  }
}

function clean(raw: string): string {
  return raw
    .split(',')[0]
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+(city|ქალაქი|город)$/u, '')
    .trim();
}

/** "Tbilisi, Georgia" → "tbilisi"; "თბილისი" → "tbilisi"; "Foo Town" → "foo town". */
export function cityKey(raw: string): string {
  const cleaned = clean(raw);
  return ALIAS_TO_KEY.get(cleaned) ?? cleaned;
}

/** True when both strings name the same city, whatever language they are in. */
export function isSameCity(a: string, b: string): boolean {
  const keyA = cityKey(a);
  const keyB = cityKey(b);
  if (!keyA || !keyB) return false;
  return keyA === keyB || keyA.startsWith(keyB) || keyB.startsWith(keyA);
}

/** The city's name in the tourist's language; unknown cities come back as typed. */
export function cityName(raw: string, language: LanguageCode): string {
  const city = CITIES.find((item) => item.key === cityKey(raw));
  return city ? city[language] : raw;
}
