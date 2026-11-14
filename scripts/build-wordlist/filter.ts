// Step 2: drop function words, numerals, junk tokens. Haiku drops anything else as pos "other".
import type { FormRow } from "./lib.ts";

// Articles, prepositions, pronouns, conjunctions, determiners, very common auxiliaries/fillers.
const STOP = new Set(
  `el la los las lo un una unos unas al del
  a ante bajo con contra de desde durante en entre hacia hasta mediante para por según sin sobre tras
  y e ni o u pero sino que porque pues aunque si como cuando donde mientras ya
  yo tú tu vos usted ustedes él ella ello ellos ellas nosotros nosotras vosotros vosotras
  me te se nos os le les mi mis tus su sus nuestro nuestra nuestros nuestras vuestro vuestra
  mío mía míos mías tuyo tuya tuyos tuyas suyo suya suyos suyas conmigo contigo consigo
  este esta estos estas ese esa esos esas aquel aquella aquellos aquellas esto eso aquello
  qué quién quiénes cuál cuáles cuánto cuánta cuántos cuántas cómo dónde cuándo adónde
  quien quienes cual cuales cuyo cuya cuyos cuyas
  algo alguien alguno alguna algunos algunas algún nada nadie ninguno ninguna ningún
  todo toda todos todas otro otra otros otras mismo misma mismos mismas tal tales cada
  he has ha hemos han había habían hay haber habrá habría hubo
  no sí oh ah eh ay hey vale ok okay bueno hola adiós gracias señor señora`.split(/\s+/),
);

const LETTERS = /^[a-záéíóúüñ]+$/;

export function filterForms(forms: FormRow[]): FormRow[] {
  const kept = forms.filter((f) => f.form.length >= 2 && LETTERS.test(f.form) && !STOP.has(f.form));
  console.log(`filter: ${forms.length} → ${kept.length} forms`);
  return kept;
}
