import { FormEvent, useState } from "react";
import { CalendarClock, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import SiteHeader from "@/components/SiteHeader";
import ConsultationRoom from "@/components/ConsultationRoom";
import { experts } from "./Home";

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Experts() {
  const [expertId, setExpertId] = useState(String(experts[0].id));
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"chat" | "video">("chat");
  const [requestedAt, setRequestedAt] = useState(() => localDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [submitting, setSubmitting] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");

  const requestAppointment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setRequestMessage("");
    setRequestError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          expert: experts.find((expert) => String(expert.id) === expertId)?.name,
          mode,
          date: new Date(requestedAt).toISOString(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Could not submit your request.");
      setRequestMessage(payload.message || "Your appointment request was recorded.");
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Could not submit your request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]">
      <SiteHeader />
      <main className="mx-auto max-w-7xl space-y-10 px-5 py-12 lg:px-10">
        <header>
          <p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">Human support · preview</p>
          <h1 className="mt-2 font-display text-5xl">Chat, video, or request a time.</h1>
          <p className="mt-4 max-w-3xl leading-7 text-[#173d32]/65">
            The example expert profiles are not verified clinicians. Appointment requests are saved for demonstration only and are not sent to a provider or confirmed. The peer-to-peer room below provides an actual browser-to-browser video and chat connection for people who share its invite link.
          </p>
        </header>

        <div className="rounded-3xl border border-[#a36d21]/20 bg-[#fff8e9] p-5 text-sm leading-6 text-[#173d32]/75">
          <ShieldCheck className="mr-2 inline h-5 w-5 text-[#a36d21]" />
          This demo is not a medical or emergency service. Do not include symptoms or sensitive health information in appointment requests. For urgent concerns, contact a licensed clinician or local emergency services.
        </div>

        <section className="grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
          <div className="rounded-3xl border border-[#173d32]/10 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e9f1e4]"><CalendarClock className="h-5 w-5" /></span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#b07926]">Appointment request</p>
                <h2 className="font-display text-2xl">Ask for a preferred time</h2>
              </div>
            </div>
            <form onSubmit={requestAppointment} className="mt-5 space-y-4">
              <label className="block text-sm font-semibold">
                Example profile
                <select value={expertId} onChange={(event) => setExpertId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#173d32]/15 bg-white px-3">
                  {experts.map((expert) => <option key={expert.id} value={expert.id}>{expert.name} · {expert.specialty}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Preferred date and time
                <input required type="datetime-local" min={localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000))} max={localDateTimeValue(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))} value={requestedAt} onChange={(event) => setRequestedAt(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#173d32]/15 bg-white px-3" />
              </label>
              <fieldset>
                <legend className="text-sm font-semibold">Preferred format</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["chat", "video"] as const).map((item) => (
                    <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize ${mode === item ? "border-[#173d32] bg-[#173d32] text-white" : "border-[#173d32]/15 bg-white"}`}>
                      {item}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="block text-sm font-semibold">
                Email for this demo request
                <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#173d32]/15 bg-white px-3" placeholder="you@example.com" />
              </label>
              <p className="text-xs leading-5 text-[#173d32]/60">Email is stored with the request. It is not used to contact you in this preview, and no clinician receives the request.</p>
              {requestMessage && <p role="status" className="rounded-xl bg-[#edf3ea] p-3 text-sm leading-6">{requestMessage}</p>}
              {requestError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{requestError}</p>}
              <button type="submit" disabled={submitting} className="w-full rounded-full bg-[#173d32] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {submitting ? "Submitting…" : "Submit appointment request"}
              </button>
            </form>
          </div>

          <ConsultationRoom />
        </section>

        <p className="text-sm text-[#173d32]/65">
          Looking for nearby services?{" "}
          <Link href="/care" className="font-semibold underline underline-offset-4">Open the care map preview</Link>
          {" "}and verify each provider directly.
        </p>
      </main>
    </div>
  );
}
