"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CookingPot,
  Dumbbell,
  HeartPulse,
  Salad,
  SlidersHorizontal,
  Soup,
  Sparkles,
} from "lucide-react";
import { useHousehold } from "@/components/household-provider";
import {
  cookingStyleOptions,
  dietaryOptions,
  cuisineOptions,
  flavorOptions,
  goalOptions,
  nutritionFocusOptions,
} from "@/features/meals/recommendation-options";
import {
  dietaryPatterns,
  normalizeDietaryNeeds,
  updateDietarySelection,
} from "@/features/meals/preference-conflicts";
import {
  preferencesSchema,
  type CookingStyle,
  type CuisinePreference,
  type DietaryNeed,
  type FlavorPreference,
  type MealGoal,
  type NutritionFocus,
  type PreferenceNotes,
} from "@/lib/contracts";

const steps = [
  "Your goals",
  "Dietary needs",
  "Nutrition focus",
  "Taste",
  "Your style",
] as const;

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function labelsFor<T extends string>(
  values: T[],
  options: ReadonlyArray<{ value: T; title: string }>,
) {
  return values.flatMap((value) => {
    const option = options.find((candidate) => candidate.value === value);
    return option ? [option.title] : [];
  });
}

export function OnboardingPanel() {
  const router = useRouter();
  const { state, setPreferences } = useHousehold();
  const [editing, setEditing] = useState(
    !state.preferences.onboardingComplete,
  );
  const [isCooking, setIsCooking] = useState(false);
  const [step, setStep] = useState(0);
  const [goals, setGoals] = useState<MealGoal[]>(state.preferences.goals ?? []);
  const [dietaryNeeds, setDietaryNeeds] = useState<DietaryNeed[]>(() =>
    normalizeDietaryNeeds(state.preferences.dietaryNeeds ?? []),
  );
  const [dietaryNotice, setDietaryNotice] = useState("");
  const [allergies, setAllergies] = useState(
    state.preferences.allergies?.join(", ") ?? "",
  );
  const [dislikedIngredients, setDislikedIngredients] = useState(
    state.preferences.dislikedIngredients?.join(", ") ?? "",
  );
  const [nutritionFocus, setNutritionFocus] = useState<NutritionFocus[]>(
    state.preferences.nutritionFocus ?? [],
  );
  const [flavorPreferences, setFlavorPreferences] = useState<
    FlavorPreference[]
  >(state.preferences.flavorPreferences ?? []);
  const [cuisinePreferences, setCuisinePreferences] = useState<
    CuisinePreference[]
  >(state.preferences.cuisinePreferences ?? []);
  const [cookingStyles, setCookingStyles] = useState<CookingStyle[]>(
    state.preferences.cookingStyles ?? [],
  );
  const [customNotes, setCustomNotes] = useState<PreferenceNotes>(
    state.preferences.customNotes ?? {},
  );
  const [error, setError] = useState("");

  function updateNote(key: keyof PreferenceNotes, value: string) {
    setCustomNotes((current) => ({ ...current, [key]: value }));
  }

  function editStep(nextStep: number) {
    setStep(nextStep);
    setError("");
    setEditing(true);
  }

  async function resetPreferences() {
    if (
      !window.confirm(
        "Clear all recommendation preferences and start the quiz again? Your pantry and meal plan will stay as they are.",
      )
    )
      return;
    const cleared = preferencesSchema.parse({
      ...state.preferences,
      prioritizeUseSoon: false,
      onboardingComplete: false,
      goals: [],
      dietaryNeeds: [],
      allergies: [],
      dislikedIngredients: [],
      nutritionFocus: [],
      flavorPreferences: [],
      cuisinePreferences: [],
      cookingStyles: [],
      customNotes: {},
    });
    const saved = await setPreferences(cleared);
    if (!saved.ok) { setError(saved.error ?? "Preferences could not be cleared. Try again."); return; }
    setGoals([]);
    setDietaryNeeds([]);
    setDietaryNotice("");
    setAllergies("");
    setDislikedIngredients("");
    setNutritionFocus([]);
    setFlavorPreferences([]);
    setCuisinePreferences([]);
    setCookingStyles([]);
    setCustomNotes({});
    setStep(0);
    setError("");
    setEditing(true);
  }

  function next() {
    if (step === 0 && goals.length === 0) {
      setError("Choose at least one goal so we know what to prioritize.");
      return;
    }
    if (step === 2 && nutritionFocus.length === 0) {
      setError("Choose at least one nutrition focus so we can personalize your matches.");
      return;
    }
    if (
      step === 3 &&
      flavorPreferences.length === 0 &&
      cuisinePreferences.length === 0
    ) {
      setError("Choose at least one flavor or cuisine preference.");
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  async function finish() {
    if (cookingStyles.length === 0) {
      setError("Choose at least one cooking preference.");
      return;
    }
    const allergyList = allergies
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const dislikedList = dislikedIngredients
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const maxMinutes =
      cookingStyles.includes("fast") || cookingStyles.includes("under-30")
        ? 30
        : state.preferences.maxMinutes;
    const result = preferencesSchema.safeParse({
      ...state.preferences,
      maxMinutes,
      prioritizeUseSoon:
        state.preferences.prioritizeUseSoon || goals.includes("reduce-waste"),
      onboardingComplete: true,
      goals,
      dietaryNeeds,
      allergies: allergyList,
      dislikedIngredients: dislikedList,
      nutritionFocus,
      flavorPreferences,
      cuisinePreferences,
      cookingStyles,
      customNotes,
    });
    if (!result.success) {
      setError("Check your allergy list and try again.");
      return;
    }
    const saved = await setPreferences(result.data);
    if (!saved.ok) { setError(saved.error ?? "Preferences could not be saved. Your answers are still here."); return; }
    setIsCooking(true);
    window.setTimeout(() => router.push("/meals"), 1800);
  }

  function selectDietaryNeed(value: DietaryNeed) {
    const result = updateDietarySelection(dietaryNeeds, value);
    setDietaryNeeds(result.values);
    if (result.replaced) {
      const previous = dietaryOptions.find(
        (option) => option.value === result.replaced,
      )?.title;
      const next = dietaryOptions.find((option) => option.value === value)?.title;
      setDietaryNotice(
        `${next} replaced ${previous}; choose one primary eating pattern.`,
      );
    } else {
      setDietaryNotice("");
    }
  }

  if (isCooking) {
    return (
      <div className="preference-cooking" role="status" aria-live="polite">
        <div className="cooking-scene" aria-hidden="true">
          <span className="steam steam-one" />
          <span className="steam steam-two" />
          <span className="steam steam-three" />
          <span className="cooking-pot">
            <CookingPot size={54} />
          </span>
          <span className="cooking-spark spark-one">✦</span>
          <span className="cooking-spark spark-two">●</span>
        </div>
        <p className="eyebrow">YOUR KITCHEN IS LISTENING</p>
        <h1>Cooking up ideas just for you…</h1>
        <p>
          Mixing your goals, favorite flavors, pantry, and preferred pace.
        </p>
      </div>
    );
  }

  if (!editing && state.preferences.onboardingComplete) {
    const summarySections = [
      {
        title: "Goals",
        step: 0,
        values: labelsFor(goals, goalOptions),
        note: customNotes.goals,
      },
      {
        title: "How you eat",
        step: 1,
        values: labelsFor(dietaryNeeds, dietaryOptions),
        note: customNotes.dietary,
      },
      {
        title: "Nutrition focus",
        step: 2,
        values: labelsFor(nutritionFocus, nutritionFocusOptions),
        note: customNotes.nutrition,
      },
      {
        title: "Taste",
        step: 3,
        values: [
          ...labelsFor(flavorPreferences, flavorOptions),
          ...labelsFor(cuisinePreferences, cuisineOptions),
        ],
        note: customNotes.taste,
      },
      {
        title: "Cooking style",
        step: 4,
        values: labelsFor(cookingStyles, cookingStyleOptions),
        note: customNotes.cooking,
      },
    ];
    return (
      <div className="onboarding-wrap preference-summary-wrap">
        <header className="summary-hero">
          <div>
            <p className="eyebrow">YOUR RECOMMENDATION PROFILE</p>
            <h1>Meals that feel more like you.</h1>
            <p>
              These preferences shape what LunchBox suggests. Come back anytime
              to adjust them or add more detail.
            </p>
          </div>
          <span className="onboarding-hero-icon" aria-hidden="true">
            <SlidersHorizontal size={28} />
          </span>
        </header>

        <div className="summary-grid">
          {summarySections.map((section) => (
            <section className="card preference-summary-card" key={section.title}>
              <div className="summary-card-heading">
                <h2>{section.title}</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => editStep(section.step)}
                >
                  Change
                </button>
              </div>
              <div className="summary-chips">
                {section.values.length ? (
                  section.values.map((value) => <span key={value}>{value}</span>)
                ) : (
                  <span className="empty-summary-chip">Nothing selected yet</span>
                )}
              </div>
              {section.note ? <p className="summary-note">“{section.note}”</p> : null}
            </section>
          ))}
          <section className="card preference-summary-card avoidance-summary">
            <div className="summary-card-heading">
              <h2>Leave out</h2>
              <button type="button" className="text-button" onClick={() => editStep(1)}>
                Change
              </button>
            </div>
            <div className="avoidance-summary-row">
              <strong>Allergies</strong>
              <span>{state.preferences.allergies?.join(", ") || "None added"}</span>
            </div>
            <div className="avoidance-summary-row">
              <strong>Dislikes</strong>
              <span>
                {state.preferences.dislikedIngredients?.join(", ") || "None added"}
              </span>
            </div>
          </section>
        </div>

        <footer className="summary-actions">
          <button type="button" className="text-button reset-profile-button" onClick={resetPreferences}>
            Reset preferences
          </button>
          <button type="button" className="button secondary" onClick={() => editStep(0)}>
            Add more detail
          </button>
          <Link className="button" href="/meals">
            Go to Meals & Plan <ArrowRight size={16} />
          </Link>
        </footer>
      </div>
    );
  }

  return (
    <div className="onboarding-wrap">
      <header className="onboarding-hero">
        <div>
          <p className="eyebrow">MAKE LUNCHBOX YOURS</p>
          <h1>What should dinner do for you?</h1>
          <p>
            Tell us what matters. We’ll use it to rank meal ideas around your
            kitchen, your needs, and the way you actually cook.
          </p>
        </div>
        <span className="onboarding-hero-icon" aria-hidden="true">
          <Sparkles size={28} />
        </span>
      </header>

      {state.preferences.onboardingComplete ? (
        <div className="quiz-utility-row">
          <span>Editing your saved recommendation profile</span>
          <button type="button" className="text-button" onClick={resetPreferences}>
            Reset preferences
          </button>
        </div>
      ) : null}

      <ol className="onboarding-progress" aria-label="Setup progress">
        {steps.map((label, index) => (
          <li key={label} className={index <= step ? "active" : ""}>
            <span>{index < step ? <Check size={14} /> : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="card onboarding-card" aria-live="polite">
        {step === 0 ? (
          <>
            <div className="onboarding-title">
              <HeartPulse size={23} aria-hidden="true" />
              <div>
                <p className="eyebrow">STEP 1 OF 5</p>
                <h2>What are you working toward?</h2>
                <p>Select everything that matters right now.</p>
              </div>
            </div>
            <div className="choice-grid">
              {goalOptions.map((option) => (
                <button
                  type="button"
                  className={`choice-card${goals.includes(option.value) ? " selected" : ""}`}
                  aria-pressed={goals.includes(option.value)}
                  key={option.value}
                  onClick={() => setGoals(toggleValue(goals, option.value))}
                >
                  <span className="choice-check"><Check size={14} /></span>
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            <label className="field open-response-field">
              Anything else about your goals?
              <textarea
                value={customNotes.goals ?? ""}
                onChange={(event) => updateNote("goals", event.target.value)}
                placeholder="e.g. I’m training for an event or feeding a family on a budget"
                maxLength={500}
              />
              <span>Optional · be as specific as you like.</span>
            </label>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="onboarding-title">
              <Salad size={23} aria-hidden="true" />
              <div>
                <p className="eyebrow">STEP 2 OF 5</p>
                <h2>How do you like to eat?</h2>
                <p>Choose any dietary preferences that shape your meals.</p>
              </div>
            </div>
            <div className="preference-group">
              <div className="preference-group-heading">
                <strong>Eating pattern</strong>
                <span>Choose one</span>
              </div>
              <div className="dietary-grid">
              {dietaryOptions.filter((option) =>
                dietaryPatterns.includes(option.value),
              ).map((option) => (
                <button
                  type="button"
                  className={`dietary-chip${dietaryNeeds.includes(option.value) ? " selected" : ""}`}
                  aria-pressed={dietaryNeeds.includes(option.value)}
                  key={option.value}
                  onClick={() => selectDietaryNeed(option.value)}
                >
                  <Check size={14} /> {option.title}
                </button>
              ))}
              </div>
            </div>
            <div className="preference-group">
              <div className="preference-group-heading">
                <strong>Additional dietary needs</strong>
                <span>Choose any that apply</span>
              </div>
              <div className="dietary-grid">
              {dietaryOptions.filter(
                (option) => !dietaryPatterns.includes(option.value),
              ).map((option) => (
                <button
                  type="button"
                  className={`dietary-chip${dietaryNeeds.includes(option.value) ? " selected" : ""}`}
                  aria-pressed={dietaryNeeds.includes(option.value)}
                  key={option.value}
                  onClick={() => selectDietaryNeed(option.value)}
                >
                  <Check size={14} /> {option.title}
                </button>
              ))}
              </div>
            </div>
            {dietaryNotice ? (
              <p className="preference-notice" role="status">
                {dietaryNotice}
              </p>
            ) : null}
            <div className="avoidance-fields">
            <label className="field allergy-field">
              Food allergies (strict exclusions)
              <input
                value={allergies}
                onChange={(event) => setAllergies(event.target.value)}
                placeholder="e.g. peanuts, shellfish"
                maxLength={300}
              />
              <span>Separate multiple items with commas.</span>
            </label>
            <label className="field allergy-field dislike-field">
              Ingredients you dislike
              <input
                value={dislikedIngredients}
                onChange={(event) => setDislikedIngredients(event.target.value)}
                placeholder="e.g. button mushrooms, cilantro"
                maxLength={500}
              />
              <span>We’ll leave these out of recommendations too.</span>
            </label>
            </div>
            <label className="field open-response-field">
              Anything else about how you eat?
              <textarea
                value={customNotes.dietary ?? ""}
                onChange={(event) => updateNote("dietary", event.target.value)}
                placeholder="e.g. Cultural, religious, household, or ingredient-specific needs"
                maxLength={500}
              />
              <span>Optional · this stays with your recommendation profile.</span>
            </label>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div className="onboarding-title">
              <Dumbbell size={23} aria-hidden="true" />
              <div>
                <p className="eyebrow">STEP 3 OF 5</p>
                <h2>What do you want more of from your meals?</h2>
                <p>Choose the nutrition direction that best fits your goals.</p>
              </div>
            </div>
            <div className="choice-grid nutrition-choice-grid">
              {nutritionFocusOptions.map((option) => (
                <button
                  type="button"
                  className={`choice-card${nutritionFocus.includes(option.value) ? " selected" : ""}`}
                  aria-pressed={nutritionFocus.includes(option.value)}
                  key={option.value}
                  onClick={() =>
                    setNutritionFocus(toggleValue(nutritionFocus, option.value))
                  }
                >
                  <span className="choice-check"><Check size={14} /></span>
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            <p className="nutrition-note">
              These preferences guide recipe ranking; they are not medical or
              nutritional advice.
            </p>
            <label className="field open-response-field">
              Any specific nutrition targets?
              <textarea
                value={customNotes.nutrition ?? ""}
                onChange={(event) => updateNote("nutrition", event.target.value)}
                placeholder="e.g. Keep meals under 500 calories or aim for 35g protein"
                maxLength={500}
              />
              <span>Optional · exact targets depend on available recipe nutrition data.</span>
            </label>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="onboarding-title">
              <Soup size={23} aria-hidden="true" />
              <div>
                <p className="eyebrow">STEP 4 OF 5</p>
                <h2>What tastes like a good meal to you?</h2>
                <p>Pick the flavors and cuisines you reach for most.</p>
              </div>
            </div>
            <div className="preference-group">
              <div className="preference-group-heading">
                <strong>Flavor</strong>
                <span>Choose any that sound good</span>
              </div>
              <div className="dietary-grid">
                {flavorOptions.map((option) => (
                  <button
                    type="button"
                    className={`dietary-chip${flavorPreferences.includes(option.value) ? " selected" : ""}`}
                    aria-pressed={flavorPreferences.includes(option.value)}
                    key={option.value}
                    onClick={() =>
                      setFlavorPreferences(
                        toggleValue(flavorPreferences, option.value),
                      )
                    }
                  >
                    <Check size={14} /> {option.title}
                  </button>
                ))}
              </div>
            </div>
            <label className="field open-response-field">
              Anything else about your taste?
              <textarea
                value={customNotes.taste ?? ""}
                onChange={(event) => updateNote("taste", event.target.value)}
                placeholder="e.g. I love ginger and citrus, but I don’t like overly sweet sauces"
                maxLength={500}
              />
              <span>Optional · add favorite dishes, cuisines, or flavor details.</span>
            </label>
            <div className="preference-group">
              <div className="preference-group-heading">
                <strong>Favorite cuisines</strong>
                <span>Choose any that you enjoy</span>
              </div>
              <div className="dietary-grid">
                {cuisineOptions.map((option) => (
                  <button
                    type="button"
                    className={`dietary-chip${cuisinePreferences.includes(option.value) ? " selected" : ""}`}
                    aria-pressed={cuisinePreferences.includes(option.value)}
                    key={option.value}
                    onClick={() =>
                      setCuisinePreferences(
                        toggleValue(cuisinePreferences, option.value),
                      )
                    }
                  >
                    <Check size={14} /> {option.title}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <div className="onboarding-title">
              <Sparkles size={23} aria-hidden="true" />
              <div>
                <p className="eyebrow">STEP 5 OF 5</p>
                <h2>What kind of cooking fits your life?</h2>
                <p>We’ll rank recipes that match the experience you want.</p>
              </div>
            </div>
            <div className="choice-grid cooking-choice-grid">
              {cookingStyleOptions.map((option) => (
                <button
                  type="button"
                  className={`choice-card${cookingStyles.includes(option.value) ? " selected" : ""}`}
                  aria-pressed={cookingStyles.includes(option.value)}
                  key={option.value}
                  onClick={() =>
                    setCookingStyles(toggleValue(cookingStyles, option.value))
                  }
                >
                  <span className="choice-check"><Check size={14} /></span>
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
            <label className="field open-response-field">
              Anything else about your cooking routine?
              <textarea
                value={customNotes.cooking ?? ""}
                onChange={(event) => updateNote("cooking", event.target.value)}
                placeholder="e.g. Air fryer recipes on weekdays; big batch cooking on Sunday"
                maxLength={500}
              />
              <span>Optional · mention equipment, schedule, skill level, or cleanup needs.</span>
            </label>
          </>
        ) : null}

        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <footer className="onboarding-actions">
          <button
            type="button"
            className="button secondary"
            disabled={step === 0}
            onClick={() => {
              setError("");
              setStep((current) => Math.max(0, current - 1));
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="button" onClick={next}>
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="button" onClick={finish}>
              Save & find meals <Sparkles size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
