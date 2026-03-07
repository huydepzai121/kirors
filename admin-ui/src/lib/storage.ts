const API_KEY_STORAGE_KEY = 'adminApiKey'
const LOCALE_STORAGE_KEY = 'adminUiLocale'

export const DEFAULT_LOCALE = 'en' as const
type StoredLocale = 'en' | 'vi'

function normalizeLocale(value: string | null): StoredLocale {
  return value === 'vi' ? 'vi' : DEFAULT_LOCALE
}

export const storage = {
  getApiKey: () => localStorage.getItem(API_KEY_STORAGE_KEY),
  setApiKey: (key: string) => localStorage.setItem(API_KEY_STORAGE_KEY, key),
  removeApiKey: () => localStorage.removeItem(API_KEY_STORAGE_KEY),
  getLocale: (): StoredLocale => normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY)),
  setLocale: (locale: StoredLocale) => localStorage.setItem(LOCALE_STORAGE_KEY, locale),
}
