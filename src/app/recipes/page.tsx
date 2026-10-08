import { MealsPanel } from "@/components/meals-panel";
import { getAiMode } from "@/features/meals/ai-runtime";

export default function RecipesPage() {
  return <MealsPanel aiMode={getAiMode()} />;
}
