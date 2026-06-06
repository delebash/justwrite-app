// Per-provider TTS parameter schemas.
//
// Each schema is a list of field descriptors that drive two things:
//   1. The Settings → Providers edit form renders one input per descriptor.
//   2. The OpenAICompatClient.speech() body merges `provider.params` into
//      the request payload, so engine-specific knobs (cfg_scale, language,
//      exaggeration, etc.) reach the underlying server.
//
// `provider.params` is intentionally sparse — only keys the user has
// explicitly set. Anything absent means "use the engine's own default".

const SPEED = {
  key: "speed", label: "Speed", type: "number",
  default: 1.0, min: 0.25, max: 4.0, step: 0.05,
  help: "Playback rate multiplier sent on /v1/audio/speech.",
};

const FORMAT = {
  key: "response_format", label: "Audio format", type: "select",
  default: "mp3",
  options: ["mp3", "wav", "opus", "flac", "aac", "pcm"],
  help: "Container/encoding requested from the server.",
};

export const PROVIDER_PARAM_SCHEMAS = {
  openai: [
    SPEED,
    FORMAT,
    {
      key: "instructions", label: "Voice direction", type: "textarea",
      placeholder: "e.g. Speak in a calm narrator voice.",
      help: "Only honored by gpt-4o-mini-tts. Ignored by tts-1 / tts-1-hd.",
    },
  ],

  kokoro: [
    SPEED,
    FORMAT,
    {
      key: "lang_code", label: "Language", type: "select",
      default: "",
      options: ["", "a", "b", "e", "f", "h", "i", "j", "p", "z"],
      optionLabels: {
        "": "Auto (by voice prefix)",
        a: "American English", b: "British English", e: "Spanish",
        f: "French",           h: "Hindi",           i: "Italian",
        j: "Japanese",         p: "Brazilian Portuguese", z: "Mandarin Chinese",
      },
      help: "Override Kokoro's auto-detected language code. Leave blank to let the voice prefix decide.",
    },
    {
      key: "normalization_options", label: "Normalize numbers/URLs", type: "boolean",
      default: true,
      help: "Lets Kokoro-FastAPI rewrite numbers, emails, and URLs into readable speech.",
    },
  ],

  // Chatterbox synth is routed through the server's richer custom /tts
  // route (see openai-compat.js → _chatterboxSpeech), not the OpenAI-compat
  // /v1/audio/speech which silently drops the engine knobs. Keys here
  // match /tts body fields 1:1.
  //
  // The model itself (chatterbox / chatterbox-turbo / chatterbox-multilingual)
  // is server state, not a per-call param — it's swapped via
  // SettingsProviderForm's Chatterbox section calling
  // client.chatterboxSetModel(repoId).
  chatterbox: [
    {
      key: "output_format", label: "Audio format", type: "select",
      default: "wav",
      options: ["wav", "opus", "mp3"],
      help: "Encoding requested from the /tts route.",
    },
    {
      key: "speed_factor", label: "Speed", type: "number",
      default: 1.0, min: 0.25, max: 4.0, step: 0.05,
      help: "Playback rate multiplier. Chatterbox's /tts field name.",
    },
    {
      key: "temperature", label: "Temperature", type: "number",
      default: 0.8, min: 0.0, max: 2.0, step: 0.05,
      help: "Sampling randomness. Higher = more varied prosody, lower = more deterministic.",
    },
    {
      key: "exaggeration", label: "Exaggeration", type: "number",
      default: 1.3, min: 0.0, max: 2.0, step: 0.05,
      help: "Emotion intensity. 0.5 is flat-ish, 1.3 is the trained sweet spot, 2.0 is theatrical. Only meaningful on the base + multilingual models.",
    },
    {
      key: "cfg_weight", label: "CFG weight", type: "number",
      default: 0.5, min: 0.0, max: 1.0, step: 0.05,
      help: "Classifier-free guidance strength. Higher = closer to reference voice but can flatten emotion. Only meaningful on the base + multilingual models.",
    },
    {
      key: "chunk_size", label: "Chunk size", type: "number",
      default: 120, min: 50, max: 500, step: 10,
      help: "Approximate character length per synthesis chunk when long text is auto-split.",
    },
    {
      key: "language", label: "Language", type: "input",
      placeholder: "en",
      help: "ISO code (en, es, fr, de, …). Only honored by chatterbox-multilingual; ignored by base / turbo.",
    },
  ],

};

export function getParamSchema(provider) {
  if (!provider) return [];
  return PROVIDER_PARAM_SCHEMAS[provider.id] || [];
}
