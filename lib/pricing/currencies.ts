// The set of ISO 4217 currency codes the app accepts as a stored or
// displayed currency. Mirrors the list Frankfurter (api.frankfurter.dev)
// publishes exchange rates for — keeping these two aligned means any
// stored amount can always be converted to any displayed currency.
//
// Add a code here AND ship the corresponding migration check update
// (none exists today; column-level checks were dropped in
// 20260528120000_multi_currency.sql in favour of app-side validation).

export const SUPPORTED_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "ISK",
  "CNY",
  "HKD",
  "SGD",
  "KRW",
  "THB",
  "IDR",
  "MYR",
  "PHP",
  "INR",
  "ILS",
  "TRY",
  "ZAR",
  "MXN",
  "BRL",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_NAMES: Record<Currency, string> = {
  EUR: "Euro",
  USD: "US Dollar",
  GBP: "British Pound",
  JPY: "Japanese Yen",
  CHF: "Swiss Franc",
  CAD: "Canadian Dollar",
  AUD: "Australian Dollar",
  NZD: "New Zealand Dollar",
  SEK: "Swedish Krona",
  NOK: "Norwegian Krone",
  DKK: "Danish Krone",
  PLN: "Polish Złoty",
  CZK: "Czech Koruna",
  HUF: "Hungarian Forint",
  RON: "Romanian Leu",
  BGN: "Bulgarian Lev",
  ISK: "Icelandic Króna",
  CNY: "Chinese Yuan",
  HKD: "Hong Kong Dollar",
  SGD: "Singapore Dollar",
  KRW: "South Korean Won",
  THB: "Thai Baht",
  IDR: "Indonesian Rupiah",
  MYR: "Malaysian Ringgit",
  PHP: "Philippine Peso",
  INR: "Indian Rupee",
  ILS: "Israeli Shekel",
  TRY: "Turkish Lira",
  ZAR: "South African Rand",
  MXN: "Mexican Peso",
  BRL: "Brazilian Real",
};

const CURRENCY_SET = new Set<string>(SUPPORTED_CURRENCIES);

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && CURRENCY_SET.has(value);
}
