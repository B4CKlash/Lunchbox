import { pantryItemSchema, type KnownIngredient, type PantryItem, type PantryTag } from "@/lib/contracts";
import { resolveIngredient } from "./ingredients";

export type PantryImportRow = {
  name: string;
  quantity: number;
  unit: PantryItem["unit"];
  location: PantryItem["location"];
  tag: PantryTag;
  merge: boolean;
  ingredientId: string | null;
  candidates: KnownIngredient[];
};
type ImportDefaults = Pick<PantryImportRow, "quantity" | "unit" | "location" | "tag">;

export class PantryImportError extends Error {
  constructor(message: string, readonly rowIndex?: number, readonly candidates?: KnownIngredient[]) {
    super(message);
    this.name = "PantryImportError";
  }
}

export function resolvePantryImportRow(row: PantryImportRow, known: KnownIngredient[]): PantryImportRow {
  if (!row.name.trim()) return { ...row, ingredientId: null, candidates: [] };
  const resolved = resolveIngredient({ name: row.name, unit: row.unit, ingredientId: row.ingredientId }, known);
  return resolved.status === "ambiguous"
    ? { ...row, ingredientId: null, candidates: resolved.candidates }
    : { ...row, ingredientId: resolved.ingredient.ingredientId, candidates: row.candidates };
}

export function preparePantryImport(
  text: string,
  source: "list" | "receipt",
  defaults: ImportDefaults,
  pantry: PantryItem[],
  known: KnownIngredient[],
): PantryImportRow[] {
  const lines = text.split(/[\n,;]+/).map((line) => {
    let name = line.trim().replace(/\s+\$\d+(?:\.\d{2})?\s*$/, "");
    const count = source === "receipt" ? name.match(/^(\d+(?:\.\d+)?)\s+(.+)$/) : null;
    if (count) name = count[2];
    return { name: name.trim(), quantity: count ? Number(count[1]) : defaults.quantity };
  }).filter(({ name }) => name && !/^(?:total|subtotal|tax|change|payment|thank you)\b/i.test(name));
  if (!lines.length) throw new PantryImportError("Paste ingredient names or receipt lines first.");
  return lines.map(({ name, quantity }) => {
    const row = resolvePantryImportRow({ ...defaults, name: name.slice(0, 80), quantity, merge: false, ingredientId: null, candidates: [] }, known);
    const existing = pantry.find((item) => item.id === row.ingredientId && item.unit === row.unit);
    return { ...row, tag: existing?.tag ?? defaults.tag };
  });
}

/** Apply reviewed rows atomically; identity never doubles as a stock-lot ID. */
export function applyPantryImport(pantry: PantryItem[], rows: PantryImportRow[], known: KnownIngredient[]) {
  const next = pantry.map((item) => ({ ...item }));
  const references = [...known, ...pantry.map((item) => ({ ingredientId: item.id, name: item.name, unit: item.unit }))];
  const changedIndices = new Set<number>();
  let added = 0;
  for (const [index, row] of rows.entries()) {
    if (!row.name.trim()) throw new PantryImportError(`Row ${index + 1}: enter an ingredient name.`, index);
    if (row.candidates.length && !row.candidates.some((candidate) => candidate.ingredientId === row.ingredientId))
      throw new PantryImportError(`Choose which ingredient matches ${row.name}.`, index, row.candidates);
    const resolved = resolveIngredient({ name: row.name, unit: row.unit, ingredientId: row.ingredientId }, references);
    if (resolved.status === "ambiguous")
      throw new PantryImportError(`Choose which ingredient matches ${row.name}.`, index, resolved.candidates);
    if (row.ingredientId && row.ingredientId !== resolved.ingredient.ingredientId)
      throw new PantryImportError(`The ingredient choice for ${row.name} changed. Review that row again.`, index);
    const id = resolved.ingredient.ingredientId;
    const existingIndex = row.merge ? next.findIndex((item) => item.id === id && item.unit === row.unit) : -1;
    const existing = existingIndex >= 0 ? next[existingIndex] : null;
    const checked = pantryItemSchema.safeParse(existing
      ? { ...existing, quantity: existing.quantity + row.quantity, tag: row.tag }
      : { id, name: row.name.trim(), quantity: row.quantity, unit: row.unit, location: row.location, useSoon: false, tag: row.tag });
    if (!Number.isFinite(row.quantity) || row.quantity <= 0 || !checked.success)
      throw new PantryImportError(`Check ${row.name}: use a positive amount within the pantry limits and a valid storage location.`, index);
    if (existingIndex >= 0) {
      next[existingIndex] = checked.data;
      if (existingIndex < pantry.length) changedIndices.add(existingIndex);
    } else {
      next.push(checked.data);
      added++;
    }
    references.push({ ingredientId: id, name: checked.data.name, unit: checked.data.unit });
  }
  if (next.length > 200) throw new PantryImportError(`There is room for ${Math.max(0, 200 - pantry.length)} new items. Remove some rows or choose to add to existing amounts.`);
  return { pantry: next, added, updated: changedIndices.size };
}
