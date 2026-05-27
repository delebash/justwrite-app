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

  "openedai-speech": [
    SPEED,
    FORMAT,
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

  vibevoice: [
    SPEED,
    FORMAT,
    {
      key: "cfg_scale", label: "CFG scale", type: "number",
      default: 1.3, min: 1.0, max: 5.0, step: 0.1,
      help: "Classifier-free guidance. Higher = more faithful to the voice prompt.",
    },
    {
      key: "inference_steps", label: "Inference steps", type: "number",
      default: 10, min: 1, max: 50, step: 1,
      help: "More steps = higher fidelity, slower render.",
    },
    {
      key: "seed", label: "Seed", type: "number",
      min: 0, max: 2147483647, step: 1,
      placeholder: "blank = random",
      help: "Lock for reproducible output; leave blank for variety.",
    },
  ],

  "chatterbox-turbo": [
    SPEED,
    FORMAT,
    {
      key: "exaggeration", label: "Exaggeration", type: "number",
      default: 0.5, min: 0.0, max: 1.0, step: 0.05,
      help: "Emotion intensity. 0 = flat narration, 1 = theatrical.",
    },
    {
      key: "cfg_weight", label: "CFG weight", type: "number",
      default: 0.5, min: 0.0, max: 1.0, step: 0.05,
      help: "Pacing / prompt-adherence balance. Lower for slower delivery.",
    },
    {
      key: "temperature", label: "Temperature", type: "number",
      default: 0.8, min: 0.05, max: 5.0, step: 0.05,
      help: "Sampling randomness.",
    },
    {
      key: "audio_prompt_path", label: "Reference audio path", type: "text",
      placeholder: "Optional — local path to a 6–10s WAV for cloning.",
      help: "If set, Chatterbox clones the voice from this clip instead of using the named voice.",
    },
    {
      key: "seed", label: "Seed", type: "number",
      min: 0, max: 2147483647, step: 1,
      placeholder: "blank = random",
      help: "Lock to reproduce a generation.",
    },
  ],

  "xtts-v2": [
    SPEED,
    FORMAT,
    {
      key: "language", label: "Language", type: "select",
      default: "en",
      options: ["en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "hu", "ko", "hi"],
      help: "XTTS-v2 needs the source language of the text. Pick the language you're writing in.",
    },
    {
      key: "speaker_wav", label: "Reference audio path", type: "text",
      placeholder: "Optional — local path to a 6–30s WAV for cloning.",
      help: "Overrides the named speaker preset with a cloned voice.",
    },
    {
      key: "temperature", label: "Temperature", type: "number",
      default: 0.65, min: 0.01, max: 2.0, step: 0.01,
    },
    {
      key: "length_penalty", label: "Length penalty", type: "number",
      default: 1.0, min: 0.1, max: 10.0, step: 0.1,
    },
    {
      key: "repetition_penalty", label: "Repetition penalty", type: "number",
      default: 2.0, min: 1.0, max: 20.0, step: 0.1,
    },
    {
      key: "top_k", label: "Top-K", type: "number",
      default: 50, min: 0, max: 1000, step: 1,
    },
    {
      key: "top_p", label: "Top-P", type: "number",
      default: 0.85, min: 0.0, max: 1.0, step: 0.05,
    },
  ],
};

export function getParamSchema(provider) {
  if (!provider) return [];
  return PROVIDER_PARAM_SCHEMAS[provider.id] || [];
}
