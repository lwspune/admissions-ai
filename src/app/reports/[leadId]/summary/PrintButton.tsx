'use client'

import { Icon } from '@/components/icons'
import { btn } from '@/components/ui'

/** Opens the browser's print dialog, where "Save as PDF" makes the file to send. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={btn('primary')}
    >
      <Icon name="printer" className="h-4 w-4" />
      Save as PDF
    </button>
  )
}
