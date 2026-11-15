/** Run: npx tsx web/lib/tutor/checks/prompts.check.ts — pure string checks, never calls the API. */
import assert from "node:assert/strict";
import { rawTextFixture, tutorContextFixture } from "@parrot/shared";
import {
  buildCorrectorPrompt,
  buildPlacementAssessPrompt,
  buildTutorPrompt,
  CORRECTOR_SYSTEM,
  PLACEMENT_ASSESS_SYSTEM,
  PLACEMENT_QUESTIONS,
  placementAnswered,
  placementLine,
  RECAP_SYSTEM,
} from "../prompts";
import type { ClaudeMessage, TurnDirective } from "../types";

const ctx = tutorContextFixture;
const none: TurnDirective = { correction: "none", steerLemma: null, isOpener: false };

function assertAlternates(messages: ClaudeMessage[]) {
  assert.ok(messages.length > 0);
  assert.equal(messages[0].role, "user");
  assert.equal(messages[messages.length - 1].role, "user");
  messages.forEach((m, i) =>
    assert.equal(m.role, i % 2 === 0 ? "user" : "assistant", `role at ${i}`),
  );
}

// ---------- corrector ----------
{
  const { system, user } = buildCorrectorPrompt({
    rawText: rawTextFixture,
    level: ctx.level,
    targetWords: ctx.targetWords,
  });
  assert.equal(system, CORRECTOR_SYSTEM(ctx.level));
  assert.ok(system.includes(`a ${ctx.level} learner`));
  assert.ok(!system.includes("{level}"));
  assert.ok(user.includes(`<transcript>${rawTextFixture}</transcript>`));
  assert.ok(user.includes(`<level>${ctx.level}</level>`));
  assert.ok(
    user.includes(
      "<target_words>huelga (strike); aprovechar (to make the most of); casa (house)</target_words>",
    ),
  );
  assert.ok(!user.includes("<tutor_said>"));
  assert.ok(system.includes("copied exactly as written in <target_words>"));

  // Raw text is byte-for-byte: odd spacing, capitals and punctuation survive.
  const messy = "  Yo  tiene la problema,  eh... ";
  const withTutor = buildCorrectorPrompt({
    rawText: messy,
    level: "beginner",
    targetWords: [],
    tutorPrevious: "¿Qué pasó hoy?",
  });
  assert.ok(withTutor.user.includes(`<transcript>${messy}</transcript>`));
  assert.ok(withTutor.user.includes("<tutor_said>¿Qué pasó hoy?</tutor_said>"));
  assert.ok(withTutor.user.indexOf("<tutor_said>") < withTutor.user.indexOf("<transcript>"));
}

// ---------- tutor: opener ----------
{
  const { system, messages } = buildTutorPrompt({
    context: ctx,
    history: [],
    rawText: null,
    directive: { correction: "none", steerLemma: "huelga", isOpener: true },
  });
  assert.equal(messages.length, 1);
  assertAlternates(messages);
  assert.ok(messages[0].content.includes("<learner_said></learner_said>"));
  assert.ok(messages[0].content.includes("opening turn: yes"));
  assert.ok(messages[0].content.includes("steer toward: huelga"));
  assert.ok(system.includes("<session>") && system.trimEnd().endsWith("</session>"));
  assert.ok(system.includes(`level: ${ctx.level}`));
  assert.ok(system.includes("articles read today: Transit strike enters third day"));
  assert.ok(
    system.includes(
      'huelga (strike) [seen in: "The transit strike entered its third day on Friday."]',
    ),
  );
  assert.ok(system.includes("casa (house)"));
  assert.ok(system.includes("agreement: la problema → el problema"));
  assert.ok(!system.includes("{level}"));
}

// ---------- per-level English: beginner sandwich + frames, upper_intermediate Spanish only ----------
{
  const sys = (level: typeof ctx.level) =>
    buildTutorPrompt({ context: { ...ctx, level }, history: [], rawText: null, directive: none }).system;
  const beginner = sys("beginner");
  assert.ok(beginner.includes("then repeat the Spanish"));
  assert.ok(beginner.includes("The frame must never contain a word from the learner's word list"));
  assert.ok(!beginner.includes("Only Spanish"));
  const upper = sys("upper_intermediate");
  assert.ok(upper.includes("Only Spanish") && !upper.includes("then repeat the Spanish"));
  assert.ok(sys("intermediate").includes("one short English hint"));
  assert.ok(CORRECTOR_SYSTEM("beginner").includes("English-only transcript gets an empty"));
}

// ---------- tutor: normal turn, history starts with the tutor's opener ----------
{
  const history = [
    { role: "tutor" as const, text: "Hola, vi que leíste sobre el transporte. ¿Qué piensas?" },
    { role: "learner" as const, text: "es muy malo" },
    { role: "tutor" as const, text: "Sí, es difícil. ¿Por qué no hay buses?" },
  ];
  const { messages } = buildTutorPrompt({
    context: ctx,
    history,
    rawText: rawTextFixture,
    directive: none,
  });
  assertAlternates(messages);
  assert.equal(messages.length, 5);
  assert.equal(messages[1].content, history[0].text);
  assert.equal(messages[2].content, "es muy malo");
  const last = messages[messages.length - 1].content;
  assert.ok(last.includes(`<learner_said>${rawTextFixture}</learner_said>`));
  assert.ok(
    last.includes(
      "<directive>opening turn: no; explain out loud: none; steer toward: none</directive>",
    ),
  );

  const explicit = buildTutorPrompt({
    context: ctx,
    history,
    rawText: rawTextFixture,
    directive: {
      correction: {
        span: "la problema",
        correction: "el problema",
        reason: "problema is masculine",
      },
      steerLemma: "casa",
      isOpener: false,
    },
  });
  assertAlternates(explicit.messages);
  assert.ok(
    explicit.messages[explicit.messages.length - 1].content.includes(
      '<directive>opening turn: no; explain out loud: "la problema" should be "el problema" (problema is masculine); steer toward: casa</directive>',
    ),
  );

  // Caller already appended the current utterance to history: it is sent once, roles still alternate.
  const dup = buildTutorPrompt({
    context: ctx,
    history: [...history, { role: "learner" as const, text: rawTextFixture }],
    rawText: rawTextFixture,
    directive: none,
  });
  assertAlternates(dup.messages);
  assert.equal(dup.messages.length, 5);
  assert.equal(dup.messages[4].content.split(rawTextFixture).length - 1, 1);

  // Empty history on a normal turn.
  const bare = buildTutorPrompt({
    context: ctx,
    history: [],
    rawText: rawTextFixture,
    directive: none,
  });
  assertAlternates(bare.messages);
  assert.equal(bare.messages.length, 1);
}

assert.ok(RECAP_SYSTEM.includes("summary_en") && RECAP_SYSTEM.includes("tips"));

// ---------- onboarding level check (D-020) ----------
{
  // The line for each step: question 1 with a greeting, then 2, then 3, then the closing.
  assert.ok(placementLine(0).startsWith("¡Hola! Soy Luci. ¿Cómo te llamas"));
  assert.ok(placementLine(1).startsWith(PLACEMENT_QUESTIONS[1].es) && placementLine(1).endsWith(PLACEMENT_QUESTIONS[1].en));
  assert.ok(placementLine(2).includes("¿adónde irías y por qué?"));
  assert.ok(placementLine(3).includes("Your result is on the screen") && placementLine(3) === placementLine(9));

  // Answers are counted once, whether or not the caller already put the current one in history.
  const h = [
    { role: "tutor" as const, text: placementLine(0) },
    { role: "learner" as const, text: "Me llamo Ana" },
  ];
  assert.equal(placementAnswered([], null), 0);
  assert.equal(placementAnswered(h, "Me llamo Ana"), 1);
  assert.equal(placementAnswered(h.slice(0, 1), "Me llamo Ana"), 1);
  assert.equal(placementAnswered(h, "Fui al cine"), 2);

  // Placement turns use their own system prompt: no session block, no directive, the line in <step>.
  const { system, messages } = buildTutorPrompt({
    context: { ...ctx, targetWords: [] },
    history: h,
    rawText: "Me llamo Ana",
    directive: none,
    placementLine: placementLine(1),
  });
  assertAlternates(messages);
  assert.ok(system.includes("level check") && !system.includes("<session>"));
  const last = messages[messages.length - 1].content;
  assert.ok(last.includes("<learner_said>Me llamo Ana</learner_said>"));
  assert.ok(last.includes(`<step>${placementLine(1)}</step>`) && !last.includes("<directive>"));

  // The assessment sees each question with its answer (blank when missing) and the validated errors.
  const user = buildPlacementAssessPrompt(
    [...h, { role: "learner", text: "yo comprar comida" }],
    [
      {
        span: "yo comprar",
        type: "conjugation",
        correction: "compré",
        explanation_en: "Past tense.",
        severity: 2,
        confidence: 0.9,
        lemma: "comprar",
      },
    ],
  );
  assert.ok(user.includes("<answer1>Me llamo Ana</answer1>") && user.includes("<answer2>yo comprar comida</answer2>"));
  assert.ok(user.includes("<answer3></answer3>"));
  assert.ok(user.includes('<errors_found>"yo comprar" should be "compré" (conjugation)</errors_found>'));
  assert.ok(buildPlacementAssessPrompt([], []).includes("<errors_found>none</errors_found>"));
  assert.ok(PLACEMENT_ASSESS_SYSTEM.includes("choose the lower one"));
}

console.log("ok");
