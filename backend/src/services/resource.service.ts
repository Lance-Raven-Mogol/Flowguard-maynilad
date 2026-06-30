/**
 * Resource service — business logic for the generic CRUD API: role checks,
 * field whitelisting + coercion, auto-generated keys, asset health enrichment,
 * and translation of Postgres errors into HTTP errors.
 */
import { RESOURCES, type ResourceDef } from '../config/resources.js';
import * as repo from '../models/resourceRepo.js';
import type { Row, DbError } from '../models/resourceRepo.js';
import type { Role } from '../models/types.js';
import { withAssetHealth } from './assetHealth.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';

function getDef(entity: string): ResourceDef {
  const def = RESOURCES[entity];
  if (!def) throw notFound(`Unknown resource "${entity}".`);
  return def;
}

function canWrite(def: ResourceDef, role: Role): boolean {
  return role === 'general-manager' || def.writeRoles.includes(role);
}

const randDigits = (n: number): string =>
  Math.floor(Math.random() * 10 ** n)
    .toString()
    .padStart(n, '0');

/** Whitelist + coerce a request body into a safe set of column values. */
function sanitize(def: ResourceDef, body: Record<string, unknown>): Row {
  const out: Row = {};
  for (const col of def.allowed) {
    if (!(col in body)) continue;
    let value = body[col];

    if (def.nullable?.includes(col) && (value === '' || value === undefined)) {
      value = null;
    } else if (def.numeric?.includes(col)) {
      if (value === '' || value === null || value === undefined) continue;
      const num = Number(value);
      if (Number.isNaN(num)) throw badRequest(`"${col}" must be a number.`);
      value = num;
    } else if (typeof value === 'string') {
      value = value.trim();
    }
    out[col] = value;
  }
  return out;
}

function mapDbError(err: unknown): never {
  const e = err as DbError;
  if (e?.code === '23505') throw conflict('A record with that identifier already exists.');
  if (e?.code === '23514') throw badRequest('One of the fields has an invalid value.');
  if (e?.code === '23502') throw badRequest('A required field is missing.');
  throw err as Error;
}

function enrich(entity: string, row: Row): Row {
  return entity === 'assets' ? withAssetHealth(row) : row;
}

export const resourceService = {
  async list(entity: string): Promise<Row[]> {
    const def = getDef(entity);
    const rows = await repo.listRows(def.table);
    return entity === 'assets' ? rows.map(withAssetHealth) : rows;
  },

  async create(entity: string, role: Role, body: Record<string, unknown>): Promise<Row> {
    const def = getDef(entity);
    if (!canWrite(def, role)) throw forbidden('You do not have permission to create this record.');

    const values = sanitize(def, body);
    for (const field of def.required) {
      if (values[field] === undefined || values[field] === '' || values[field] === null) {
        throw badRequest(`"${field}" is required.`);
      }
    }
    for (const key of def.autoKeys ?? []) {
      if (!values[key.column]) values[key.column] = `${key.prefix}-${randDigits(key.digits)}`;
    }

    try {
      const row = await repo.insertRow(def.table, values);
      return enrich(entity, row);
    } catch (err) {
      mapDbError(err);
    }
  },

  async update(entity: string, role: Role, id: string, body: Record<string, unknown>): Promise<Row> {
    const def = getDef(entity);
    if (!canWrite(def, role)) throw forbidden('You do not have permission to update this record.');

    const values = sanitize(def, body);
    if (def.touch) values[def.touch] = new Date().toISOString();
    if (Object.keys(values).length === 0) throw badRequest('No valid fields to update.');

    try {
      const row = await repo.updateRow(def.table, id, values);
      if (!row) throw notFound('Record not found.');
      return enrich(entity, row);
    } catch (err) {
      if (err instanceof Error && err.name === 'HttpError') throw err;
      mapDbError(err);
    }
  },

  async remove(entity: string, role: Role, id: string): Promise<void> {
    const def = getDef(entity);
    if (!canWrite(def, role)) throw forbidden('You do not have permission to delete this record.');
    await repo.deleteRow(def.table, id);
  },
};
