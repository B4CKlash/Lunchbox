import "server-only";
import { ImportSourceError } from "./safe-url-fetch";

export const instructionHeading = /^(?:instructions|directions|method|preparation|steps)\s*(?::|\([^)]*\))?\s*$/i;
const ingredientHeading = /^ingredients\s*(?::|\([^)]*\))?\s*$/i;
const stepMarker = /^(?:(?:step\s+)?\d+[.):]\s*|[-*•]\s+)/i;
const normalized = (value: string) => value.trim().replace(/\s+/g, " ");

function unique(values: number[], ambiguous: boolean): number | null {
  const distinct = [...new Set(values)];
  return !ambiguous && distinct.length === 1 ? distinct[0] : null;
}

function explicitServings(lines: string[]): number | null {
  const values: number[] = [];
  let ambiguous = false;
  for (const line of lines) {
    const labelled = /^(?:serves?|servings?)\s*:?\s*(.+)$/i.exec(line);
    const yieldLabel = /^(?:yield|makes?)\s*:?\s*(.+)$/i.exec(line);
    const value = labelled?.[1] ?? yieldLabel?.[1] ?? line;
    const match = labelled
      ? /^(\d+)(?:\s+(?:servings?|people|persons?))?\.?$/i.exec(value)
      : /^(\d+)\s+servings?\.?$/i.exec(value);
    if (match) {
      const count = Number(match[1]);
      if (count >= 1 && count <= 12) values.push(count);
      else ambiguous = true;
    } else if (labelled || (yieldLabel && /\bservings?\b/i.test(value))) ambiguous = true;
  }
  return unique(values, ambiguous);
}

function duration(value: string): number | null {
  const match = /^(?:(\d+)\s*(?:hours?|hrs?|h)\s*(?:and\s*)?)?(?:(\d+)\s*(?:minutes?|mins?|m))?\.?$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const result = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return result >= 1 && result <= 240 ? result : null;
}

function explicitMinutes(lines: string[]): number | null {
  const totals: number[] = [];
  const prep: number[] = [];
  const cook: number[] = [];
  let ambiguousTotal = false;
  let ambiguousParts = false;
  for (const line of lines) {
    const total = /^(?:total(?:\s+(?:cooking\s+)?time)?|time|duration|ready in)\s*:?\s*(.+)$/i.exec(line);
    const preparation = /^(?:prep|preparation)(?:\s+time)?\s*:?\s*(.+)$/i.exec(line);
    const cooking = /^(?:cook|cooking)(?:\s+time)?\s*:\s*(.+)$/i.exec(line);
    const part = preparation ?? cooking;
    const value = duration((total ?? part)?.[1] ?? line);
    if (part) {
      if (value === null) ambiguousParts = true;
      else (preparation ? prep : cook).push(value);
    } else if (value !== null) totals.push(value);
    else if (total) ambiguousTotal = true;
  }
  if (totals.length || ambiguousTotal) return unique(totals, ambiguousTotal);
  const prepMinutes = unique(prep, ambiguousParts);
  const cookMinutes = unique(cook, ambiguousParts);
  return prepMinutes !== null && cookMinutes !== null && prepMinutes + cookMinutes <= 240
    ? prepMinutes + cookMinutes : null;
}

function labelledSteps(lines: string[], index: number): string[] {
  const content = lines.slice(index + 1);
  const marked = content.some((line) => stepMarker.test(line));
  const steps: string[] = [];
  for (const line of content) {
    if (!line) continue;
    const text = line.replace(stepMarker, "").trim();
    if (!text) continue;
    if (!marked || stepMarker.test(line) || !steps.length) steps.push(text);
    else steps[steps.length - 1] += ` ${text}`;
  }
  if (steps.length > 20 || steps.some((step) => step.length > 1000))
    throw new ImportSourceError("import_recipe", "These instructions exceed this demo's limit of 20 steps and 1,000 characters per step. Paste a shorter recipe; no instructions were dropped.");
  return steps;
}

/** Scalar facts and labelled instructions come from the pasted source, never guesses. */
export function reviewTextFacts(source: string, proposedSteps: string[]) {
  const lines = source.split(/\r?\n/).map((line) => line.trim());
  const instructionsAt = lines.findIndex((line) => instructionHeading.test(line));
  const firstSection = lines.findIndex((line) => instructionHeading.test(line) || ingredientHeading.test(line));
  const metadata = firstSection < 0 ? lines : lines.slice(0, firstSection);
  const warnings: string[] = [];
  let steps: string[];
  if (instructionsAt >= 0) steps = labelledSteps(lines, instructionsAt);
  else {
    const sourceText = normalized(source);
    const supported = proposedSteps.every((step) => normalized(step) && sourceText.includes(normalized(step)));
    steps = supported ? proposedSteps : [];
    warnings.push(supported && steps.length
      ? "Check that all cooking instructions were extracted from your pasted recipe."
      : "Cooking instructions could not be verified against the pasted recipe. Copy them into the review form before saving.");
  }
  return {
    servings: explicitServings(metadata), minutes: explicitMinutes(metadata), steps, warnings,
  };
}
