import { useEffect, useRef, useState } from "react";
import { Camera, Copy, CreditCard, Mic, Phone, QrCode, Send, Video } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";
import { openRazorpayCheckout, type RazorpayOrder, type RazorpayPaymentMethod, type RazorpayResult } from "@/lib/razorpay";

type PeerSignal = {
  id: number;
  from: string;
  type: "offer" | "answer" | "ice";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
};
type CallMode = "chat" | "video";
type ActiveCall = { roomId: string; peerId: string; initiator: boolean; mode: CallMode; billingSessionId: string };
type ChatMessage = { id: number; mine: boolean; text: string };
type WalletInfo = { balance: number; rates: Record<CallMode, number>; topUpAmounts: number[] };

async function readError(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return typeof payload.message === "string" ? payload.message : `Call service error (${response.status}).`;
}

export default function ConsultationRoom() {
  const [joinCode, setJoinCode] = useState("");
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [walletError, setWalletError] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletPaymentProof, setWalletPaymentProof] = useState<RazorpayResult | null>(null);
  const [walletPaymentMethod, setWalletPaymentMethod] = useState<RazorpayPaymentMethod>("card");
  const [callMode, setCallMode] = useState<CallMode>("video");
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [startingCall, setStartingCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remotePeerId, setRemotePeerId] = useState("");
  const [status, setStatus] = useState("Create a room or join using an invite code.");
  const [callError, setCallError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [copied, setCopied] = useState(false);
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const remotePeerRef = useRef("");
  const connectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const handledSignalId = useRef(0);
  const offerStarted = useRef(false);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const refreshWallet = async () => {
    const response = await fetch("/api/wallet");
    if (!response.ok) throw new Error(await readError(response));
    setWallet(await response.json() as WalletInfo);
  };

  useEffect(() => {
    void refreshWallet().catch((error: unknown) => {
      setWalletError(error instanceof Error ? error.message : "Could not load your wallet.");
    });
  }, []);

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (remoteAudio.current) remoteAudio.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    callRef.current = call;
    remotePeerRef.current = remotePeerId;
  }, [call, remotePeerId]);

  useEffect(() => {
    if (!call || (call.mode === "video" && !localStream)) return;

    let disposed = false;
    let pollTimer = 0;
    let polling = false;
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    connectionRef.current = connection;
    const peerStream = new MediaStream();
    setRemoteStream(peerStream);
    if (localStream) localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));

    const setUpDataChannel = (channel: RTCDataChannel) => {
      dataChannelRef.current = channel;
      channel.onopen = () => setStatus("Connected — video and chat are ready.");
      channel.onclose = () => setStatus("Chat connection closed.");
      channel.onmessage = (event) => {
        setMessages((current) => [...current, { id: Date.now(), mine: false, text: String(event.data) }]);
      };
    };

    if (call.initiator) setUpDataChannel(connection.createDataChannel("chat"));
    connection.ondatachannel = (event) => setUpDataChannel(event.channel);
    connection.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        stream.getTracks().forEach((track) => {
          if (!peerStream.getTracks().some((item) => item.id === track.id)) peerStream.addTrack(track);
        });
      } else if (!peerStream.getTracks().some((track) => track.id === event.track.id)) {
        peerStream.addTrack(event.track);
      }
      setRemoteStream(peerStream);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") setStatus("Connected — video and chat are ready.");
      if (connection.connectionState === "failed" || connection.connectionState === "disconnected") {
        setStatus("Connection interrupted. Check both networks and try again.");
      }
    };
    connection.onicecandidate = (event) => {
      const activeCall = callRef.current;
      const recipient = remotePeerRef.current;
      if (!event.candidate || !activeCall || !recipient) return;
      void fetch(`/api/calls/rooms/${activeCall.roomId}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: activeCall.peerId, to: recipient, type: "ice", payload: event.candidate.toJSON() }),
      }).then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
      }).catch((error: unknown) => {
        if (!disposed) setCallError(error instanceof Error ? error.message : "Could not send network information.");
      });
    };

    const pollSignals = async () => {
      const activeCall = callRef.current;
      if (!activeCall || disposed || polling) return;
      polling = true;
      try {
        const response = await fetch(`/api/calls/rooms/${activeCall.roomId}/signals?peerId=${encodeURIComponent(activeCall.peerId)}&after=${handledSignalId.current}`);
        if (!response.ok) throw new Error(await readError(response));
        const data = await response.json() as { peers: string[]; signals: PeerSignal[] };
        const remoteId = data.peers[0] || "";
        if (remoteId && remoteId !== remotePeerRef.current) {
          remotePeerRef.current = remoteId;
          setRemotePeerId(remoteId);
          setStatus("Other participant joined. Connecting…");
        }

        if (call.initiator && remoteId && !offerStarted.current) {
          offerStarted.current = true;
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          const signalResponse = await fetch(`/api/calls/rooms/${activeCall.roomId}/signals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from: activeCall.peerId, to: remoteId, type: "offer", payload: offer }),
          });
          if (!signalResponse.ok) throw new Error(await readError(signalResponse));
          setStatus("Invite accepted. Establishing a secure peer connection…");
        }

        for (const signal of data.signals) {
          handledSignalId.current = Math.max(handledSignalId.current, signal.id);
          remotePeerRef.current = signal.from;
          setRemotePeerId(signal.from);
          if (signal.type === "offer") {
            await connection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            for (const candidate of pendingCandidates.current.splice(0)) await connection.addIceCandidate(candidate);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            const answerResponse = await fetch(`/api/calls/rooms/${activeCall.roomId}/signals`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ from: activeCall.peerId, to: signal.from, type: "answer", payload: answer }),
            });
            if (!answerResponse.ok) throw new Error(await readError(answerResponse));
            setStatus("Connecting to the other participant…");
          } else if (signal.type === "answer") {
            await connection.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            for (const candidate of pendingCandidates.current.splice(0)) await connection.addIceCandidate(candidate);
          } else {
            const candidate = signal.payload as RTCIceCandidateInit;
            if (connection.remoteDescription) await connection.addIceCandidate(candidate);
            else pendingCandidates.current.push(candidate);
          }
        }
      } catch (error) {
        if (!disposed) {
          setCallError(error instanceof Error ? error.message : "Could not connect to the call room.");
          setStatus("Call setup needs attention.");
        }
      } finally {
        polling = false;
      }
    };

    void pollSignals();
    pollTimer = window.setInterval(() => void pollSignals(), 1200);

    return () => {
      disposed = true;
      window.clearInterval(pollTimer);
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.close();
      connectionRef.current = null;
      dataChannelRef.current = null;
      setRemoteStream(null);
    };
  }, [call, localStream]);

  useEffect(() => () => {
    const activeCall = callRef.current;
    if (activeCall) {
      void fetch(`/api/calls/rooms/${activeCall.roomId}/participants/${activeCall.peerId}`, {
        method: "DELETE",
        keepalive: true,
      }).catch((error: unknown) => console.error("Could not close call room participant.", error));
      void fetch(`/api/wallet/call-sessions/${activeCall.billingSessionId}`, {
        method: "DELETE",
        keepalive: true,
      }).catch((error: unknown) => console.error("Could not close wallet call session.", error));
    }
    localStream?.getTracks().forEach((track) => track.stop());
  }, [localStream]);

  const rechargeWallet = async (amount: number) => {
    if (walletBusy) return;
    setWalletBusy(true);
    setWalletError("");
    try {
      let payment = walletPaymentProof;
      if (!payment) {
        const response = await fetch("/api/payments/razorpay/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose: "wallet", amount }),
        });
        if (!response.ok) throw new Error(await readError(response));
        const order = await response.json() as RazorpayOrder;
        payment = await openRazorpayCheckout(order, walletPaymentMethod);
        setWalletPaymentProof(payment);
      }
      const verifyResponse = await fetch("/api/payments/razorpay/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payment),
      });
      if (!verifyResponse.ok) throw new Error(await readError(verifyResponse));
      const result = await verifyResponse.json() as { balance: number; message: string };
      setWalletPaymentProof(null);
      await refreshWallet();
      setStatus(result.message);
      toast.success("Wallet topped up", { description: `₹${amount} added to your rupee wallet.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not complete wallet payment.";
      setWalletError(message);
      if (!message.startsWith("Payment window closed")) toast.error("Wallet payment failed", { description: message });
    } finally {
      setWalletBusy(false);
    }
  };

  const startRoom = async (joinExisting: boolean) => {
    if (call || localStream || startingCall || !wallet) return;
    setStartingCall(true);
    setCallError("");
    setStatus("Requesting camera and microphone permission…");
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls require HTTPS or localhost in a supported browser.");
      stream = await navigator.mediaDevices.getUserMedia({
        video: callMode === "video",
        audio: true,
      });
    } catch (error) {
      setStatus("Microphone permission is required to start.");
      setCallError(error instanceof Error ? error.message : "Microphone access was blocked.");
      setStartingCall(false);
      return;
    }

    let roomParticipant: { roomId: string; peerId: string } | null = null;
    try {
      const response = joinExisting
        ? await fetch(`/api/calls/rooms/${encodeURIComponent(joinCode.trim())}/join`, { method: "POST" })
        : await fetch("/api/calls/rooms", { method: "POST" });
      if (!response.ok) throw new Error(await readError(response));
      roomParticipant = await response.json() as { roomId: string; peerId: string };
      const walletResponse = await fetch("/api/wallet/call-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: callMode, roomId: roomParticipant.roomId, peerId: roomParticipant.peerId }),
      });
      if (!walletResponse.ok) throw new Error(await readError(walletResponse));
      const billing = await walletResponse.json() as { sessionId: string; balance: number; rate: number };
      setWallet((current) => current ? { ...current, balance: billing.balance } : current);
      handledSignalId.current = 0;
      offerStarted.current = false;
      pendingCandidates.current = [];
      setMessages([]);
      setRemotePeerId("");
      setCall({ ...roomParticipant, initiator: !joinExisting, mode: callMode, billingSessionId: billing.sessionId });
      setLocalStream(stream);
      setCallError("");
      setStatus(joinExisting ? "Joined. Your rupee wallet is active; waiting for the room host…" : "Room created. Share the invite code with one participant.");
    } catch (error) {
      if (roomParticipant) {
        await fetch(`/api/calls/rooms/${roomParticipant.roomId}/participants/${roomParticipant.peerId}`, { method: "DELETE" }).catch(() => undefined);
      }
      stream?.getTracks().forEach((track) => track.stop());
      void refreshWallet().catch((walletLoadError: unknown) => {
        setWalletError(walletLoadError instanceof Error ? walletLoadError.message : "Could not refresh wallet balance.");
      });
      setStatus("The call room could not be started.");
      setCallError(error instanceof Error ? error.message : "Call service unavailable.");
    } finally {
      setStartingCall(false);
    }
  };

  const leaveRoom = () => {
    if (call) {
      void fetch(`/api/calls/rooms/${call.roomId}/participants/${call.peerId}`, { method: "DELETE" })
        .then((response) => {
          if (!response.ok) throw new Error(`Could not close call room (${response.status}).`);
        })
        .catch((error: unknown) => console.error(error));
      void fetch(`/api/wallet/call-sessions/${call.billingSessionId}`, { method: "DELETE" })
        .then(async (response) => {
          if (!response.ok) throw new Error(await readError(response));
          await refreshWallet();
        })
        .catch((error: unknown) => setWalletError(error instanceof Error ? error.message : "Could not close wallet session."));
    }
    connectionRef.current?.close();
    dataChannelRef.current?.close();
    localStream?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setCall(null);
    setRemotePeerId("");
    setMessages([]);
    setStatus("Call ended.");
  };

  useEffect(() => {
    if (!call) return;
    const heartbeat = async () => {
      try {
        const response = await fetch(`/api/wallet/call-sessions/${call.billingSessionId}/heartbeat`, { method: "POST" });
        if (!response.ok) throw new Error(await readError(response));
        const result = await response.json() as { active: boolean; balance: number; message?: string };
        setWallet((current) => current ? { ...current, balance: result.balance } : current);
        if (!result.active) {
          leaveRoom();
          setStatus("Call ended because your wallet balance is too low.");
          setCallError(result.message || "Add money to your wallet to start another call.");
        }
      } catch (error) {
        leaveRoom();
        setCallError(error instanceof Error ? error.message : "Wallet billing could not be verified; the call was ended.");
      }
    };
    const timer = window.setInterval(() => void heartbeat(), 60_000);
    return () => window.clearInterval(timer);
  }, [call]);

  const sendChatMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const text = chatInput.trim();
    const channel = dataChannelRef.current;
    if (!text || !channel || channel.readyState !== "open") return;
    channel.send(text);
    setMessages((current) => [...current, { id: Date.now(), mine: true, text }]);
    setChatInput("");
  };

  const toggleTrack = (kind: "audio" | "video") => {
    const tracks = kind === "audio" ? localStream?.getAudioTracks() : localStream?.getVideoTracks();
    if (!tracks?.length) return;
    tracks.forEach((track) => { track.enabled = !track.enabled; });
    setStatus(`${kind === "audio" ? "Microphone" : "Camera"} ${tracks[0].enabled ? "on" : "off"}.`);
  };

  const copyInvite = async () => {
    if (!call) return;
    const invitation = `${window.location.origin}/experts?room=${encodeURIComponent(call.roomId)}&mode=${call.mode}`;
    try {
      await navigator.clipboard.writeText(invitation);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error("Could not copy call invite.", error);
      setCallError("Copy is unavailable. Share the room code manually.");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get("room");
    if (roomFromUrl) setJoinCode(roomFromUrl);
    const modeFromUrl = params.get("mode");
    if (modeFromUrl === "chat" || modeFromUrl === "video") setCallMode(modeFromUrl);
  }, []);

  return (
    <section className="rounded-3xl border border-[#173d32]/10 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e9f1e4]"><Video className="h-5 w-5" /></span>
        <div>
          <h2 className="font-display text-2xl">Expert call & video session</h2>
          <p className="mt-1 text-sm leading-6 text-[#173d32]/65">Start a voice-and-chat or video session. Calls connect peer-to-peer; only share an invite with someone you trust.</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#173d32]/10 bg-[#f7f3eb] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#a36d21]">Rechargeable rupee wallet</p>
            <p className="mt-1 font-display text-3xl">{wallet ? `₹${wallet.balance.toFixed(2)}` : "Loading…"}</p>
            <p className="mt-1 text-xs leading-5 text-[#173d32]/60">Wallet top-ups use Razorpay and are added only after payment verification. Choose card or UPI QR below.</p>
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold">Payment method</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={walletPaymentMethod === "card"} onClick={() => setWalletPaymentMethod("card")} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${walletPaymentMethod === "card" ? "border-[#173d32] bg-[#e9f1e4]" : "border-[#173d32]/15 bg-white"}`}><CreditCard className="h-4 w-4" /> Card</button>
            <button type="button" aria-pressed={walletPaymentMethod === "upi"} onClick={() => setWalletPaymentMethod("upi")} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${walletPaymentMethod === "upi" ? "border-[#173d32] bg-[#e9f1e4]" : "border-[#173d32]/15 bg-white"}`}><QrCode className="h-4 w-4" /> UPI / scan QR</button>
          </div>
        </fieldset>
        <div className="mt-3 flex flex-wrap gap-2">
          {(wallet?.topUpAmounts ?? []).map((amount) => (
            <button key={amount} type="button" disabled={walletBusy || !wallet} onClick={() => void rechargeWallet(amount)} className="rounded-full border border-[#173d32]/15 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
              {walletBusy ? "Opening payment…" : `Add ₹${amount}`}
            </button>
          ))}
        </div>
        {wallet && <p className="mt-3 text-xs text-[#173d32]/70">Voice + chat: ₹{wallet.rates.chat}/min · Video: ₹{wallet.rates.video}/min. The first minute is charged when you start; usage is rounded up by the minute.</p>}
        {walletError && <div role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p>{walletError}</p>
          {walletPaymentProof && <button type="button" disabled={walletBusy} onClick={() => void rechargeWallet(0)} className="mt-2 font-semibold underline disabled:opacity-60">Retry payment verification</button>}
          {walletError.includes("Sign in") && <Link href="/?auth=login" className="mt-2 inline-block font-semibold underline">Sign in or create an account</Link>}
        </div>}
      </div>

      {!call ? (
        <div className="mt-5 space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold">Choose a session</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(["chat", "video"] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={callMode === mode} onClick={() => setCallMode(mode)} className={`rounded-xl border p-3 text-left ${callMode === mode ? "border-[#173d32] bg-[#edf3ea]" : "border-[#173d32]/10 bg-white"}`}>
                  <span className="block font-semibold">{mode === "chat" ? "Voice + text chat" : "Video + text chat"}</span>
                  <span className="mt-1 block text-xs text-[#173d32]/65">{wallet ? `₹${wallet.rates[mode]} per minute` : "Loading rate…"}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {wallet && wallet.balance < wallet.rates[callMode] && <p role="status" className="rounded-xl bg-[#fff8e9] p-3 text-sm text-[#765213]">Add at least ₹{wallet.rates[callMode]} to your wallet to start this session.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-[#edf3ea] p-4">
              <p className="font-semibold">Start a session</p>
              <p className="mt-1 text-sm text-[#173d32]/60">Create an invite code and share it with one participant. Your rupee wallet covers your session.</p>
              <button type="button" disabled={startingCall || !wallet || wallet.balance < wallet.rates[callMode]} onClick={() => void startRoom(false)} className="mt-4 rounded-full bg-[#173d32] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {startingCall ? "Starting…" : callMode === "video" ? "Start video session" : "Start voice call"}
              </button>
            </div>
            <form className="rounded-2xl bg-[#f7f3eb] p-4" onSubmit={(event) => { event.preventDefault(); void startRoom(true); }}>
              <label htmlFor="call-room-code" className="font-semibold">Join a session</label>
              <p className="mt-1 text-sm text-[#173d32]/60">Enter the room code from your invite link.</p>
              <input id="call-room-code" required value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="Room code" className="mt-3 h-11 w-full rounded-xl border border-[#173d32]/15 bg-white px-3 text-sm" />
              <button type="submit" disabled={startingCall || !wallet || wallet.balance < wallet.rates[callMode]} className="mt-3 rounded-full border border-[#173d32]/15 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
                {startingCall ? "Joining…" : `Join ${callMode === "video" ? "video session" : "voice call"}`}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#edf3ea] p-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-[#173d32]/60">Room code</p><p className="break-all font-mono text-sm">{call.roomId}</p></div>
            {call.initiator && <button type="button" onClick={() => void copyInvite()} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold"><Copy className="h-4 w-4" />{copied ? "Copied" : "Copy invite"}</button>}
          </div>
          <p role="status" className="mt-3 text-sm text-[#173d32]/70">{status}</p>
          {callError && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">{callError}</p>}
          {call.mode === "video" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="relative min-h-48 overflow-hidden rounded-2xl bg-[#173d32]">
                <video ref={localVideo} autoPlay muted playsInline className="h-48 w-full object-cover" />
                <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-xs text-white">You</span>
              </div>
              <div className="relative grid min-h-48 place-items-center overflow-hidden rounded-2xl bg-[#173d32]">
                <video ref={remoteVideo} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
                {!remoteStream?.getTracks().some((track) => track.kind === "video" && track.readyState === "live") && <p className="text-sm text-white/75">Waiting for the other participant…</p>}
                <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-1 text-xs text-white">Participant</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid min-h-36 place-items-center rounded-2xl bg-[#173d32] p-5 text-center text-white">
              <div><Phone className="mx-auto h-8 w-8" /><p className="mt-2 font-semibold">Voice call + text chat</p><p className="mt-1 text-sm text-white/70">{remotePeerId ? "Connected to the participant" : "Waiting for the other participant…"}</p></div>
              <audio ref={remoteAudio} autoPlay />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => toggleTrack("audio")} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold"><Mic className="h-4 w-4" />Toggle mic</button>
            {call.mode === "video" && <button type="button" onClick={() => toggleTrack("video")} className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold"><Camera className="h-4 w-4" />Toggle camera</button>}
            <button type="button" onClick={leaveRoom} className="inline-flex items-center gap-2 rounded-full bg-red-700 px-3 py-2 text-xs font-semibold text-white"><Phone className="h-4 w-4 rotate-[135deg]" />Leave room</button>
          </div>
          <div className="mt-5 rounded-2xl border border-[#173d32]/10 p-3">
            <div aria-live="polite" className="max-h-40 space-y-2 overflow-y-auto">
              {messages.map((message) => <p key={message.id} className={`w-fit max-w-[90%] rounded-xl px-3 py-2 text-sm ${message.mine ? "ml-auto bg-[#173d32] text-white" : "bg-[#edf3ea]"}`}>{message.text}</p>)}
              {!messages.length && <p className="text-xs text-[#173d32]/55">Messages appear here when the other participant joins.</p>}
            </div>
            <form onSubmit={sendChatMessage} className="mt-3 flex gap-2">
              <input value={chatInput} onChange={(event) => setChatInput(event.target.value)} disabled={!remotePeerId} maxLength={1000} aria-label="Chat message" placeholder={remotePeerId ? "Write a message…" : "Waiting for participant"} className="h-11 min-w-0 flex-1 rounded-xl border border-[#173d32]/15 px-3 text-sm disabled:bg-[#f7f3eb]" />
              <button disabled={!remotePeerId || !chatInput.trim()} aria-label="Send chat message" className="grid h-11 w-11 place-items-center rounded-xl bg-[#173d32] text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </form>
          </div>
        </div>
      )}
      {callError && !call && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{callError}</p>}
      {!call && status !== "Create a room or join using an invite code." && <p role="status" className="mt-3 text-sm text-[#173d32]/70">{status}</p>}
    </section>
  );
}
