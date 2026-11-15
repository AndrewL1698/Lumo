// Reading sites Lumo suggests (D-021). Plain data, no zod, so the extension can import it cheaply.
// `origin` is scheme + host exactly as the site lands (same format as Settings.allowlist and the
// extension's enabledOrigins). `starter`: shown checked in onboarding. The rest only drive the
// extension's "Lumo reads well here" icon dot. None may be on the never-list.

export type ReadingSiteGroup =
  "News" | "Reference" | "Sports, tech and culture" | "Food and travel";

export type ReadingSite = {
  origin: string;
  name: string;
  group: ReadingSiteGroup;
  starter: boolean;
};

export const READING_SITE_GROUPS: readonly ReadingSiteGroup[] = [
  "News",
  "Reference",
  "Sports, tech and culture",
  "Food and travel",
];

const site = (
  origin: string,
  name: string,
  group: ReadingSiteGroup,
  starter = false,
): ReadingSite => ({
  origin,
  name,
  group,
  starter,
});

export const READING_SITES: readonly ReadingSite[] = [
  // Starter list (16): onboarding shows these, all checked. NPR first: it is the demo site.
  site("https://www.npr.org", "NPR", "News", true),
  site("https://www.bbc.com", "BBC", "News", true),
  site("https://apnews.com", "AP News", "News", true),
  site("https://www.theguardian.com", "The Guardian", "News", true),
  site("https://www.reuters.com", "Reuters", "News", true),
  site("https://www.cnn.com", "CNN", "News", true),
  site("https://en.wikipedia.org", "Wikipedia", "Reference", true),
  site("https://www.nationalgeographic.com", "National Geographic", "Reference", true),
  site("https://www.smithsonianmag.com", "Smithsonian", "Reference", true),
  site("https://www.espn.com", "ESPN", "Sports, tech and culture", true),
  site("https://www.theverge.com", "The Verge", "Sports, tech and culture", true),
  site("https://www.wired.com", "WIRED", "Sports, tech and culture", true),
  site("https://medium.com", "Medium", "Sports, tech and culture", true),
  site("https://www.allrecipes.com", "Allrecipes", "Food and travel", true),
  site("https://www.seriouseats.com", "Serious Eats", "Food and travel", true),
  site("https://www.lonelyplanet.com", "Lonely Planet", "Food and travel", true),

  // More good reading sites: not in onboarding, only for the extension's icon dot.
  site("https://www.nytimes.com", "The New York Times", "News"),
  site("https://www.washingtonpost.com", "The Washington Post", "News"),
  site("https://www.theatlantic.com", "The Atlantic", "News"),
  site("https://www.vox.com", "Vox", "News"),
  site("https://www.newyorker.com", "The New Yorker", "News"),
  site("https://www.economist.com", "The Economist", "News"),
  site("https://www.usatoday.com", "USA Today", "News"),
  site("https://www.nbcnews.com", "NBC News", "News"),
  site("https://www.cbsnews.com", "CBS News", "News"),
  site("https://www.aljazeera.com", "Al Jazeera", "News"),
  site("https://www.britannica.com", "Britannica", "Reference"),
  site("https://www.history.com", "History", "Reference"),
  site("https://www.scientificamerican.com", "Scientific American", "Reference"),
  site("https://www.nasa.gov", "NASA", "Reference"),
  site("https://www.pbs.org", "PBS", "Reference"),
  site("https://arstechnica.com", "Ars Technica", "Sports, tech and culture"),
  site("https://techcrunch.com", "TechCrunch", "Sports, tech and culture"),
  site("https://www.theringer.com", "The Ringer", "Sports, tech and culture"),
  site("https://www.rollingstone.com", "Rolling Stone", "Sports, tech and culture"),
  site("https://www.bonappetit.com", "Bon Appétit", "Food and travel"),
  site("https://www.foodnetwork.com", "Food Network", "Food and travel"),
  site("https://www.eater.com", "Eater", "Food and travel"),
  site("https://www.cntraveler.com", "Condé Nast Traveler", "Food and travel"),
  site("https://www.travelandleisure.com", "Travel + Leisure", "Food and travel"),
];
