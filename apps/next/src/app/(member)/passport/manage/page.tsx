import { redirect } from 'next/navigation'
import countries from '@kuuki/data/countries.json'

/**
 * Retired: bulk aircraft assignment lives in the Journal's Set aircraft action. Old links land on the Passport, and a
 * legacy link carrying a catalogue code on that country's sheet.
 */
export default async function ManagePassport({
  searchParams,
}: {
  searchParams: Promise<{ countryCode?: string }>
}) {
  const { countryCode } = await searchParams
  redirect(
    typeof countryCode === 'string' && Object.hasOwn(countries, countryCode)
      ? `/passport?country=${countryCode}`
      : '/passport',
  )
}
