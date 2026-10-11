'use server'

import { revalidatePath } from 'next/cache'
import { userClient } from '@/server/auth'
import { markContactRead } from '@/server/contact'

// A thin wrapper: RLS refuses anyone but superadmin, and markContactRead
// reports that as not ok rather than pretending it worked.
export async function markReadAction(id: string, read: boolean): Promise<void> {
  const result = await markContactRead(await userClient(), id, read)
  if (result.ok) revalidatePath('/messages')
}
