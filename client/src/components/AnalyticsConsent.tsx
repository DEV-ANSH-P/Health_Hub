import { useState } from "react";
import { consentKey } from "@/lib/analytics";

type Consent = "granted" | "denied" | null;

export default function AnalyticsConsent() {
  const [consent, setConsent] = useState<Consent>(() => {
    const saved = window.localStorage.getItem(consentKey);
    return saved === "granted" || saved === "denied" ? saved : null;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  const saveConsent = (next: Exclude<Consent, null>) => {
    window.localStorage.setItem(consentKey, next);
    setConsent(next);
    setSettingsOpen(false);
  };

  if (consent !== null && !settingsOpen) {
    return (
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        className="fixed bottom-4 left-4 z-40 rounded-full border border-[#173d32]/15 bg-[#fffdf8] px-4 py-2 text-xs font-semibold text-[#173d32] shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d79a32]"
      >
        Privacy preferences
      </button>
    );
  }

  return (
    <aside
      aria-label="Analytics privacy preferences"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-[#173d32]/15 bg-[#fffdf8] p-4 text-[#173d32] shadow-[0_18px_60px_rgba(23,61,50,0.22)] sm:inset-x-6 sm:p-5"
    >
      <p className="font-display text-xl">{settingsOpen ? "Privacy preferences" : "Your privacy, your choice."}</p>
      <p className="mt-1 text-sm leading-6 text-[#173d32]/70">
        Allow optional anonymous counts of broad actions, such as opening a product or care page. No third-party tracker is used.
      </p>
      <details className="mt-2 text-xs text-[#173d32]/60">
        <summary className="w-fit cursor-pointer font-semibold">What is counted?</summary>
        <p className="mt-1 leading-5">Only fixed event names are sent—not search terms, health questions, location, or account details. Counts stay in server memory and reset when the server restarts.</p>
      </details>
      {consent === "granted" && settingsOpen ? (
        <p className="mt-2 text-xs text-[#173d32]/55">Previously collected totals are anonymous and cannot be linked back to remove individually. Turning analytics off stops future events.</p>
      ) : null}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {(settingsOpen || consent === null) && (
          <button type="button" onClick={() => saveConsent("denied")} className="rounded-full border border-[#173d32]/15 px-4 py-2 text-xs font-semibold hover:bg-[#edf3ea]">
            {consent === "granted" ? "Turn off" : "Decline"}
          </button>
        )}
        {consent !== "granted" && (
          <button type="button" onClick={() => saveConsent("granted")} className="rounded-full bg-[#173d32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#245346]">
            Allow anonymous analytics
          </button>
        )}
        {settingsOpen && (
          <button type="button" onClick={() => setSettingsOpen(false)} className="rounded-full bg-[#edf3ea] px-4 py-2 text-xs font-semibold">
            Done
          </button>
        )}
      </div>
    </aside>
  );
}
