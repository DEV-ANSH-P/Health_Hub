from __future__ import annotations

from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Herbal Health AI Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

product_catalog = [
    {"name": "Ginger root", "tags": ["digestion", "nausea", "stomach", "gut", "anti-inflammatory"], "category": "herb"},
    {"name": "Chamomile", "tags": ["sleep", "stress", "calm", "evening", "anxiety"], "category": "herb"},
    {"name": "Lemon balm", "tags": ["stress", "anxiety", "calm", "sleep", "nervous"], "category": "herb"},
    {"name": "Blueberry", "tags": ["focus", "brain", "energy", "memory", "antioxidant"], "category": "fruit"},
    {"name": "Pomegranate", "tags": ["immunity", "wellness", "energy", "daily", "antioxidant"], "category": "fruit"},
    {"name": "Turmeric root", "tags": ["wellness", "immunity", "inflammation", "daily", "joint"], "category": "wellness"},
    {"name": "Mint blend", "tags": ["digestion", "fresh", "gut", "refresh", "hydration"], "category": "herb"},
    {"name": "Mango", "tags": ["energy", "focus", "sunny", "vitamin", "stamina"], "category": "fruit"},
    {"name": "Aloe vera", "tags": ["recovery", "soothing", "wellness", "skin", "hydration"], "category": "wellness"},
    {"name": "Dragon fruit", "tags": ["hydration", "immunity", "fresh", "daily", "beauty"], "category": "fruit"},
    {"name": "Ashwagandha", "tags": ["stress", "fatigue", "adaptogen", "focus", "energy"], "category": "wellness"},
    {"name": "Cinnamon", "tags": ["metabolism", "blood sugar", "energy", "digestion"], "category": "herb"},
    {"name": "Spinach blend", "tags": ["iron", "fitness", "focus", "recovery", "nutrition"], "category": "wellness"},
]


def _match_keywords(question: str, keywords: list[str]) -> bool:
    q = question.lower()
    return any(keyword.lower() in q for keyword in keywords)


def create_health_result(question: str) -> Dict[str, Any]:
    q = (question or "").strip()
    q_lower = q.lower()
    recommended = [
        {"name": item["name"], "category": item["category"]}
        for item in product_catalog
        if any(tag in q_lower for tag in item["tags"])
    ][:3]

    if _match_keywords(q_lower, ["sleep", "insomnia", "tired", "fatigue", "restless"]):
        return {
            "category": "sleep",
            "answer": "A consistent sleep rhythm, lower evening light exposure, and a calming herbal routine can support deeper rest. Focus on a wind-down ritual 30 to 60 minutes before bed, avoid heavy late meals, and keep your room dark and cool.",
            "medicinalSuggestions": [
                "Chamomile tea 30 minutes before bed",
                "Warm lemon balm infusion",
                "Reduce screen time and heavy meals in the evening",
            ],
            "fitnessAdvice": [
                "Try a brief 10-minute walk in daylight to reinforce your body clock",
                "Include gentle stretching after dinner to relax your nervous system",
            ],
            "actionPlan": [
                "Set a fixed wake time",
                "Limit caffeine after midday",
                "Use a simple calming ritual for 2 weeks to track consistency",
            ],
            "recommendedProducts": recommended or [{"name": "Chamomile", "category": "herb"}, {"name": "Lemon balm", "category": "herb"}],
            "safetyNote": "Sleep disruption that persists for several weeks or with breathlessness should be reviewed by a clinician.",
        }

    if _match_keywords(q_lower, ["digest", "bloating", "gut", "stomach", "indigestion", "constipation"]):
        return {
            "category": "digestion",
            "answer": "Gentle digestion usually improves with regular meals, hydration, and lower-fat meals in the evening. Ginger, mint, and cinnamon are often used in soothing routines that help support comfort after meals.",
            "medicinalSuggestions": [
                "Ginger tea after meals",
                "Steady hydration and slower eating",
                "Choose lighter meals and easy-to-digest foods",
            ],
            "fitnessAdvice": [
                "Do a 10-minute walk after meals to support bowel regularity",
                "Avoid intense exercise immediately after heavy meals",
            ],
            "actionPlan": [
                "Keep a simple food and symptom log for 7 days",
                "Avoid large late-night meals",
                "Add warm liquids and digestive herbs in your daily routine",
            ],
            "recommendedProducts": recommended or [{"name": "Ginger root", "category": "herb"}, {"name": "Mint blend", "category": "herb"}],
            "safetyNote": "Persistent abdominal pain, vomiting, blood in stool, or weight loss deserves immediate medical care.",
        }

    if _match_keywords(q_lower, ["stress", "anxiety", "overwhelm", "burnout", "nervous"]):
        return {
            "category": "stress",
            "answer": "Stress responds well to rhythm and recovery: consistent sleep, time outside, regular meals, and short breath-based resets. Lemon balm, ashwagandha, and calm routines can support a more steady mood and focus.",
            "medicinalSuggestions": [
                "Lemon balm tea",
                "5-minute breathing break",
                "Short outdoor walk or sunlight session",
            ],
            "fitnessAdvice": [
                "Add 10 minutes of light movement or walking to reduce mental tension",
                "Practice a 4-6 breathing cycle to settle your nervous system",
            ],
            "actionPlan": [
                "Schedule one short reset break per day",
                "Protect a screen-free period before sleep",
                "Use a simple stress-cue list to spot patterns",
            ],
            "recommendedProducts": recommended or [{"name": "Lemon balm", "category": "herb"}, {"name": "Ashwagandha", "category": "wellness"}],
            "safetyNote": "Severe panic, hopelessness, or emotional crisis requires professional care without delay.",
        }

    if _match_keywords(q_lower, ["focus", "brain", "memory", "concentration", "mental clarity"]):
        return {
            "category": "focus",
            "answer": "Clearer thinking often comes from regular meals, hydration, enough sleep, and mindful breaks. Blueberries, pomegranate, and spinach-based nutrition can support cognitive resilience alongside stronger daily routines.",
            "medicinalSuggestions": [
                "Blueberry or pomegranate snack",
                "Hydration reminder after a long work block",
                "Short movement breaks to reset attention",
            ],
            "fitnessAdvice": [
                "Use a 5-minute mobility break every 90 minutes",
                "Take a brisk walk to refresh attention instead of pushing through fatigue",
            ],
            "actionPlan": [
                "Keep hydration consistent throughout the day",
                "Pair deep work with short breaks and protein-rich snacks",
                "Track focus patterns when sleep or meals are inconsistent",
            ],
            "recommendedProducts": recommended or [{"name": "Blueberry", "category": "fruit"}, {"name": "Spinach blend", "category": "wellness"}],
            "safetyNote": "Sudden, major changes in memory or concentration should be checked by a clinician.",
        }

    if _match_keywords(q_lower, ["fitness", "workout", "exercise", "muscle", "recovery", "strength", "weight loss", "fat loss", "gym"]):
        return {
            "category": "fitness",
            "answer": "A practical fitness plan balances mobility, strength, and recovery. Aim for steady movement most days, support recovery with hydration, and keep your nutrition adequate so your training does not pile on stress.",
            "medicinalSuggestions": [
                "Hydration before and after workouts",
                "Protein-rich meals after strength sessions",
                "Turmeric or ginger support for recovery and mobility",
            ],
            "fitnessAdvice": [
                "Do 2 to 3 strength sessions per week with 1 recovery day between them",
                "Add 20 to 30 minutes of brisk walking on most days",
                "Prioritize sleep and protein to improve performance",
            ],
            "actionPlan": [
                "Start with a 3-day weekly rhythm and build gradually",
                "Track recovery, energy, and soreness each week",
                "Use rest days as part of performance, not as failure",
            ],
            "recommendedProducts": recommended or [{"name": "Turmeric root", "category": "wellness"}, {"name": "Mango", "category": "fruit"}],
            "safetyNote": "If you have chest pain, dizziness, or exercise intolerance, seek medical evaluation before pushing harder.",
        }

    if _match_keywords(q_lower, ["immune", "cold", "wellness", "immunity", "infection", "defense"]):
        return {
            "category": "immunity",
            "answer": "Immune support is usually about consistency: good sleep, balanced nutrition, hydration, stress regulation, and steady movement. Daily routines built around whole foods and herbs can be easier to maintain than short bursts of effort.",
            "medicinalSuggestions": [
                "A turmeric and ginger tonic",
                "Pomegranate-rich meals for antioxidant support",
                "Simple daily hydration and rest routines",
            ],
            "fitnessAdvice": [
                "Keep movement light to moderate to reduce stress on recovery",
                "Add outdoor daylight exposure to improve mood and rhythm",
            ],
            "actionPlan": [
                "Build a repeatable morning routine",
                "Focus on fiber and fruit intake",
                "Avoid overtraining when you feel run down",
            ],
            "recommendedProducts": recommended or [{"name": "Pomegranate", "category": "fruit"}, {"name": "Turmeric root", "category": "wellness"}],
            "safetyNote": "Recurring illness, fever, or worsening symptoms should be checked by a doctor.",
        }

    if _match_keywords(q_lower, ["hydration", "water", "dehydration", "energy", "low energy"]):
        return {
            "category": "hydration",
            "answer": "Low energy and brain fog are often improved by steady hydration, balanced meals, and a realistic pace for the day. Fruit, herbal tea, and consistent intake across the day are easier to sustain than one large burst.",
            "medicinalSuggestions": [
                "Water with lemon or mint",
                "A fruit-rich snack like blueberry or mango",
                "Small hydration checks every few hours",
            ],
            "fitnessAdvice": [
                "Light movement can improve circulation and energy before heavy work starts",
                "A 5-10 minute walk can reset concentration better than another quick caffeine hit",
            ],
            "actionPlan": [
                "Carry water in a visible bottle",
                "Pair meals with fluids and fruit",
                "Reduce long gaps between eating and drinking",
            ],
            "recommendedProducts": recommended or [{"name": "Dragon fruit", "category": "fruit"}, {"name": "Mint blend", "category": "herb"}],
            "safetyNote": "Severe dehydration, fainting, or confusion needs urgent medical review.",
        }

    return {
        "category": "general",
        "answer": "A steady wellness routine usually combines good sleep, regular eating, hydration, movement, and quality stress management. The best progress usually comes from small habits repeated consistently rather than dramatic resets.",
        "medicinalSuggestions": [
            "Hydrate consistently",
            "Keep the routine simple and anchored to meals",
            "Monitor symptoms over a few days and look for patterns",
        ],
        "fitnessAdvice": [
            "Take a brisk walk for 10 to 20 minutes most days",
            "Add light mobility or stretching at least once daily",
        ],
        "actionPlan": [
            "Choose one habit to improve this week",
            "Track energy, sleep, and meals for 7 days",
            "Seek qualified care if symptoms worsen or persist",
        ],
        "recommendedProducts": recommended or [{"name": "Pomegranate", "category": "fruit"}, {"name": "Turmeric root", "category": "wellness"}],
        "safetyNote": "This is educational support and not a diagnosis or treatment plan.",
    }


class HealthPrompt(BaseModel):
    question: str


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "herbal-health-ai"}


@app.get("/api/health/assistant")
def health_assistant_get(question: str = "") -> Dict[str, Any]:
    result = create_health_result(question)
    return {**result, "recommendedProducts": result["recommendedProducts"][:3]}


@app.post("/api/health/assistant")
def health_assistant_post(payload: HealthPrompt) -> Dict[str, Any]:
    result = create_health_result(payload.question)
    return {**result, "recommendedProducts": (result["recommendedProducts"] or [])[:3]}


@app.get("/api/health/fitness")
def fitness_assistant_get(question: str = "") -> Dict[str, Any]:
    result = create_health_result(question or "fitness and recovery coaching")
    return {**result, "recommendedProducts": (result["recommendedProducts"] or [])[:3]}


@app.post("/api/health/fitness")
def fitness_assistant_post(payload: HealthPrompt) -> Dict[str, Any]:
    result = create_health_result(payload.question or "fitness and recovery coaching")
    return {**result, "recommendedProducts": (result["recommendedProducts"] or [])[:3]}
