import { supabase } from './supabase'

export type Role = 'hospital' | 'family' | 'funeral_home'

/**
 * Hospital and funeral home staff sign in with the email and password on their
 * seeded account (see scripts/seed-funeral-home-users.ts). Accounts are not
 * self-registered.
 */
export async function signInStaff(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/**
 * Starts a family session with no email. Creates an anonymous Supabase user;
 * handle_new_user gives it the family role. The session lives in this browser.
 */
export async function startAnonymousFamilySession() {
  const { error } = await supabase.auth.signInAnonymously()
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
