// The parent pack on the site: one PDF per admitting class, built by
// `npm run parent-pack` into public/parent-pack/ and open without a login,
// because parents get the link. They hold the format, topics and sample
// questions written for parents: no candidate data, no bank item.

import type { Lang } from './hindi'

/**
 * Where the PDF for an admit to `classLevel` is served. Each class has an
 * English sheet and, since 2026-10-11, a Hindi edition beside it.
 */
export function parentPackPath(classLevel: number, lang: Lang = 'en'): string {
  return `/parent-pack/reasoning-test-class-${classLevel}${lang === 'hi' ? '-hi' : ''}.pdf`
}

/** The PDF's full address on `siteUrl`'s site (the test link it travels with, or the site's origin). */
export function parentPackUrl(siteUrl: string, classLevel: number, lang: Lang = 'en'): string {
  return new URL(parentPackPath(classLevel, lang), siteUrl).href
}

/**
 * The line that sends a class's PDF: alone from /downloads, or after the test
 * link. The issue message sends the English one; Hindi goes from /downloads.
 */
export function packMessage(siteUrl: string, classLevel: number, lang: Lang = 'en'): string {
  const url = parentPackUrl(siteUrl, classLevel, lang)
  return lang === 'hi'
    ? `कक्षा ${classLevel} की परीक्षा का पाठ्यक्रम और नमूना प्रश्नपत्र (हिंदी): ${url}`
    : `Syllabus and a sample paper for the Class ${classLevel} test: ${url}`
}

/**
 * The WhatsApp message for a freshly issued test. The test link comes first:
 * WhatsApp previews the first link, and the test is what the parent must act
 * on within three hours.
 */
export function issueMessage({
  name,
  testUrl,
  classLevel,
}: {
  name: string | null
  testUrl: string
  classLevel: number | null
}): string {
  const test = `Hello, this is the aptitude test link for ${name}. Please open it and hand the phone to them. The link works for 3 hours: ${testUrl}`
  if (classLevel === null) return test
  return `${test}\n\n${packMessage(testUrl, classLevel)}`
}
