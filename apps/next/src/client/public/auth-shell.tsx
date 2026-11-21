import { LocaleText } from '../locale-text'
import type { ReactNode } from 'react'
import type { Locale } from '../../lib/format'
import './auth.css'

export function AuthBrand({ locale }: { locale: Locale }) {
  return (
    <div className="auth-shell-brand">
      <span className="auth-kana" aria-hidden="true">
        くうき
      </span>
      <p>
        <LocaleText
          locale={locale}
          en="Your personal flight journal."
          ru="Личный журнал перелётов."
        />
      </p>
    </div>
  )
}

export function AuthPanel({
  title,
  description,
  children,
}: {
  title: ReactNode
  description?: string
  children: ReactNode
}) {
  return (
    <>
      <h1>{title}</h1>
      {description ? <p className="auth-description">{description}</p> : null}
      {children}
    </>
  )
}

export function AuthShell({
  locale,
  title,
  description,
  children,
}: {
  locale: Locale
  title: ReactNode
  description?: string
  children: ReactNode
}) {
  return (
    <div className="auth-shell">
      <AuthBrand locale={locale} />
      <section className="auth-shell-panel">
        <AuthPanel title={title} description={description}>
          {children}
        </AuthPanel>
      </section>
    </div>
  )
}
