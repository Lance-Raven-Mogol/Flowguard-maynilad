/**
 * Generic Supabase data access for the resource API. All operations use the
 * service-role client and target a table by name (the caller — resource.service
 * — is responsible for validating the table/columns first).
 */
import { requireSupabase } from './supabase.js';

export type Row = Record<string, unknown>;

/** PostgREST error shape we care about for mapping to HTTP statuses. */
export interface DbError {
  code?: string;
  message: string;
}

export async function listRows(table: string): Promise<Row[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: false });
  if (error) throw error as DbError;
  return (data ?? []) as Row[];
}

export async function insertRow(table: string, values: Row): Promise<Row> {
  const sb = requireSupabase();
  const { data, error } = await sb.from(table).insert(values).select('*').single();
  if (error) throw error as DbError;
  return data as Row;
}

export async function updateRow(table: string, id: string, values: Row): Promise<Row | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from(table).update(values).eq('id', id).select('*').maybeSingle();
  if (error) throw error as DbError;
  return (data ?? null) as Row | null;
}

export async function deleteRow(table: string, id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) throw error as DbError;
}
