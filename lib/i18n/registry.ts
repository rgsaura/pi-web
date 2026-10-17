import { enLocale } from "./messages/en";
import type { Locale, LocalePlugin } from "./types";

const localePlugins: LocalePlugin[] = [enLocale];

/**
 * Retrieve a registered language pack by ID.
 * @param id Language identifier
 * @returns Registered language pack, or undefined if not found
 */
export function getLocalePlugin(id: string): LocalePlugin | undefined {
  return localePlugins.find((plugin) => plugin.id === id);
}

/** Get the stable list of supported language IDs. */
export function getSupportedLocales(): string[] {
  return localePlugins.map((plugin) => plugin.id);
}

/**
 * Resolve browser language list to a supported locale (always 'en').
 * @param languages Browser prioritized language list
 * @returns Always 'en'
 */
export function resolveBrowserLocale(_languages: readonly string[]): Locale {
  return "en";
}
