// The course (D-022): one track per level, units in order. Pure data, relative imports only (tsx from /scripts).
// Every lemma is in the word list (npm run check-curriculum -w scripts). Latin American Spanish, English explanations.
import type { Level, SpokenErrorType } from "@parrot/shared";

export type Unit = {
  id: string;
  level: Level;
  /** 0 = "First words" (beginner only, for people who have never learned Spanish); otherwise 1..4. */
  order: number;
  title: string;
  /** English can-do line. */
  canDo: string;
  concept: {
    name: string;
    /** Corrector error types that count against this concept (a session with one of these fails the checkpoint). */
    errorTypes: SpokenErrorType[];
    /** One plain-English rule plus one Spanish example. */
    teach: string;
  };
  /** 4–8 lemmas from the word list. */
  words: string[];
  /** Two Spanish questions that force the concept and the words. */
  prompts: string[];
};

export const UNITS: readonly Unit[] = [
  // ---------------------------------------------------------------- beginner
  {
    id: "beg-0",
    level: "beginner",
    order: 0,
    title: "First words",
    canDo: "Say your name, where you live, and one thing you like",
    concept: {
      name: "Ser and basic phrases",
      errorTypes: ["conjugation"],
      teach: "Use 'soy' for 'I am' when saying who you are: 'Soy Ana.' 'Me gusta' means 'I like'.",
    },
    words: ["ser", "nombre", "vivir", "hablar", "querer", "gustar"],
    prompts: ["¿Cómo te llamas y dónde vives?", "¿Qué te gusta hacer?"],
  },
  {
    id: "beg-1",
    level: "beginner",
    order: 1,
    title: "Things and people",
    canDo: "Name everyday things and people, and say who has what",
    concept: {
      name: "Gender: el and la",
      errorTypes: ["agreement"],
      teach: "Every noun is masculine (el) or feminine (la): 'el amigo', 'la casa', 'la mujer'. Words ending in -a are usually feminine.",
    },
    words: ["casa", "mesa", "amigo", "mujer", "hombre", "tener", "agua"],
    prompts: ["¿Qué hay en tu casa?", "¿Tienes muchos amigos?"],
  },
  {
    id: "beg-2",
    level: "beginner",
    order: 2,
    title: "Daily routine",
    canDo: "Describe what you do every day",
    concept: {
      name: "Present tense: -ar, -er, -ir",
      errorTypes: ["conjugation"],
      teach: "Change the ending to match who does it: 'yo como', 'tú comes', 'ella come'. -ar verbs: 'yo trabajo'.",
    },
    words: ["trabajar", "comer", "salir", "llegar", "día", "hoy", "mañana"],
    prompts: ["¿A qué hora llegas al trabajo?", "¿Qué comes por la mañana?"],
  },
  {
    id: "beg-3",
    level: "beginner",
    order: 3,
    title: "Around town",
    canDo: "Say where things are and what there is in a place",
    concept: {
      name: "Estar for places, and hay",
      errorTypes: ["word_choice", "conjugation"],
      teach: "Use 'estar' for where something is: 'La tienda está en la calle'. Use 'hay' for 'there is': 'Hay un mercado'.",
    },
    words: ["estar", "calle", "tienda", "comprar", "pagar", "dinero", "ir"],
    prompts: ["¿Dónde está tu tienda favorita?", "¿Qué hay en tu calle?"],
  },
  {
    id: "beg-4",
    level: "beginner",
    order: 4,
    title: "Plans and wants",
    canDo: "Say what you want and what you are going to do",
    concept: {
      name: "Ir a + infinitive",
      errorTypes: ["conjugation", "missing_word"],
      teach: "'Voy a' plus a verb means 'I am going to': 'Voy a comprar pan'. Do not forget the 'a'.",
    },
    words: ["querer", "necesitar", "viaje", "semana", "ayudar", "planear"],
    prompts: ["¿Qué vas a hacer esta semana?", "¿Adónde quieres viajar?"],
  },

  // ---------------------------------------------------------------- intermediate
  {
    id: "int-1",
    level: "intermediate",
    order: 1,
    title: "Talking about work",
    canDo: "Say where you work, what a company does, and name a problem",
    concept: {
      name: "Noun gender and agreement",
      errorTypes: ["agreement"],
      teach:
        "Match the article to the noun: 'el problema' is masculine even though it ends in -a (nouns ending in -ma are masculine). 'la empresa', 'el mercado'.",
    },
    words: ["empresa", "mercado", "negocio", "mundo", "problema", "trabajo", "jefe"],
    prompts: ["¿En qué empresa trabaja alguien que conoces?", "¿Cuál es el problema más grande en tu trabajo?"],
  },
  {
    id: "int-2",
    level: "intermediate",
    order: 2,
    title: "News and events",
    canDo: "Say what happened, using the past tense",
    concept: {
      name: "Preterite: finished past events",
      errorTypes: ["conjugation"],
      teach: "Use the preterite for finished events: 'ayer comí', 'ayer salí', 'el jefe llegó tarde'.",
    },
    words: ["noticia", "ayer", "pasar", "ocurrir", "país", "gente", "cambiar"],
    prompts: ["¿Qué noticia leíste ayer?", "¿Qué pasó en tu día de ayer?"],
  },
  {
    id: "int-3",
    level: "intermediate",
    order: 3,
    title: "Telling a story",
    canDo: "Tell a short story with background and events",
    concept: {
      name: "Preterite vs imperfect",
      errorTypes: ["conjugation", "word_choice"],
      teach: "Imperfect sets the scene ('hacía frío'); preterite says what happened ('entré'). 'Era de noche cuando llegó mi amigo.'",
    },
    words: ["vida", "tiempo", "acordarse", "quedarse", "vivir", "pedir", "duda"],
    prompts: ["¿Cómo era tu vida cuando eras niño?", "Cuéntame un día especial que recuerdas."],
  },
  {
    id: "int-4",
    level: "intermediate",
    order: 4,
    title: "Opinions",
    canDo: "Give an opinion and say what you doubt",
    concept: {
      name: "Subjunctive after 'no creo que'",
      errorTypes: ["conjugation", "word_choice"],
      teach: "After doubt, use the subjunctive: 'Creo que es bueno' but 'No creo que sea bueno'.",
    },
    words: ["creer", "pensar", "duda", "esperar", "quizás", "decir", "derecho"],
    prompts: ["¿Qué piensas de las noticias de hoy?", "¿Qué no crees que va a pasar?"],
  },

  // ---------------------------------------------------------------- upper intermediate ("Advanced")
  {
    id: "adv-1",
    level: "upper_intermediate",
    order: 1,
    title: "Debating issues",
    canDo: "Defend an opinion and react to someone else's",
    concept: {
      name: "Subjunctive after emotion and opinion",
      errorTypes: ["conjugation"],
      teach: "Use the subjunctive after wishes and feelings: 'Espero que el gobierno cambie', 'Me molesta que no haya tiempo'.",
    },
    words: ["esperar", "creer", "derecho", "duda", "lograr", "cambiar", "aprovechar"],
    prompts: ["¿Qué esperas que cambie en tu país?", "¿Qué te molesta de las noticias?"],
  },
  {
    id: "adv-2",
    level: "upper_intermediate",
    order: 2,
    title: "Hypotheticals",
    canDo: "Say what you would do if things were different",
    concept: {
      name: "Si + imperfect subjunctive, then conditional",
      errorTypes: ["conjugation", "word_order"],
      teach: "'Si tuviera dinero, viajaría mucho.' The 'si' part uses the imperfect subjunctive; the result uses the conditional.",
    },
    words: ["dinero", "viaje", "lograr", "quedarse", "ayudar", "vida", "quizás"],
    prompts: ["Si tuvieras mucho dinero, ¿qué harías?", "Si pudieras cambiar algo de tu vida, ¿qué sería?"],
  },
  {
    id: "adv-3",
    level: "upper_intermediate",
    order: 3,
    title: "Reporting what was said",
    canDo: "Tell someone what another person said",
    concept: {
      name: "Reported speech: tense steps back",
      errorTypes: ["conjugation", "word_choice"],
      teach: "When you report speech, the tense moves back: 'Dijo que venía' (he said he was coming), not 'dijo que viene'.",
    },
    words: ["decir", "pedir", "acordarse", "noticia", "gente", "duda"],
    prompts: ["¿Qué te dijo un amigo hoy?", "Cuéntame qué dijeron en las noticias."],
  },
  {
    id: "adv-4",
    level: "upper_intermediate",
    order: 4,
    title: "Nuance and connectors",
    canDo: "Link ideas smoothly and soften or strengthen a point",
    concept: {
      name: "Connectors with the right mood",
      errorTypes: ["word_choice", "word_order"],
      teach: "'Aunque' with a real fact uses the indicative ('aunque llueve, salgo'); with a possibility it uses the subjunctive ('aunque llueva').",
    },
    words: ["aprovechar", "lograr", "quizás", "cambiar", "derecho", "esperar", "mundo"],
    prompts: ["¿Qué harías aunque fuera difícil?", "¿Con qué opinión no estás del todo de acuerdo?"],
  },
] as const;

export const LEVEL_TITLE: Record<Level, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  upper_intermediate: "Advanced",
};

/** Units of a track, in order. */
export function trackOf(level: Level): Unit[] {
  return UNITS.filter((u) => u.level === level).sort((a, b) => a.order - b.order);
}
