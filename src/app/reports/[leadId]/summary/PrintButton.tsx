'use client'

/** Opens the browser's print dialog, where "Save as PDF" makes the file to send. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      Save as PDF
    </button>
  )
}
