/** At least first and last name; letters, spaces, apostrophes, hyphens. */
export const FULL_NAME_PATTERN =
  /^[A-Za-z][A-Za-z.'-]*\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)*$/

export const US_PHONE_PATTERN = /^\d{3}-\d{3}-\d{4}$/

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidFullName(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || !FULL_NAME_PATTERN.test(trimmed)) return false
  return trimmed.split(/\s+/).filter(Boolean).length >= 2
}

export function isValidUsPhone(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  return US_PHONE_PATTERN.test(trimmed)
}

export function isValidContactEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/** Strip non-digits and format as ###-###-#### while typing. */
export function formatUsPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

export type ContactFieldErrors = {
  name?: string
  phone?: string
  email?: string
}

export function validateContactFields(input: {
  name: string
  phone: string
  email: string
}): ContactFieldErrors {
  const errors: ContactFieldErrors = {}
  if (!isValidFullName(input.name)) {
    errors.name = 'Enter first and last name (e.g. Jane Smith).'
  }
  if (!isValidContactEmail(input.email)) {
    errors.email = 'Enter a valid email (e.g. you@example.com).'
  }
  if (!isValidUsPhone(input.phone)) {
    errors.phone = 'Enter phone as ###-###-####.'
  }
  return errors
}
