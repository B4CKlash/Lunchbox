import { pantryItemSchema, type KnownIngredient, type PantryItem, type PantryTag, type PilotOperation } from "@/lib/contracts";
import { resolveIngredient } from "./ingredients";

export type PantryImportRow = {
  name: string;
  quantity: number;
  unit: PantryItem["unit"];
  location: PantryItem["location"];
  tag: PantryTag;
  intent: "set-total" | "add";
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
    const row = resolvePantryImportRow({ ...defaults, name: name.slice(0, 80), quantity, intent: source === "receipt" ? "add" : "set-total", ingredientId: null, candidates: [] }, known);
    const existing = pantry.find((item) => item.id === row.ingredientId && item.unit === row.unit);
    return { ...row, tag: existing?.tag ?? defaults.tag };
  });
}

/** Resolve reviewed entries; only the shared domain command mutates stock. */
export function applyPantryImport(pantry: PantryItem[], rows: PantryImportRow[], known: KnownIngredient[]) {
  const references = [...known, ...pantry.map((item) => ({ ingredientId: item.id, name: item.name, unit: item.unit }))];
  const entries: Extract<PilotOperation, { type: "record_stock_entries" }>["entries"] = [];
  const modes = new Map<string, PantryImportRow["intent"]>();
  const existingKeys = new Set(pantry.map((item) => JSON.stringify([item.id, item.unit])));
  const addedKeys = new Set<string>();
  const updatedKeys = new Set<string>();
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
    const key = JSON.stringify([id, row.unit]);
    const previousMode = modes.get(key);
    if (previousMode && (previousMode === "set-total" || row.intent === "set-total"))
      throw new PantryImportError(`Enter one current total for ${row.name} (${row.unit}), or record purchases separately.`, index);
    modes.set(key, row.intent);
    const existing = pantry.find((item) => item.id === id && item.unit === row.unit);
    const checked = pantryItemSchema.safeParse({
      ...existing, id, name: row.name.trim(), quantity: row.quantity, unit: row.unit,
      location: row.location, useSoon: existing?.useSoon ?? false, tag: row.tag,
    });
    if (!checked.success || !["set-total", "add"].includes(row.intent) || (row.intent === "add" && row.quantity <= 0))
      throw new PantryImportError(`Check ${row.name}: a total can be zero; a purchase needs a positive amount, supported unit, and valid storage location.`, index);
    entries.push({ intent: row.intent, item: checked.data });
    (existingKeys.has(key) ? updatedKeys : addedKeys).add(key);
    references.push({ ingredientId: id, name: checked.data.name, unit: checked.data.unit });
  }
  if (!entries.length || entries.length > 200) throw new PantryImportError("Review between 1 and 200 stock entries.");
  if (existingKeys.size + addedKeys.size > 200) throw new PantryImportError(`There is room for ${Math.max(0, 200 - existingKeys.size)} new ingredients. Remove some rows first.`);
  return { operation: { type: "record_stock_entries" as const, entries }, added: addedKeys.size, updated: updatedKeys.size };
}
