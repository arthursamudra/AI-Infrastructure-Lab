/**
 * app.js — Curved SVG path + Guided Tour auto-scroll + TTS
 */

const cards = Array.from(document.querySelectorAll(".card"));

const token = document.getElementById("token");
const tokenLabel = document.getElementById("tokenLabel");
const chapterLabel = document.getElementById("chapterLabel");
const progressFill = document.getElementById("progressFill");

const hudStage = document.getElementById("hudStage");
const hudVisibility = document.getElementById("hudVisibility");
const hudCost = document.getElementById("hudCost");

// Curved SVG track
const tokenTrack = document.getElementById("tokenTrack");
const trackToken = document.getElementById("trackToken");
const trackSvg = document.getElementById("trackSvg");
const trackPath = document.getElementById("trackPath");
const trackMarkers = document.getElementById("trackMarkers");

// TTS controls
const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnResume = document.getElementById("btnResume");
const btnStop = document.getElementById("btnStop");
const ttsHint = document.getElementById("ttsHint");

// PREDECLARE to avoid TDZ errors
let narration = { isPlaying: false, isPaused: false, lastSpokenIndex: null };
let speakChapter = () => {};

const CHAPTER_COUNT = cards.length;

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

// ---------------- HUD token state ----------------
const tokenStateToClass = (state) => {
  if (!token) return;

  const states = [
    "state-invisible","state-warning","state-measured","state-routing",
    "state-ibm","state-pricing","state-decision","state-closing"
  ];
  states.forEach(s => token.classList.remove(s));

  const map = {
    invisible: "state-invisible",
    warning: "state-warning",
    measured: "state-measured",
    routing: "state-routing",
    ibm: "state-ibm",
    pricing: "state-pricing",
    decision: "state-decision",
    closing: "state-closing"
  };
  token.classList.add(map[state] || "state-invisible");

  const labelMap = {
    invisible: "TOKEN",
    warning: "RISK",
    measured: "MEASURED",
    routing: "ROUTED",
    ibm: "PLATFORM",
    pricing: "PRICING",
    decision: "DECISION",
    closing: "ACTION"
  };
  if (tokenLabel) tokenLabel.textContent = labelMap[state] || "TOKEN";
};

// ---------------- Active card tracking ----------------
let activeIndex = 0;
let activeCard = cards[0];

function setActiveCard(card) {
  if (!card) return;
  activeCard = card;
  activeIndex = Math.max(0, cards.indexOf(card));

  const ch = card.dataset.chapter || "";
  const title = card.dataset.title || "";
  if (chapterLabel) chapterLabel.textContent = `${ch} · ${title}`;

  if (hudStage) hudStage.textContent = card.dataset.stage || "—";
  if (hudVisibility) hudVisibility.textContent = card.dataset.visibility || "—";
  if (hudCost) hudCost.textContent = card.dataset.cost || "—";

  tokenStateToClass(card.dataset.token || "invisible");
  setActiveMarker(activeIndex);

  // Snap token to chapter marker
  setTokenOnCurve(markerProgress(activeIndex));

  // If narration is playing, speak this chapter
  if (narration && narration.isPlaying) speakChapter(activeIndex);
}

// ---------------- Page progress ----------------
function updatePageProgress() {
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  const docH = document.documentElement.scrollHeight - window.innerHeight;
  const pct = docH > 0 ? (scrollTop / docH) * 100 : 0;
  if (progressFill) progressFill.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(2)}%`;
}

// ---------------- Curved path markers + motion ----------------

// Returns overall “global progress” for a marker index (0..N-1) mapped to 0..1
function markerProgress(i) {
  if (CHAPTER_COUNT <= 1) return 0;
  return i / (CHAPTER_COUNT - 1);
}

function clearMarkers() {
  if (!trackMarkers) return;
  while (trackMarkers.firstChild) trackMarkers.removeChild(trackMarkers.firstChild);
}

function buildMarkers() {
  if (!trackMarkers || !trackPath) return;
  clearMarkers();

  const pathLen = trackPath.getTotalLength();

  for (let i = 0; i < CHAPTER_COUNT; i++) {
    const t = markerProgress(i);
    const p = trackPath.getPointAtLength(pathLen * t);

    // Circle marker
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", p.x);
    c.setAttribute("cy", p.y);
    c.setAttribute("r", 8);
    c.setAttribute("class", "marker");
    c.dataset.index = String(i);

    // Label (01..)
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", p.x);
    txt.setAttribute("y", p.y - 16);
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("class", "markerLabel");
    txt.textContent = String(i + 1).padStart(2, "0");
    txt.dataset.index = String(i);

    trackMarkers.appendChild(c);
    trackMarkers.appendChild(txt);
  }

  setActiveMarker(0);
}

function setActiveMarker(index) {
  if (!trackMarkers) return;
  const nodes = Array.from(trackMarkers.children);
  nodes.forEach((el) => {
    const i = Number(el.dataset.index);
    if (el.classList.contains("marker")) el.classList.toggle("active", i === index);
    if (el.classList.contains("markerLabel")) el.classList.toggle("active", i === index);
  });
}

// Place token DIV on the SVG curve at global progress (0..1)
function setTokenOnCurve(tGlobal) {
  if (!trackPath || !trackToken || !trackSvg) return;

  const pathLen = trackPath.getTotalLength();
  const p = trackPath.getPointAtLength(pathLen * clamp01(tGlobal));

  // Convert SVG point to pixel position inside tokenTrack
  const svgRect = trackSvg.getBoundingClientRect();
  const xPx = (p.x / 1000) * svgRect.width; // viewBox width=1000
  const yPx = (p.y / 120) * svgRect.height; // viewBox height=120

  // trackToken is absolutely positioned inside tokenTrack
  trackToken.style.left = `${xPx}px`;
  trackToken.style.top = `${yPx}px`;
}

// “within-section” progress drives token slightly toward next marker
function getProgressWithinActiveCard() {
  if (!activeCard) return 0;
  const rect = activeCard.getBoundingClientRect();
  const vh = window.innerHeight;
  const total = rect.height;
  const traveled = vh - rect.top;
  const raw = traveled / (total + vh * 0.15);
  return clamp01(raw);
}

function updateCurveFromScroll() {
  const within = getProgressWithinActiveCard();
  const base = markerProgress(activeIndex);
  const next = markerProgress(Math.min(activeIndex + 1, CHAPTER_COUNT - 1));
  const t = base + (next - base) * within;
  setTokenOnCurve(t);
}

// Build markers once DOM ready
buildMarkers();

// ---------------- Observers & events ----------------
const io = new IntersectionObserver((entries) => {
  const visible = entries
    .filter(e => e.isIntersecting)
    .sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (visible) setActiveCard(visible.target);
}, { threshold: [0.35, 0.5, 0.65, 0.8] });

cards.forEach(c => io.observe(c));

window.addEventListener("scroll", () => {
  updatePageProgress();
  updateCurveFromScroll();
}, { passive: true });

window.addEventListener("resize", () => {
  buildMarkers(); // recompute marker positions for new width
  updateCurveFromScroll();
}, { passive: true });

updatePageProgress();
setActiveCard(cards[0]);
updateCurveFromScroll();

// ============================================================================
// VOICEOVER (Guided Tour): Speak chapter, then auto-scroll to next
// ============================================================================

const SCRIPT = [
  `We often talk about AI in terms of models, prompts, and tokens. Platforms like IBM bill customers based on tokens used. But what actually happens to a token after it’s billed? This is the journey we want to show.`,
  `Before the lab, a token enters the platform, gets processed by a model, and the customer is billed. The platform cannot see the physical reality behind that token: the energy consumed, the cooling required, or the true cost to deliver it.`,
  `Most platforms know token counts and response time. But they don’t know whether the token was cheap or expensive to produce, efficient or wasteful, or whether it strained infrastructure behind the scenes.`,
  `This creates a blind spot. Two tokens may be billed the same, but one may consume far more energy, trigger higher cooling load, and quietly erode platform margins.`,
  `The Infinite–SuperMax lab changes this. It allows the platform to observe how AI tokens behave in the physical world on real GPUs and real cooling systems. The token journey no longer ends at billed.`,
  `After the lab, before execution, a lightweight decision layer can choose where the request should run based on its needs: interactive or batch, short or long context, and sustainability preference. Same model logic, smarter placement.`,
  `As the token is generated, the lab measures energy consumed, cooling overhead, and stability under load. The token is no longer abstract. It has a measurable footprint.`,
  `Here is the proof moment. Tokens that look identical in billing can have very different energy and cooling cost to serve. The lab makes that difference measurable, and repeatable.`,
  `For a platform vendor like IBM, this unlocks the ability to distinguish tokens that are cheap to serve from tokens that are expensive to serve, even if they look identical from a billing perspective.`,
  `Before the lab, all tokens are priced the same and cost to serve is averaged. After the lab, tokens remain tokens, but the platform understands true cost. This enables performance optimized, standard, and sustainability first options without changing how customers use the platform.`,
  `This is the shift: tokens become more than a billing unit. They become a decision unit guiding routing, platform defaults, and monetization strategy, grounded in physical truth.`,
  `We didn’t just measure energy per token. We revealed what it takes to produce intelligence, one token at a time.`
];

function canSpeak() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function setTTSButtons() {
  btnPlay.disabled = !canSpeak() || narration.isPlaying === true;
  btnPause.disabled = !narration.isPlaying || narration.isPaused;
  btnResume.disabled = !narration.isPlaying || !narration.isPaused;
  btnStop.disabled = !narration.isPlaying;
}

function initVoices() {
  if (!canSpeak()) return;

  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length) {
    narration.voiceReady = true;

    const preferred =
      voices.find(v => /en/i.test(v.lang) && /Google|Microsoft|Natural/i.test(v.name)) ||
      voices.find(v => /en/i.test(v.lang)) ||
      voices[0];

    narration.selectedVoice = preferred || null;

    if (ttsHint) {
      ttsHint.textContent = `Guided tour ready (${narration.selectedVoice?.name || "default"}). Click Play.`;
    }
  }
}

narration = {
  isPlaying: false,
  isPaused: false,
  lastSpokenIndex: null,
  voiceReady: false,
  selectedVoice: null,
  speakTimer: null,
  autoAdvance: true, // guided tour behavior
};

// Smoothly scroll to a specific chapter index
function scrollToChapter(index) {
  const target = cards[index];
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function stopSpeaking() {
  if (!canSpeak()) return;
  clearTimeout(narration.speakTimer);
  window.speechSynthesis.cancel();
  narration.isPlaying = false;
  narration.isPaused = false;
  narration.lastSpokenIndex = null;
  setTTSButtons();
}

function pauseSpeaking() {
  if (!canSpeak() || !narration.isPlaying) return;
  window.speechSynthesis.pause();
  narration.isPaused = true;
  setTTSButtons();
}

function resumeSpeaking() {
  if (!canSpeak() || !narration.isPlaying) return;
  window.speechSynthesis.resume();
  narration.isPaused = false;
  setTTSButtons();
}

// Debounced speak; auto-advance on end
speakChapter = function(index) {
  if (!canSpeak() || !narration.isPlaying) return;

  if (!narration.voiceReady) {
    initVoices();
    if (!narration.voiceReady) {
      if (ttsHint) ttsHint.textContent = "Loading voices… please click Play again in a second.";
      return;
    }
  }

  if (narration.lastSpokenIndex === index) return;

  clearTimeout(narration.speakTimer);
  narration.speakTimer = setTimeout(() => {
    window.speechSynthesis.cancel();

    const text = SCRIPT[index] || "";
    if (!text) return;

    const u = new SpeechSynthesisUtterance(text);
    if (narration.selectedVoice) u.voice = narration.selectedVoice;

    u.rate = 1.02;
    u.pitch = 1.0;
    u.volume = 1.0;

    narration.lastSpokenIndex = index;

    u.onend = () => {
      // Guided tour: automatically go to next chapter
      if (!narration.isPlaying || narration.isPaused) return;
      if (!narration.autoAdvance) return;

      const next = index + 1;
      if (next < cards.length) {
        // Wait a beat so the transition feels intentional
        setTimeout(() => scrollToChapter(next), 450);
      } else {
        // End of tour
        setTimeout(() => stopSpeaking(), 300);
      }
    };

    window.speechSynthesis.speak(u);
  }, 120);
};

// voice loading
if (canSpeak()) {
  window.speechSynthesis.onvoiceschanged = () => initVoices();
  initVoices();
}

btnPlay.addEventListener("click", () => {
  if (!canSpeak()) {
    if (ttsHint) ttsHint.textContent = "Voiceover not supported in this browser.";
    return;
  }

  initVoices();
  narration.isPlaying = true;
  narration.isPaused = false;
  narration.lastSpokenIndex = null; // restart from current
  setTTSButtons();

  // Start from current section (or jump to top if you prefer)
  speakChapter(activeIndex);
});

btnPause.addEventListener("click", pauseSpeaking);
btnResume.addEventListener("click", resumeSpeaking);
btnStop.addEventListener("click", stopSpeaking);

if (!canSpeak()) {
  if (ttsHint) ttsHint.textContent = "Voiceover not supported in this browser.";
  btnPlay.disabled = true;
} else {
  if (ttsHint) ttsHint.textContent = "Loading voices…";
}
setTTSButtons();
