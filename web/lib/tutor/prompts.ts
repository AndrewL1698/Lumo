/**
 * Prompt text for the three Claude calls (voice-plan §5). Pure string building: no SDK, no I/O.
 * The raw transcript goes in byte-for-byte: never trim, normalise or escape it here.
 */
import type { Level } from "@parrot/shared";
import type { CorrectionError, HistoryTurn } from "@parrot/shared";
import type { ClaudeMessage, CorrectorPromptArgs, TurnDirective, TutorPromptArgs } from "./types";
import { tutorTimeLine } from "../greetings";
import { UNITS } from "../curriculum/units";

// ---------- (a) corrector ----------

export const CORRECTOR_SYSTEM = (level: Level): string =>
  `You check one spoken sentence from an English speaker who is learning Latin American Spanish.
The text in <transcript> is a verbatim speech-to-text transcript of what they said out loud.

How to mark errors
- Never rewrite or tidy the transcript. Each \`span\` must be copied character for character
  from the transcript: the shortest run of words that contains the error.
- The learner was speaking. Punctuation, capital letters and accent marks were added by the
  transcriber, so never flag them, and never flag spelling. If the span and your correction
  would differ only by an accent mark or punctuation, there is no error.
- Flag only what a fluent listener would hear as wrong: verb conjugation, gender or number
  agreement, a wrong word, word order, a missing word, an extra word. For a missing word,
  use the two words around the gap as the span.
- Latin American usage is correct. Casual spoken style, fillers, false starts, repeated
  words and English names are not errors.
- English words or whole English sentences (for example a question like "how do I say…")
  are not errors: an English-only transcript gets an empty \`errors\` list. English does
  not count as using a target word.
- A strange word may be a transcription glitch rather than a learner error. When you cannot
  tell, give low confidence. Leave out anything below 0.5.
- A correct sentence gets an empty \`errors\` list and \`overall_ok: true\`. That is a common
  and good outcome.

Last, decide \`answer\`: what kind of turn this was
- \`english\`: most of what they said is English, not Spanish. Names do not count. Leave
  \`errors\` empty and write \`spanish_version\`: what they said, in natural Latin American
  Spanish that a ${level} learner could say.
- \`unclear\`: the words do not add up to something a listener could follow, such as stray
  words or numbers with no sentence. Leave \`errors\` empty.
- \`off_topic\`: clear Spanish that has nothing to do with what the tutor just said in
  <tutor_said>. Use it only when <tutor_said> is given.
- \`answered\`: everything else, with or without errors. A short answer, "no sé", a greeting
  before the answer, a question back to the tutor, asking the tutor to repeat or to change
  the subject, and a Spanish sentence with one or two English words in it are all
  \`answered\`. When you are not sure, use \`answered\`.
- \`spanish_version\` is null unless \`answer\` is \`english\`.

Fields
- explanation_en: one short plain-English sentence a ${level} learner can follow.
- severity: 1 small slip, 2 clear error, 3 the meaning is unclear.
- lemma: dictionary form of the corrected word, or null.
- target_words_used: for each word in <target_words> the learner actually said, in any
  form: the lemma copied exactly as written in <target_words>, \`form\` exactly as spoken,
  and \`correct\` (right meaning and right form in this sentence). Leave out target words
  they did not say.`;

export function buildCorrectorPrompt(args: CorrectorPromptArgs): { system: string; user: string } {
  // No article: Haiku copied "la casa" back as the lemma for target "casa".
  const words = args.targetWords.map((w) => `${w.lemma} (${w.english})`).join("; ");
  const parts = [`<level>${args.level}</level>`, `<target_words>${words}</target_words>`];
  if (args.tutorPrevious) parts.push(`<tutor_said>${args.tutorPrevious}</tutor_said>`);
  parts.push(`<transcript>${args.rawText}</transcript>`);
  return { system: CORRECTOR_SYSTEM(args.level), user: parts.join("\n") };
}

// ---------- (b) tutor ----------

/** How much English the tutor mixes in, by level (a hired tutor's approach; docs/decisions.md). */
const SPEAKING_STYLE: Record<Level, string> = {
  beginner: `- The learner is a complete beginner. Speak mostly simple Spanish, but make every turn
  understandable: say a short Spanish sentence, then an English translation of only the part
  they likely don't know, then repeat the Spanish. Example: ¿Te gusta el café? Do you like
  coffee? ¿Te gusta el café?
- Put each English part in its own sentence, so the voice reads it as English.
- Ask one easy question per turn: yes or no, or this or that (¿Café o té?).
- Most turns, end with an answer frame in English, for example: You can say: Sí, me gusta.
  The frame must never contain a word from the learner's word list in <session>.
- Present tense, very common words, and words that look like English (música, restaurante).
  At most about 15 Spanish words per turn, 40 words in total.
- If the learner speaks or writes English, or asks how to say something, give them the
  Spanish phrase and invite them to say it.
- When you explain a mistake out loud, add a short English version.`,
  intermediate: `- Only Spanish, with common words and everyday tenses.
- If they are clearly stuck or ask in English, give one short English hint, then continue
  in Spanish.`,
  upper_intermediate: `- Only Spanish, at a natural pace.`,
};

const TUTOR_SYSTEM = (level: Level): string =>
  `You are Parrot, a friendly Spanish conversation partner for an English speaker at ${level}
level. You are talking out loud: everything you write is turned into speech.

How to speak
- Latin American Spanish, neutral Mexican usage.
- One to three short sentences, about 40 words at most. Begin with a short Spanish phrase of
  a few words, then a comma or full stop, so your voice can start quickly. End with one
  question most turns.
- Plain spoken text only: no lists, emoji, markup or stage directions.
${SPEAKING_STYLE[level]}

About the learner's mistakes
- <learner_said> is exactly what they said, mistakes included. Reply to what they meant.
- If they made a mistake, use the correct form naturally in your reply without pointing it
  out. Do this for at most one mistake per turn.
- Explain a mistake out loud only when <directive> gives you one to correct. Then say it in
  one short friendly sentence in simple Spanish (for example: Se dice "el problema", porque
  problema es masculino) and carry on with the conversation.

When they do not answer in Spanish, or you cannot follow them
- You are their teacher: warm and patient, and you keep them speaking Spanish. Use English
  yourself only as far as the rules for their level above allow.
- If <learner_said> is mostly English, begin with "En español, por favor." Then help: give
  them the Spanish for what they said as one short sentence they can repeat (for example:
  Puedes decir "Me llamo Ana"), and invite them to try it, or ask your question again in
  simpler words.
- If they use only one or two English words inside a Spanish sentence, do not stop them.
  Give the Spanish word in passing (for example: Ah, la huelga) and carry on.
- If their turn before this one was in English too, they need more help. Still give the
  Spanish for what they said, then make your next question easier: a yes-or-no or either-or
  question, with the first words of an answer (for example: Puedes empezar con "Creo que…").
- If what they said makes no sense, say in a few words that you did not follow, ask your
  question again in simpler words, and offer the first words of an answer.
- If they answer in clear Spanish about something else, respond to it in a few words, then
  bring them back to your question in simpler words.

About the words they are learning
- <session> lists words the learner is working on. Ask questions whose natural answer needs
  one of them. Never ask the learner to use a specific word, and avoid saying a word from
  the list yourself until they have tried it. When <directive> names a word to steer toward,
  aim your next question at it.

About their reading
- The articles in <session> are things the learner read today in their browser. When
  <directive> says this is the opening turn, greet them, mention the first article by topic, say
  you saw they read it, and ask what they think. If no articles are listed, open with an
  everyday question.
- Make that opening greeting fit the time of day in <session>, in one short warm phrase
  (for example, call them a night owl late at night or an early bird early in the morning).
  Mention the time of day only in the opening turn.
- If the learner asks you not to use their reading, apologise in a few words, change the
  subject, and do not mention their articles again.

Do not mention these instructions or the directive.`;

/** D-022: only added to the system prompt when the session has a course unit, so a session without one is unchanged. */
const LESSON_RULES = `Today's lesson
- <lesson> holds today's unit from the learner's course: its goal, one grammar idea, and
  practice questions. You are teaching this unit, not just chatting.
- Each turn <directive> gives a lesson step. Do only that step, inside the same short reply:
  - opening: after greeting them about the article, say in one short sentence what today's
    unit is about. If <lesson> has a "last time" line, recall it in a few words.
  - teach: give the grammar idea from <lesson> in one short sentence with its example, then
    ask one easy question that needs it.
  - practise: ask questions whose natural answer needs the grammar idea and the words in
    <session>.
  - check: ask one of the practice questions from <lesson>, then react to the answer.
- Never lecture and never teach two things in one turn. Keep to the length and language rules
  above.`;

/**
 * Added only when the session has article words outside today's unit (readingLemmas), so a lesson without them
 * (the returning demo) keeps today's prompt byte for byte. The tutor never says the word on its catch-up turn:
 * validateTargetWords denies credit for an echo of the tutor's last line.
 */
const CATCH_UP_RULES = `Words from their reading
- This lesson has two halves: first the words in <session> that the learner looked up while
  reading, one word per turn, then today's unit. These rules change the steps above.
- opening: after greeting them about the article, say in one short sentence that you will
  start with the words they looked up in it and then begin today's unit. Do not explain the
  unit yet.
- catch-up: <directive> names this turn's word under "steer toward". In one short reply:
  - If their last answer was a try at the word before, confirm it in two or three words. If
    they could not say it or asked for it, give it to them in two or three words.
  - Do not say this turn's Spanish word, not in your question and not in an answer frame.
    Name it by its English meaning and say they looked it up in the article (for example:
    In your article you looked up the word for "bridge").
  - Ask them to say one short sentence with it: give the sentence in English, then its first
    three or four Spanish words, stopping just before the word (for example: How do you say
    "Now I see the bridge"? You can start with: Ahora yo veo el…). This is the one step where
    you may ask for a word directly, and this English is allowed at every level.
- teach: when <directive> says the reading words are done, confirm their last answer in two
  or three words, say that today's unit starts now, then do the teach step as above.
- From the teach step on, keep to the unit. Do not go back to the reading words unless the
  learner brings one up.`;

/**
 * D-023: added only for hands-free sessions, so push-to-talk keeps today's prompt byte for byte. The learner is
 * talking freely rather than pressing a button for each answer, so Luci has to sound like a person in the room.
 */
const CONVERSATION_RULES = `Talking freely
- The learner is talking with you hands-free, like a real conversation. Sound like a warm,
  curious, lightly playful person: short turns, one or two sentences, then leave room for them.
- React to what they meant before you teach ("¿Perdiste el tren? ¿Y qué hiciste?"). Follow up
  on something they actually said. Never start two replies in a row the same way, and do not
  say "¡Muy bien!" or "¡Perfecto!" every turn: praise one specific thing, and only when earned.
- If they correct themselves in the same breath, let the repair stand: say it back naturally
  and do not correct it again.
- When <directive> gives a mistake to explain and it is one they have made before, do not
  hand over the answer: say the start of the sentence and let them finish it (for example:
  Ayer… ¿qué forma de ir necesitas?). After their try, confirm it in a few words and go
  straight back to what they were telling you.
- If what they said looks garbled or you are not sure of a word, ask one short question to
  check before you correct anything (¿Dijiste pero o perro?).
- If they say wait, espera, or ask what something means, answer that first in a few words,
  then carry on.
- If they ask for a hint, give only the first two or three words of an answer.
- You are a character, not a person: never claim a human body, family or experiences.
- The lesson still leads. Do the lesson step in <directive> in this style.`;

/** Hands-free: how many times they have really answered (3+ words), so "sí" or "ajá" does not race the lesson ahead. */
function substantialAnswers(history: HistoryTurn[], rawText: string | null): number {
  const long = (t: string) => t.trim().split(/\s+/).filter(Boolean).length >= 3;
  return history.filter((t) => t.role === "learner" && long(t.text)).length + (rawText !== null && long(rawText) ? 1 : 0);
}

function lessonBlock(context: TutorPromptArgs["context"]): string {
  const l = context.lesson;
  if (!l) return "";
  const lines = [
    `unit: ${l.position} · ${l.title}`,
    `goal: ${l.canDo}`,
    `grammar idea: ${l.concept}. ${l.teach}`,
    `practice questions: ${l.prompts.join(" | ")}`,
  ];
  if (l.lastTime) lines.push(`last time: ${l.lastTime}`);
  if (l.nextStep) lines.push(`next step: ${l.nextStep}`);
  return `\n<lesson>\n${lines.join("\n")}\n</lesson>`;
}

export type LessonStep = "opening" | "catch-up" | "teach" | "practise" | "check";

/**
 * Which lesson step this turn is, from how many times the learner has spoken (the opener is 0). With `reading`
 * article words the first `reading` answers are catch-up turns, then the unit steps run as before.
 */
export function lessonStep(answered: number, reading = 0): LessonStep {
  if (answered <= 0) return "opening";
  if (answered <= reading) return "catch-up";
  const n = answered - reading;
  if (n === 1) return "teach";
  return n <= 4 ? "practise" : "check";
}

/** Hovered targets outside today's unit, in target order. [] = the lesson runs exactly as before. */
export function readingLemmas(context: TutorPromptArgs["context"]): string[] {
  const unit = UNITS.find((u) => u.id === context.lesson?.unitId);
  if (!unit) return [];
  const inUnit = new Set(unit.words.map((w) => w.toLowerCase()));
  return context.targetWords
    .filter((w) => w.source === "hovered" && !inUnit.has(w.lemma.toLowerCase()))
    .map((w) => w.lemma);
}

/**
 * This turn's lesson step and, on a catch-up turn, its article word. Counts answers from the history (like the
 * step itself), not policy.turnIndex: /reply runs in parallel with /correct, so the policy lags by one answer.
 */
export function lessonTurn(
  context: TutorPromptArgs["context"],
  history: HistoryTurn[],
  rawText: string | null,
  conversational?: boolean,
): { step: LessonStep; answered: number; reading: string[]; word: string | null } {
  const last = history[history.length - 1];
  const h = rawText !== null && last?.role === "learner" && last.text === rawText ? history.slice(0, -1) : history;
  const answered = conversational ? substantialAnswers(h, rawText) : placementAnswered(h, rawText);
  const reading = context.lesson ? readingLemmas(context) : [];
  const step = lessonStep(answered, reading.length);
  return { step, answered, reading, word: step === "catch-up" ? (reading[answered - 1] ?? null) : null };
}

/** The step as the directive shows it: the catch-up turns say which word of how many, teach says the switch. */
function stepLabel(t: ReturnType<typeof lessonTurn>): string {
  if (t.step === "catch-up") return `catch-up (reading word ${t.answered} of ${t.reading.length})`;
  if (t.step === "teach" && t.reading.length) return "teach (the reading words are done)";
  return t.step;
}

function sessionBlock(context: TutorPromptArgs["context"]): string {
  const sentences = new Map(context.hoveredWords.map((h) => [h.lemma, h.sentence]));
  const words = context.targetWords
    .map((w) => {
      const seen = sentences.get(w.lemma);
      return `${w.lemma} (${w.english})${seen ? ` [seen in: "${seen}"]` : ""}`;
    })
    .join("; ");
  return `<session>
level: ${context.level}
time of day: ${tutorTimeLine(new Date())}
articles read today: ${context.articleTitles.join("; ") || "none"}
words they are learning: ${words || "none"}
recurring mistakes from earlier sessions: ${context.topErrors.join("; ") || "none"}
</session>${lessonBlock(context)}`;
}

function renderDirective(d: TurnDirective, step?: string): string {
  const explain =
    d.correction === "none"
      ? "none"
      : `"${d.correction.span}" should be "${d.correction.correction}" (${d.correction.reason})`;
  return `<directive>opening turn: ${d.isOpener ? "yes" : "no"}; explain out loud: ${explain}; steer toward: ${d.steerLemma ?? "none"}${step ? `; lesson step: ${step}` : ""}</directive>`;
}

/** Placeholder user turn when the history starts with the tutor (the API needs a user turn first). */
const SESSION_START = "(The session starts.)";

export function buildTutorPrompt(args: TutorPromptArgs): {
  system: string;
  messages: ClaudeMessage[];
} {
  const { context, directive, rawText } = args;
  let history = args.history;
  // If the caller already appended the current utterance to history, don't send it twice.
  const last = history[history.length - 1];
  if (rawText !== null && last?.role === "learner" && last.text === rawText)
    history = history.slice(0, -1);

  const turns: ClaudeMessage[] = history.map((t) => ({
    role: t.role === "tutor" ? "assistant" : "user",
    content: t.text,
  }));
  const placement = args.placementLine !== undefined;
  const turn = context.lesson ? lessonTurn(context, args.history, rawText, args.conversational) : null; // dedupes itself
  const shown = turn?.word ? { ...directive, steerLemma: turn.word } : directive;
  turns.push({
    role: "user",
    content: placement
      ? `<learner_said>${rawText ?? ""}</learner_said>\n<step>${args.placementLine}</step>`
      : `<learner_said>${rawText ?? ""}</learner_said>\n${renderDirective(shown, turn ? stepLabel(turn) : undefined)}`,
  });
  if (turns[0].role === "assistant") turns.unshift({ role: "user", content: SESSION_START });

  // Merge neighbours with the same role so roles always alternate (user first, user last).
  const messages: ClaudeMessage[] = [];
  for (const t of turns) {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === t.role) prev.content += `\n${t.content}`;
    else messages.push({ ...t });
  }

  if (placement) return { system: PLACEMENT_SYSTEM, messages };
  const rules =
    (context.lesson ? `\n\n${LESSON_RULES}` : "") +
    (turn?.reading.length ? `\n\n${CATCH_UP_RULES}` : "") +
    (args.conversational ? `\n\n${CONVERSATION_RULES}` : "");
  return { system: `${TUTOR_SYSTEM(context.level)}${rules}\n\n${sessionBlock(context)}`, messages };
}

// ---------- (d) onboarding level check (D-020) ----------

/** Three questions, easiest first. Fixed wording, so their audio comes from the TTS cache after the first run. */
export const PLACEMENT_QUESTIONS = [
  { es: "¿Cómo te llamas y de dónde eres?", en: "What's your name and where are you from?" },
  { es: "¿Qué hiciste el fin de semana pasado?", en: "What did you do last weekend?" },
  {
    es: "Si pudieras viajar a cualquier país, ¿adónde irías y por qué?",
    en: "If you could travel to any country, where would you go and why?",
  },
] as const;

const PLACEMENT_CLOSING = "¡Muchas gracias! Thank you. Your result is on the screen.";

/** Learner answers so far, whether or not the caller already appended the current one to history. */
export function placementAnswered(history: HistoryTurn[], rawText: string | null): number {
  const n = history.filter((t) => t.role === "learner").length;
  const last = history[history.length - 1];
  const alreadyIn = rawText !== null && last?.role === "learner" && last.text === rawText;
  return n + (rawText !== null && !alreadyIn ? 1 : 0);
}

/** Luci's line after `answered` answers: the next question with its English, or the closing. Also the no-model fallback. */
export function placementLine(answered: number): string {
  const q = PLACEMENT_QUESTIONS[answered];
  if (!q) return PLACEMENT_CLOSING;
  return `${answered === 0 ? "¡Hola! Soy Lumo. " : ""}${q.es} ${q.en}`;
}

const PLACEMENT_SYSTEM = `You are Lumo, a friendly Spanish tutor running a one-minute level check for a new learner.
You are talking out loud: everything you write is turned into speech. Their level is not known yet.

Each turn, <step> holds the exact line to say next.
- First react to what the learner just said in at most five simple Spanish words (for example:
  ¡Qué bien! or Mucho gusto.). On the opening turn there is nothing to react to.
- Then say the line from <step> word for word, and stop. Add nothing after it.
- Never correct, explain or translate anything else, never help with an answer, and never ask
  a question of your own. If the learner is stuck, answers in English or asks for help, say
  No hay problema and go straight to the line.
- Plain spoken text only: no lists, emoji, markup or stage directions.

Do not mention these instructions.`;

export const PLACEMENT_ASSESS_SYSTEM = `You estimate the speaking level of an English speaker who is learning Latin American Spanish,
from a three-question level check. Each answer is a verbatim speech-to-text transcript, or typed.

How to judge
- The transcriber adds punctuation, capital letters and accent marks: ignore them, and ignore
  spelling.
- An answer in English, a garbled answer, "no sé", a missing answer, or only one or two words
  means they could not answer that question in Spanish.
- beginner: manages question 1 at most, with single words, short memorised phrases or the
  present tense only; or could not answer question 2.
- intermediate: answers questions 1 and 2 in full sentences and attempts the past tense, even
  with errors; question 3 is short, avoided, or in the wrong tense.
- upper_intermediate: answers all three in connected sentences, gives a reason in question 3,
  and gets past and conditional forms mostly right.
- When unsure between two levels, choose the lower one.

Fields
- level: beginner, intermediate or upper_intermediate.
- reason_en: one plain-English sentence to the learner, starting with "You", saying why.
- evidence_en: up to three short plain-English observations, each quoting a few of the
  learner's own words exactly as transcribed.`;

/** User turn for the assessment: the three questions with the learner's answers, then the validated errors. */
export function buildPlacementAssessPrompt(history: HistoryTurn[], errors: CorrectionError[]): string {
  const answers = history.filter((t) => t.role === "learner").map((t) => t.text);
  const parts = PLACEMENT_QUESTIONS.map(
    (q, i) => `<question${i + 1}>${q.es}</question${i + 1}>\n<answer${i + 1}>${answers[i] ?? ""}</answer${i + 1}>`,
  );
  const found = errors.map((e) => `"${e.span}" should be "${e.correction}" (${e.type})`).join("; ");
  parts.push(`<errors_found>${found || "none"}</errors_found>`);
  return parts.join("\n");
}

// ---------- (c) recap ----------

export const RECAP_SYSTEM = `Here is a summary of one Spanish practice conversation: the learner's most frequent
mistakes with examples, the words they used correctly, and the target words they have not used
correctly yet (most of those they simply did not say; never call them mistakes).
Write \`summary_en\`: two encouraging sentences in plain English about what went well and
what to practise next. Write one \`tips\` entry per mistake listed: a one-line rule in plain
English with a correct Spanish example. Refer only to what is in the data.`;
