'use client'

import { setLocale } from '../appearance'
import { useAppearance } from '../preferences'
import type { Locale } from '../../lib/format'
import './auth-card.css'

/** The visible code, and the endonym that names the language to someone who cannot read the current page. */
const languages: Record<Locale, { code: string; name: string }> = {
  en: { code: 'EN', name: 'English' },
  ru: { code: 'RU', name: 'Русский' },
}

/**
 * Two languages need no picker: the button shows the other language's code and switches to it in one tap. The page
 * itself shows the current language. The accessible name is the endonym with the visible code, so voice control can
 * say "RU". Both codes share one grid cell, so the button never changes width when the label swaps.
 */
export function LanguageControl({
  locale,
  onLocaleChange = setLocale,
}: {
  locale: Locale
  onLocaleChange?: (locale: Locale) => void
}) {
  const other: Locale = useAppearance(locale).locale === 'ru' ? 'en' : 'ru'
  const { code, name } = languages[other]
  return (
    <button
      type="button"
      className="auth-corner-control"
      data-kind="language"
      lang={other}
      aria-label={`${name} (${code})`}
      title={name}
      onClick={() => onLocaleChange(other)}
    >
      {(Object.keys(languages) as Locale[]).map((key) => (
        <span key={key} aria-hidden="true" data-shown={key === other || undefined}>
          {languages[key].code}
        </span>
      ))}
    </button>
  )
}
