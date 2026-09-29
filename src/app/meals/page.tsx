import { MealsPanel } from "@/components/meals-panel";
import { getAiMode } from "@/features/meals/ai-runtime";

export default function MealsPage() {
  return <MealsPanel aiMode={getAiMode()} />;
}
