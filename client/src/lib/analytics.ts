export type AnalyticsEvent =
  | "product_search"
  | "product_view"
  | "consultation_started"
  | "care_finder_opened"
  | "guidance_opened"
  | "checkout_started";

const consentKey = "health-hub-analytics-consent";

export function hasAnalyticsConsent() {
  return window.localStorage.getItem(consentKey) === "granted";
}

export async function trackAnalyticsEvent(event: AnalyticsEvent) {
  if (!hasAnalyticsConsent()) return;

  try {
    const response = await fetch("/api/analytics/events", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
    if (!response.ok) throw new Error(`Analytics request failed (${response.status})`);
  } catch (error) {
    console.error("Could not record anonymous product analytics.", error);
  }
}

export { consentKey };
