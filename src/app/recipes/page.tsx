import { MealsPanel } from "@/components/meals-panel";
import { getAiBackend, getAiMode } from "@/features/meals/ai-runtime";

export default function RecipesPage() {
  return <MealsPanel aiMode={getAiMode()} aiBackend={getAiBackend()} />;
}
