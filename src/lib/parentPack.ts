// The parent pack on the site: one PDF per admitting class, built by
// `npm run parent-pack` into public/parent-pack/ and open without a login,
// because parents get the link. They hold the format, topics and sample
// questions written for parents: no candidate data, no bank item.

/** Where the PDF for an admit to `classLevel` is served. */
export function parentPackPath(classLevel: number): string {
  return `/parent-pack/reasoning-test-class-${classLevel}.pdf`
}

/** The PDF's full address on `siteUrl`'s site (the test link it travels with, or the site's origin). */
export function parentPackUrl(siteUrl: string, classLevel: number): string {
  return new URL(parentPackPath(classLevel), siteUrl).href
}

/** The line that sends a class's PDF: alone from /downloads, or after the test link. */
export function packMessage(siteUrl: string, classLevel: number): string {
  return `Syllabus and a sample paper for the Class ${classLevel} test: ${parentPackUrl(siteUrl, classLevel)}`
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
