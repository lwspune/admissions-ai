import 'server-only'
import type { Db } from './supabase'
import type { Org } from '@/lib/orgs'

/** Every org, by name. Any signed-in staff member or teacher may read them (migration 0030). */
export async function listOrgs(db: Db): Promise<Org[]> {
  const { data, error } = await db.from('organizations').select('id, name').order('name')
  if (error) throw new Error(`could not read orgs: ${error.message}`)
  return data as Org[]
}
