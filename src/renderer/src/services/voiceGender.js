// Heuristic voice metadata inference for TTS providers that don't expose
// gender/accent on their /v1/audio/voices payload (most of them). Three
// passes, most-specific first:
//
//   1. Provider-known canon — well-known voices (OpenAI's Alloy/Echo/…)
//      get their published gender/accent baked in.
//   2. Kokoro convention — voice ids follow <region><gender>_<name>
//      (af_alloy = American Female, bm_george = British Male). Region
//      char also yields accent for free.
//   3. First-name dictionary — common English names map to gender. Catches
//      Chatterbox-style file-named voices ("sarah.wav") and similar.
//
// Anything unmatched stays empty; the voice library's gender chip is
// click-to-cycle so the writer can override.

// ── 1. Provider canon ────────────────────────────────────────────────
const OPENAI_VOICES = {
  alloy:   { gender: "neutral", accent: "American", tone: "balanced" },
  ash:     { gender: "male",    accent: "American" },
  ballad:  { gender: "male",    accent: "British" },
  coral:   { gender: "female",  accent: "American" },
  echo:    { gender: "male",    accent: "American", tone: "measured" },
  fable:   { gender: "neutral", accent: "British",  tone: "warm, narrative" },
  nova:    { gender: "female",  accent: "American", tone: "expressive" },
  onyx:    { gender: "male",    accent: "American", tone: "rich, deep" },
  sage:    { gender: "female",  accent: "American" },
  shimmer: { gender: "female",  accent: "American", tone: "soft" },
  verse:   { gender: "male",    accent: "American" },
};

// ── 2. Kokoro pattern ────────────────────────────────────────────────
const KOKORO_PATTERN = /^([a-z])([fm])_/i;
const KOKORO_REGION = {
  a: "American",
  b: "British",
  e: "Spanish",
  f: "French",
  h: "Hindi",
  i: "Italian",
  j: "Japanese",
  p: "Brazilian",
  z: "Mandarin",
};

// ── 3. First-name dictionary (English) ───────────────────────────────
// Intentionally excludes high-ambiguity names (Alex, Sam, Jamie, Riley,
// Taylor, Jordan, Casey, Cameron, Avery, Quinn, Morgan, Charlie, …) so
// they fall through to neutral rather than being wrong.
const FEMALE_NAMES = new Set([
  "abigail","ada","adelaide","adeline","agatha","aileen","alice","alicia","amanda","amelia",
  "amy","ana","anastasia","andrea","angela","angelina","ann","anna","anne","annette",
  "annie","ariana","ariel","ashley","audrey","aurora","ava","beatrice","becky","belinda",
  "bella","betty","beth","betsy","beverly","bonnie","brenda","brittany","brooke","camila",
  "candace","carla","carmen","carol","caroline","carolyn","cassandra","catherine","cecilia","celeste",
  "charlene","charlotte","cheryl","chloe","christine","christina","cindy","claire","clara","clarissa",
  "colleen","constance","cora","corinne","courtney","crystal","cynthia","daisy","danielle","daphne",
  "darlene","dawn","deborah","debra","delilah","denise","diana","diane","dolores","donna",
  "dorothy","edith","eileen","elaine","eleanor","elena","eliza","elizabeth","ella","ellen",
  "ellie","elsa","elsie","emily","emma","erica","erin","esme","esmeralda","esther",
  "ethel","eva","evelyn","faith","fiona","florence","frances","francesca","gabriella","gemma",
  "georgia","gertrude","gianna","gina","gladys","gloria","grace","gwendolyn","hannah","harper","hazel",
  "heather","heidi","helen","helena","henrietta","holly","ingrid","irene","iris","isabel",
  "isabella","ivy","jacqueline","jade","jamie","jane","janet","janice","jasmine","jennifer","jessica",
  "jill","joan","joanna","joanne","joy","joyce","judith","judy","julia","julie",
  "june","karen","kate","katherine","kathleen","kathy","katie","kayla","kelly","kim",
  "kimberly","kira","kirsten","kristen","kristina","laura","laurel","lauren","layla","leah",
  "leila","leslie","lila","lillian","lily","linda","lisa","lori","louise","lucy",
  "luna","lydia","mabel","madeline","madison","maggie","margaret","maria","mariah","marie",
  "marilyn","marion","marjorie","martha","mary","matilda","maya","megan","melanie","melissa",
  "mia","michelle","mildred","millie","miranda","molly","monica","nadia","nancy","naomi",
  "natalie","natasha","nicole","nina","nora","norma","nova","octavia","olive","olivia",
  "ophelia","paige","pamela","patricia","paula","pauline","pearl","penelope","phoebe","phyllis",
  "polly","priscilla","rachel","rebecca","regina","rita","roberta","robin","rosalind","rose",
  "rosemary","rosie","ruby","ruth","sabrina","sally","samantha","sandra","sandy","sarah",
  "scarlett","selena","sharon","sheila","shelley","shirley","sienna","silvia","sofia","sonia",
  "sophia","sophie","stacy","stella","stephanie","susan","sylvia","tamara","tara","teresa",
  "theresa","tiffany","tina","tracy","trinity","ursula","valerie","vanessa","vera","veronica",
  "vicki","victoria","violet","virginia","vivian","wanda","wendy","whitney","willa","willow",
  "yvette","yvonne","zelda","zoe","zoey",
]);

const MALE_NAMES = new Set([
  "aaron","abraham","adam","adrian","aidan","alan","albert","alec","alexander","alfred",
  "alvin","ambrose","andre","andrew","andy","angelo","anthony","antonio","archie","arnold",
  "arthur","austin","axel","barry","ben","benjamin","bennett","bernard","bert","bill","billy",
  "bob","brad","bradley","brandon","brendan","brent","brett","brian","bruce","bryan",
  "byron","caleb","calvin","carl","carlos","cedric","cesar","charles","charlie","chester",
  "chris","christian","christopher","clarence","clark","claude","clifford","clyde","cody","colin",
  "conor","connor","craig","curtis","cyrus","dale","dan","daniel","darrell","dave",
  "david","dean","dennis","derek","desmond","dexter","dominic","don","donald","douglas",
  "drake","duncan","dwayne","dwight","dylan","earl","eddie","edgar","edmund","edward",
  "edwin","eli","elias","elijah","elliot","ellis","elmer","emanuel","emil","eric",
  "ernest","ethan","eugene","evan","everett","ezekiel","ezra","felix","ferdinand","floyd",
  "francis","francisco","frank","franklin","fred","frederick","gabriel","gary","gavin","gene",
  "geoffrey","george","gerald","gilbert","glen","gordon","graham","grant","greg","gregory",
  "harold","harvey","henry","herbert","herman","horace","howard","hubert","hugh","hugo",
  "ian","ira","isaac","isaiah","jack","jackson","jacob","james","jared","jason",
  "jasper","jeff","jeffrey","jeremiah","jeremy","jerome","jerry","jesse","jim","joe",
  "joel","john","jonas","jonathan","joseph","joshua","julian","julius","justin","keith",
  "kenneth","kevin","kirk","kyle","lance","larry","laurence","lawrence","lee","leo",
  "leon","leonard","leonardo","leroy","levi","lewis","liam","lincoln","logan","louis","lucas",
  "luke","malcolm","marcus","mark","martin","marvin","mason","matthew","maurice","max",
  "maxwell","melvin","michael","mike","miles","milton","mitchell","monroe","montague","nathan","nathaniel",
  "neal","neil","nicholas","noah","noel","norman","oliver","oscar","oswald","owen",
  "patrick","paul","percy","perry","peter","philip","preston","quentin","ralph","randall",
  "randy","raphael","ray","raymond","reginald","rex","richard","rick","robert","roderick",
  "rodney","rod","roger","roland","ronald","ross","roy","rufus","russell","ryan",
  "samuel","saul","scott","sean","sebastian","seth","seymour","shane","sidney","silas",
  "simon","solomon","spencer","stanley","stephen","steve","steven","stuart","sylvester","ted",
  "terence","terry","theo","theodore","thomas","tim","timothy","tobias","todd","tom",
  "tony","travis","trevor","troy","tyler","ulysses","valentino","vance","vernon","victor",
  "vincent","virgil","walter","warren","wayne","wesley","wilbur","william","willie","winston",
  "xavier","zach","zachary",
]);

// ── Utility ──────────────────────────────────────────────────────────
function stripExt(name) {
  return name.replace(/\.[a-z0-9]{1,5}$/i, "");
}

export function firstNameKey(raw) {
  if (!raw) return "";
  const trimmed = stripExt(String(raw)).trim().toLowerCase();
  // First token before underscore/space/hyphen. Strips "michael_studio",
  // "sarah-uk", "Sarah (US)" → "michael" / "sarah" / "sarah".
  return trimmed.split(/[\s_\-()]/)[0];
}

// ── Public API ───────────────────────────────────────────────────────
/**
 * Returns `{ gender?, accent?, tone? }` populated only with fields that
 * could be inferred. Caller spreads the result over the voice — anything
 * the inferrer didn't touch stays untouched.
 *
 * @param {object|string} voice  full voice object from listVoices(), or just its id
 * @param {string} [providerId]  optional, used for provider-canon lookup
 */
export function inferVoiceMetadata(voice, providerId) {
  if (!voice) return {};
  const id = typeof voice === "string" ? voice : (voice.id || voice.name || "");
  const name = typeof voice === "string" ? voice : (voice.name || voice.id || "");
  if (!id && !name) return {};

  // 1. Provider canon — exact match on OpenAI's published voice ids.
  if (providerId === "openai") {
    const key = String(id).toLowerCase();
    if (OPENAI_VOICES[key]) return { ...OPENAI_VOICES[key] };
  }

  // 2. Kokoro pattern.
  const m = String(id).match(KOKORO_PATTERN);
  if (m) {
    const out = { gender: m[2].toLowerCase() === "f" ? "female" : "male" };
    const region = KOKORO_REGION[m[1].toLowerCase()];
    if (region) out.accent = region;
    return out;
  }

  // 3. First-name dictionary — try id first, then name as fallback.
  const idKey = firstNameKey(id);
  const nameKey = firstNameKey(name);
  if (FEMALE_NAMES.has(idKey) || FEMALE_NAMES.has(nameKey)) return { gender: "female" };
  if (MALE_NAMES.has(idKey) || MALE_NAMES.has(nameKey))     return { gender: "male" };

  return {};
}
