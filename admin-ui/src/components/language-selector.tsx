import { useLocale } from '@/lib/locale'

interface LanguageSelectorProps {
  compact?: boolean
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useLocale()

  return (
    <label className={`inline-flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="text-muted-foreground">{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as 'en' | 'vi')}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="en">{t('languageEnglish')}</option>
        <option value="vi">{t('languageVietnamese')}</option>
      </select>
    </label>
  )
}
