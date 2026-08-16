/** Dialling codes used by the checkout phone field. Oman (+968) is the default. */
export type DialCode = { iso: string; code: string; flag: string; ar: string; en: string };

export const DIAL_CODES: DialCode[] = [
  { iso: "OM", code: "968", flag: "🇴🇲", ar: "سلطنة عُمان", en: "Oman" },
  { iso: "AE", code: "971", flag: "🇦🇪", ar: "الإمارات", en: "UAE" },
  { iso: "SA", code: "966", flag: "🇸🇦", ar: "السعودية", en: "Saudi Arabia" },
  { iso: "KW", code: "965", flag: "🇰🇼", ar: "الكويت", en: "Kuwait" },
  { iso: "QA", code: "974", flag: "🇶🇦", ar: "قطر", en: "Qatar" },
  { iso: "BH", code: "973", flag: "🇧🇭", ar: "البحرين", en: "Bahrain" },
  { iso: "YE", code: "967", flag: "🇾🇪", ar: "اليمن", en: "Yemen" },
  { iso: "JO", code: "962", flag: "🇯🇴", ar: "الأردن", en: "Jordan" },
  { iso: "SY", code: "963", flag: "🇸🇾", ar: "سوريا", en: "Syria" },
  { iso: "LB", code: "961", flag: "🇱🇧", ar: "لبنان", en: "Lebanon" },
  { iso: "IQ", code: "964", flag: "🇮🇶", ar: "العراق", en: "Iraq" },
  { iso: "PS", code: "970", flag: "🇵🇸", ar: "فلسطين", en: "Palestine" },
  { iso: "EG", code: "20", flag: "🇪🇬", ar: "مصر", en: "Egypt" },
  { iso: "SD", code: "249", flag: "🇸🇩", ar: "السودان", en: "Sudan" },
  { iso: "LY", code: "218", flag: "🇱🇾", ar: "ليبيا", en: "Libya" },
  { iso: "TN", code: "216", flag: "🇹🇳", ar: "تونس", en: "Tunisia" },
  { iso: "DZ", code: "213", flag: "🇩🇿", ar: "الجزائر", en: "Algeria" },
  { iso: "MA", code: "212", flag: "🇲🇦", ar: "المغرب", en: "Morocco" },
  { iso: "TR", code: "90", flag: "🇹🇷", ar: "تركيا", en: "Turkey" },
  { iso: "IN", code: "91", flag: "🇮🇳", ar: "الهند", en: "India" },
  { iso: "PK", code: "92", flag: "🇵🇰", ar: "باكستان", en: "Pakistan" },
  { iso: "BD", code: "880", flag: "🇧🇩", ar: "بنغلاديش", en: "Bangladesh" },
  { iso: "PH", code: "63", flag: "🇵🇭", ar: "الفلبين", en: "Philippines" },
  { iso: "ID", code: "62", flag: "🇮🇩", ar: "إندونيسيا", en: "Indonesia" },
  { iso: "GB", code: "44", flag: "🇬🇧", ar: "بريطانيا", en: "United Kingdom" },
  { iso: "US", code: "1", flag: "🇺🇸", ar: "أمريكا / كندا", en: "USA / Canada" },
  { iso: "DE", code: "49", flag: "🇩🇪", ar: "ألمانيا", en: "Germany" },
  { iso: "FR", code: "33", flag: "🇫🇷", ar: "فرنسا", en: "France" },
];

export function dialLabel(d: DialCode, lang: "ar" | "en") {
  return `${d.flag} ${lang === "ar" ? d.ar : d.en} +${d.code}`;
}
