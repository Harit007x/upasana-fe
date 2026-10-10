/**
 * Mobile numbers: the country codes offered, how long a number may be in each,
 * and how one is stored and shown.
 *
 * Numbers are stored in E.164 ("+919876543210") so the backend, SMS providers
 * and WhatsApp links can all use them as is. Only countries whose mobile
 * numbers are at least ten digits are listed, because the form requires ten.
 */

export const COUNTRY_CODES = [
  { code: "+91", country: "India", flag: "🇮🇳", min: 10, max: 10 },
  { code: "+1", country: "USA / Canada", flag: "🇺🇸", min: 10, max: 10 },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧", min: 10, max: 10 },
] as const

export type CountryCode = (typeof COUNTRY_CODES)[number]["code"]

export const DEFAULT_COUNTRY_CODE: CountryCode = "+91"

export function countryFor(code: string) {
  return COUNTRY_CODES.find((c) => c.code === code) ?? COUNTRY_CODES[0]
}

/**
 * Cleans what was typed or pasted into the number field: digits only, and a
 * pasted country code ("+91 98765 43210") or trunk zero ("07700 900123")
 * dropped, so a correct number never fails for how it was written.
 */
export function cleanNationalNumber(raw: string, code: string) {
  let digits = raw.replace(/\D/g, "")
  const { max } = countryFor(code)
  const codeDigits = code.slice(1)
  if (digits.length > max && digits.startsWith(codeDigits)) {
    digits = digits.slice(codeDigits.length)
  }
  if (digits.length > max && digits.startsWith("0")) {
    digits = digits.slice(1)
  }
  return digits
}

/** Why a national number is not valid for its country, or undefined when it is. */
export function mobileError(digits: string, code: string) {
  const { min, max, country } = countryFor(code)
  if (!/^\d+$/.test(digits)) return "Use digits only"
  if (digits.length < min) return `Enter at least ${min} digits`
  if (digits.length > max) return `${country} mobile numbers have ${max} digits`
  if (code === "+91" && !/^[6-9]/.test(digits)) {
    return "Indian mobile numbers start with 6, 7, 8 or 9"
  }
  return undefined
}

/** "+91" + "9876543210" → "+919876543210" */
export function toE164(code: string, digits: string) {
  return `${code}${digits}`
}

/**
 * "+919876543210" → { code: "+91", national: "9876543210" }: a stored number
 * back into the two form fields. Undefined for a country the form does not offer.
 */
export function fromE164(e164: string) {
  const country = [...COUNTRY_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((c) => e164.startsWith(c.code))
  return country ? { code: country.code, national: e164.slice(country.code.length) } : undefined
}

/** "+919876543210" → "+91 98765 43210". Anything unrecognised is shown as stored. */
export function formatMobile(e164: string) {
  const country = [...COUNTRY_CODES]
    .sort((a, b) => b.code.length - a.code.length)
    .find((c) => e164.startsWith(c.code))
  if (!country) return e164
  const national = e164.slice(country.code.length)
  const grouped =
    country.code === "+91"
      ? `${national.slice(0, 5)} ${national.slice(5)}`
      : country.code === "+1"
        ? `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`
        : `${national.slice(0, 4)} ${national.slice(4)}`
  return `${country.code} ${grouped}`
}
