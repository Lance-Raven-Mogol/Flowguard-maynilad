/**
 * Generic Supabase data access for the resource API. All operations use the
 * service-role client and target a table by name (the caller — resource.service
 * — is responsible for validating the table/columns first).
 */
import { requireSupabase, supabase } from './supabase.js';

export type Row = Record<string, unknown>;

/** PostgREST error shape we care about for mapping to HTTP statuses. */
export interface DbError {
  code?: string;
  message: string;
}

export async function listRows(table: string, opts: { archived?: 'only' | 'all' } = {}): Promise<Row[]> {
  const sb = requireSupabase();
  let query = sb.from(table).select('*').order('created_at', { ascending: false });
  if (opts.archived === 'only') query = query.eq('archived', true);
  else if (opts.archived !== 'all') query = query.eq('archived', false);
  const { data, error } = await query;
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

/** Fetch a single row by id, or null when it doesn't exist. */
export async function getRowById(table: string, id: string): Promise<Row | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error as DbError;
  return (data ?? null) as Row | null;
}

/** Fetch all rows where `column` equals `value` (e.g. job orders for an incident). */
export async function findRowsBy(table: string, column: string, value: unknown): Promise<Row[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from(table).select('*').eq(column, value);
  if (error) throw error as DbError;
  return (data ?? []) as Row[];
}

/** Patch every row where `column` equals `value`. */
export async function updateRowsBy(
  table: string,
  column: string,
  value: unknown,
  patch: Row,
): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from(table).update(patch).eq(column, value);
  if (error) throw error as DbError;
}

/** Keep a customer's complaints attached to them when their display name changes. */
export async function renameIncidentReporter(from: string, to: string): Promise<void> {
  if (!supabase || from === to) return;
  const { error } = await supabase.from('incidents').update({ reported_by: to }).eq('reported_by', from);
  if (error) throw error as DbError;
}
