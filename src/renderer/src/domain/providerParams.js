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

  // devnen's /v1/audio/speech is a thin compatibility layer — only the
  // standard OpenAI fields plus speed/format are honored. Engine knobs
  // (exaggeration, cfg_weight, temperature) live in Chatterbox's own
  // config.yaml, editable from its web UI at the server's port.
  chatterbox: [
    SPEED,
    FORMAT,
  ],

};

export function getParamSchema(provider) {
  if (!provider) return [];
  return PROVIDER_PARAM_SCHEMAS[provider.id] || [];
}
