// Texts in the player's language, and numbers written their way.
import { de } from "./texts.de";
import { en } from "./texts.en";

export type Lang = "en" | "de";
const TEXTS: Record<Lang, Record<string, string>> = { en, de };
let lang: Lang = "en";
let numbers = new Intl.NumberFormat("en");

export function setLang(l: Lang) {
  lang = l;
  numbers = new Intl.NumberFormat(l === "de" ? "de-CH" : "en");
  document.documentElement.lang = l;
}
export const getLang = () => lang;
export const browserLang = (): Lang => ((navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en");

/** The text for a key, with {placeholders} filled in. An argument starting with "@" is itself a key. */
export function t(key: string, args?: Record<string, string | number>): string {
  let s = TEXTS[lang][key] ?? en[key] ?? key;
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      const val = typeof v === "string" && v.startsWith("@") ? t(v.slice(1)) : typeof v === "number" ? num(v) : v;
      s = s.split("{" + k + "}").join(String(val));
    }
  }
  return s;
}
export const has = (key: string) => key in en;

export const num = (n: number) => numbers.format(Math.round(n));
/** Big numbers short: 12,400 becomes 12.4k. */
export function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, "") + "M";
  if (a >= 10000) return (n / 1000).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, "") + "k";
  return num(n);
}
export const money = (n: number) => "🪙 " + num(n);
export const pct = (v: number) => Math.round(v * 100) + "%";
