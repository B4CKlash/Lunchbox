import {
  pilotOperationSchema, type KnownIngredient, type PackageKind, type PilotOperation, type Unit,
} from "@/lib/contracts";
import { ingredientCatalog, resolveIngredient } from "./ingredients";

export type NaturalStockEntryDraft = {
  originalText: string;
  name: string;
  ingredientId: string | null;
  candidates: KnownIngredient[];
  operation: "set_total" | "add_purchase" | null;
  status: "exact" | "some" | "low" | "out";
  amount: number | null;
  unit: Unit | null;
  packageKind: PackageKind | null;
};

const packageNames: Record<string, PackageKind> = {
  can: "can", cans: "can", bag: "bag", bags: "bag", jar: "jar", jars: "jar",
  box: "box", boxes: "box", bottle: "bottle", bottles: "bottle",
};
const unitNames: Record<string, Unit> = { g: "g", gram: "g", grams: "g", ml: "ml", milliliter: "ml", milliliters: "ml", each: "each" };
const wholeFoods = /^(?:apples?|bananas?|eggs?|lemons?|limes?|onions?|carrots?|potatoes?|tomatoes?|peppers?|garlic cloves?)$/i;

/** Deliberately small deterministic grammar. Review resolves meaning/identity;
 * unsupported units and unspecified amounts never receive numeric defaults. */
export function prepareNaturalStockEntry(text: string, known: KnownIngredient[] = [], operation?: NaturalStockEntryDraft["operation"]): NaturalStockEntryDraft {
  const originalText = text.trim();
  if (!originalText || originalText.length > 1000) throw new Error("Enter a stock statement of up to 1000 characters.");
  let statement = originalText.replace(/[.!]$/, "").trim();
  let meaning: NaturalStockEntryDraft["operation"] = operation ?? null;
  const total = statement.match(/^(?:(?:i|we)\s+(?:have(?: got)?|have measured)|there (?:are|is))\s+/i);
  const purchase = statement.match(/^(?:(?:i|we)\s+)?(?:bought|purchased)\s+/i);
  if (total) { meaning = "set_total"; statement = statement.slice(total[0].length); }
  else if (purchase) { meaning = "add_purchase"; statement = statement.slice(purchase[0].length); }
  const draft: NaturalStockEntryDraft = { originalText, name: "", ingredientId: null, candidates: [], operation: meaning, status: "exact", amount: null, unit: null, packageKind: null };
  const packages = statement.match(/^(.*?)\b(cans?|bags?|jars?|box(?:es)?|bottles?)\s+(?:of\s+)?(.+)$/i);
  if (packages) {
    const qualifier = packages[1].trim().toLowerCase();
    draft.packageKind = packageNames[packages[2].toLowerCase()];
    draft.name = packages[3].trim();
    if (/^(?:\d+(?:\.\d+)?|a|an)$/.test(qualifier)) {
      const count = /^(a|an)$/.test(qualifier) ? 1 : Number(qualifier);
      if (Number.isInteger(count)) draft.amount = count;
      else draft.status = "some";
    } else if (/\b(?:out|no|none)\b/.test(qualifier)) draft.status = "out";
    else if (/\blow\b/.test(qualifier)) draft.status = "low";
    else if (/\b(?:some|open|opened|partial|half|quarter)\b/.test(qualifier)) draft.status = "some";
    else throw new Error("Specify a whole container count or say some, low, out, or opened/partial.");
  } else {
    const measured = statement.match(/^(\d+(?:\.\d+)?)\s*(g|grams?|ml|milliliters?|each)\s+(?:of\s+)?(.+)$/i);
    const counted = statement.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    const qualitative = statement.match(/^(some|low|running low on|out of|no)\s+(.+)$/i);
    if (measured) { draft.amount = Number(measured[1]); draft.unit = unitNames[measured[2].toLowerCase()]; draft.name = measured[3]; }
    else if (counted && wholeFoods.test(counted[2])) { draft.amount = Number(counted[1]); draft.unit = "each"; draft.name = counted[2]; }
    else if (qualitative) { draft.status = /low/i.test(qualitative[1]) ? "low" : /^(out of|no)$/i.test(qualitative[1]) ? "out" : "some"; draft.name = qualitative[2]; draft.unit = wholeFoods.test(draft.name) ? "each" : null; }
    else throw new Error("Use a number and g, ml, each, or a container: for example 1000 g beans, 10 apples, or 10 cans of beans.");
  }
  if (draft.name.length > 80) throw new Error("Use an ingredient name of up to 80 characters.");
  return resolveNaturalStockIdentity(draft, known);
}

export function resolveNaturalStockIdentity(input: NaturalStockEntryDraft, known: KnownIngredient[]): NaturalStockEntryDraft {
  const draft: NaturalStockEntryDraft = { ...input, ingredientId: null, candidates: [] };
  if (!draft.name.trim()) return draft;
  // These bare names omit a form that changes recipe identity. Even a single
  // existing match is an explicit review choice, never an inferred conversion.
  const unspecifiedForm = /^(?:beans|rice|lentils|chickpeas|chicken)$/i.test(draft.name);
  if (unspecifiedForm) {
    const word = new RegExp(`\\b${draft.name}\\b`, "i");
    const candidates = [...known.filter((entry) => word.test(entry.name)),
      ...ingredientCatalog.filter((entry) => word.test(entry.name)).map((entry) => ({ ingredientId: entry.ingredientId, name: entry.name, unit: draft.unit ?? "each" as Unit }))];
    draft.candidates = [...new Map(candidates.map((entry) => [entry.ingredientId, entry])).values()];
    return draft;
  }
  const resolved = resolveIngredient({ name: draft.name, unit: draft.unit ?? "each" }, known);
  if (resolved.status === "ambiguous") draft.candidates = resolved.candidates;
  else { draft.ingredientId = resolved.ingredient.ingredientId; draft.name = resolved.ingredient.name; }
  return draft;
}

export function naturalStockEntryOperation(draft: NaturalStockEntryDraft): PilotOperation {
  if (!draft.operation) throw new Error("Choose whether this is the current total or a purchase to add.");
  if (!draft.ingredientId) throw new Error("Choose the ingredient identity before saving.");
  const identity = { ingredientId: draft.ingredientId, name: draft.name.trim(), sourceNote: draft.originalText };
  if (draft.operation === "add_purchase" && draft.status !== "exact") throw new Error("A purchase needs an exact amount. Save partial or opened containers as a current stock observation.");
  if (draft.status === "exact" && draft.amount === null) throw new Error("Enter the measured amount or whole container count.");
  if (draft.status === "exact" && (!Number.isFinite(draft.amount) || draft.amount! < 0 || draft.amount! > 100000)) throw new Error("Use an amount from 0 to 100000.");
  if (draft.packageKind && draft.status === "exact" && !Number.isInteger(draft.amount)) throw new Error("Use a whole container count, or choose Some for a partial container.");
  if (draft.operation === "add_purchase" && draft.amount! <= 0) throw new Error("A purchase must add a positive amount.");
  if (draft.packageKind) return pilotOperationSchema.parse(draft.operation === "add_purchase"
    ? { type: "record_package_purchase", items: [{ ...identity, packageKind: draft.packageKind, count: draft.amount }] }
    : { type: "set_package_stock", stock: { ...identity, packageKind: draft.packageKind, status: draft.status, ...(draft.status === "exact" ? { count: draft.amount } : {}) } });
  if (!draft.unit) throw new Error("Choose g, ml, or each for this stock observation.");
  return pilotOperationSchema.parse(draft.operation === "add_purchase"
    ? { type: "record_purchase", items: [{ ...identity, unit: draft.unit, quantity: draft.amount }] }
    : { type: "set_stock", stock: { ...identity, unit: draft.unit, status: draft.status, ...(draft.status === "exact" ? { quantity: draft.amount } : {}) } });
}

export function packageStockLabel(stock: { packageKind: PackageKind; status: NaturalStockEntryDraft["status"]; count?: number }) {
  const plural = stock.packageKind === "box" ? "boxes" : `${stock.packageKind}s`;
  if (stock.status === "out") return `Out of ${plural}`;
  if (stock.status === "some" || stock.status === "low") return `${stock.status === "low" ? "Low" : "Some"} ${plural} · count unknown`;
  return `${stock.count} ${stock.count === 1 ? stock.packageKind : plural}`;
}
