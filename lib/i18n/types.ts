/** Built-in interface language. */
export type Locale = "en";

/** Simple interpolation parameters for translation strings. */
export type TranslationParams = Record<string, string | number>;

/** Registrable language pack definition. */
export interface LocalePlugin {
  /** Unique language identifier. */
  id: string;
  /** Display name for the language switcher menu. */
  label: string;
  /** Translation messages indexed by stable keys. */
  messages: Record<string, string>;
}
