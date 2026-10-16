'use server'

import { revalidatePath } from 'next/cache'
import { requireStaff, userClient } from '@/server/auth'
import { lookupPaperForScan, recordPaperScan, type ScanPaper, type ScanResult } from '@/server/paperScan'
import { isUuid } from '@/lib/leads'
import type { ScanAnswer } from '@/lib/scanResult'

/** `retry`: a passing failure, worth asking again; otherwise the answer stands. */
export type FindResult = { ok: true; paper: ScanPaper } | { ok: false; error: string; retry?: boolean }
export type FileResult = { ok: true; result: ScanResult } | { ok: false; error: string }

/** The paper a sheet's printed number belongs to. Counsellors and superadmin only. */
export async function findPaper(paperNo: number): Promise<FindResult> {
  const staff = await requireStaff()
  if (staff.role === 'telecaller') return { ok: false, error: 'Only a counsellor can scan answer sheets.' }
  if (!Number.isInteger(paperNo) || paperNo < 100_000 || paperNo > 999_999) {
    return { ok: false, error: 'That is not a paper number.' }
  }
  try {
    const paper = await lookupPaperForScan(await userClient(), paperNo, staff.role)
    return paper ? { ok: true, paper } : { ok: false, error: `No paper test has the number ${paperNo}.` }
  } catch (e) {
    console.error('scan: paper lookup failed:', e)
    return { ok: false, error: 'Could not look the paper up. Trying again…', retry: true }
  }
}

/**
 * Files a scanned sheet whose photo is already stored. The database grades it
 * and refuses anything out of turn; this only reports what it said.
 */
export async function fileScan(assessmentId: string, answers: ScanAnswer[]): Promise<FileResult> {
  const staff = await requireStaff()
  if (staff.role === 'telecaller') return { ok: false, error: 'Only a counsellor can scan answer sheets.' }
  if (!isUuid(assessmentId)) return { ok: false, error: 'Unknown paper test.' }
  try {
    const result = await recordPaperScan(await userClient(), { assessmentId, answers }, staff.role)
    revalidatePath('/leads')
    return { ok: true, result }
  } catch (e) {
    console.error('scan: filing failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the scan.' }
  }
}
