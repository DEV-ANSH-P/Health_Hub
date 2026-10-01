import { FormEvent, useEffect, useState } from "react";
import { Bot, Dumbbell, Send, ShieldCheck, Sparkles } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trackAnalyticsEvent } from "@/lib/analytics";

type Message = { role: "user" | "assistant"; text: string };
export default function Guidance() {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: "assistant", text: "Hello. I’m your wellness guide. Tell me about sleep, stress, digestion, movement, or your daily routine." }]);
  useEffect(() => {
    void trackAnalyticsEvent("guidance_opened");
  }, []);
  const ask = async (event: FormEvent) => {
    event.preventDefault(); const question = input.trim(); if (!question || busy) return;
    setInput(""); setMessages((m) => [...m, { role: "user", text: question }]); setBusy(true);
    try {
      const [a, f] = await Promise.all([
        fetch("/api/health/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
        fetch("/api/health/fitness", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }),
      ]);
      const assistant = await a.json(); const fitness = await f.json();
      setMessages((m) => [...m, { role: "assistant", text: `${assistant.answer || "Here are some gentle ideas to consider."}\n\nMovement & recovery: ${(fitness.fitnessAdvice || fitness.actionPlan || []).join(" • ") || "Try a short walk and listen to your body."}` }]);
    } catch { setMessages((m) => [...m, { role: "assistant", text: "I couldn’t reach the guide right now. Please try again, or speak with a qualified clinician." }]); }
    finally { setBusy(false); }
  };
  return <div className="min-h-screen bg-[#f4f1e9] text-[#173d32]"><SiteHeader /><main className="mx-auto max-w-6xl px-5 py-12 lg:px-10"><div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]"><section><p className="text-xs font-bold uppercase tracking-[.25em] text-[#b07926]">AI wellness demo</p><h1 className="mt-3 font-display text-5xl leading-tight">A calmer next step.</h1><p className="mt-5 text-lg leading-8 text-[#173d32]/65">Explore general ideas for everyday wellbeing—this demo cannot provide personalized medical assessment.</p><div className="mt-8 rounded-3xl bg-[#173d32] p-6 text-white"><ShieldCheck className="h-6 w-6 text-[#d79a32]" /><h2 className="mt-4 font-display text-2xl">Safety first</h2><p className="mt-2 text-sm leading-6 text-white/70">This assistant provides educational wellness information, not diagnosis or treatment. For urgent symptoms, contact emergency services or a clinician.</p></div><div className="mt-4 rounded-2xl border border-[#a36d21]/20 bg-[#fff8e9] p-4 text-sm leading-6">Your message is sent to the Health Hub service to generate replies. Avoid sharing your name, contact details, or highly sensitive health information.</div></section><section className="rounded-3xl border border-[#173d32]/10 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center gap-3 border-b pb-4"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#e9f1e4]"><Bot className="h-5 w-5" /></span><div><h2 className="font-semibold">AI-generated guidance preview</h2><p className="text-xs text-[#173d32]/55">General information only · not private medical care</p></div><Sparkles className="ml-auto h-4 w-4 text-[#d79a32]" /></div><div className="h-[360px] space-y-4 overflow-y-auto pr-2">{messages.map((m, i) => <div key={i} className={`max-w-[90%] whitespace-pre-line rounded-2xl p-4 text-sm leading-6 ${m.role === "user" ? "ml-auto bg-[#173d32] text-white" : "bg-[#eef4eb]"}`}>{m.text}</div>)}{busy && <div className="text-sm text-[#173d32]/50">Thinking gently…</div>}</div><form onSubmit={ask} className="mt-4 flex gap-2"><Textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a general wellness question—avoid personal identifiers" className="min-h-12 resize-none" /><Button type="submit" disabled={busy || !input.trim()} size="icon" aria-label="Send question"><Send className="h-4 w-4" /></Button></form></section></div><div className="mt-8 flex items-center gap-3 rounded-2xl border border-[#173d32]/10 bg-[#fffdf8] p-4 text-sm"><Dumbbell className="h-5 w-5 text-[#b07926]" />Try asking: “Can you suggest a gentle evening routine?”</div></main></div>;
}
