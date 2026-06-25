"""ORM model definitions for the JustWrite SQLite database.

P2 normalizes the book domain into real per-entity tables (see
docs/plans/2026-06-18-jw-p2-normalization-design.md), mirroring JustVoice's
schema conventions: `position` ints for ordered collections, join tables for
many-to-many, and JSON-TEXT columns ONLY for genuinely freeform 1:1
sub-payloads — never a whole entity as a blob.

Key decisions:
- **Composite PK `(project_id, id)`** on every per-project table. The
  renderer's ids (`c1`, `ch4`, `scn_…`) must round-trip unchanged, and the
  seed demo reuses fixed ids that could collide across projects — so an id is
  unique *within* a project, not globally.
- **`project_id` FK → projects(id) ON DELETE CASCADE** is the one DB-level
  constraint; it gives the project-delete cascade. Cross-entity integrity
  (clearing a chapter's strand refs when a strand is deleted, re-anchoring
  notes when a scene is removed, …) stays in the app layer — exactly where
  the renderer already enforces it — to avoid composite-FK complexity.

Every datum has its own typed table now — the old `KvEntry` localStorage seam is
gone (the storage rewrite, docs/plans/2026-06-18-unified-storage-no-idb.md;
migrations drop the orphan `kv` table). `Project.data` is the legacy P2-shallow
snapshot blob, kept only so the one-time blob→tables migration (P2.2) can read
it; new writes go to the normalized tables.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def _fk_project() -> Column:
    """`project_id` column: part of the composite PK AND the FK that cascades
    a project delete down to every child row."""
    return Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
    )


# ── App-level settings ──────────────────────────────────────────────────


class Setting(Base):
    """One top-level section of the renderer's settings document — `key` is the
    section name (ui | ai | hardwarePresets | activeProjectId | …), `value` is
    its JSON. GET /v1/settings assembles every row into one document; PATCH
    upserts the sections it's given (each section has a single renderer-side
    owner that writes it wholesale). Replaces the `justwrite:ui` / `justwrite:ai`
    / `justwrite:hardwarePresets` kv blobs — values are real JSON the server
    parses, not the opaque strings kv held."""

    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False, default="null")  # JSON value


# ── Project root ────────────────────────────────────────────────────────


class Project(Base):
    """A JustWrite book. Root metadata lives in typed columns; the book's
    entities live in the per-project tables below (FK'd to this row)."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False, default="Untitled")
    author = Column(String, nullable=False, default="")
    subtitle = Column(String, nullable=False, default="")
    genre = Column(String, nullable=False, default="")
    words_goal = Column(Integer, nullable=False, default=0)
    daily_target = Column(Integer, nullable=False, default=0)
    words_written = Column(Integer, nullable=False, default=0)
    started_on = Column(String, nullable=False, default="")
    deadline = Column(String, nullable=False, default="")
    premise = Column(Text, nullable=False, default="")
    world_rules = Column(Text, nullable=False, default="")
    cover_image = Column(Text, nullable=True)  # JSON imageStore record
    updated_at = Column(String, nullable=False, default="")
    # Legacy P2-shallow snapshot blob — read by the one-time migration (P2.2)
    # only; normalized writes go to the tables below.
    data = Column(Text, nullable=False, default="{}")


# ── Structure: parts → chapters → scenes ────────────────────────────────


class Part(Base):
    __tablename__ = "parts"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False, default="")


class Chapter(Base):
    __tablename__ = "chapters"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    part_id = Column(String, nullable=False, default="")  # app-managed ref → parts.id
    position = Column(Integer, nullable=False, default=0)
    num = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False, default="")
    words = Column(Integer, nullable=False, default=0)
    status = Column(String, nullable=False, default="todo")
    is_voice_canon = Column(Boolean, nullable=False, default=False)
    critique = Column(Text, nullable=True)          # JSON AI artifact
    reader_knowledge = Column(Text, nullable=True)  # JSON AI artifact
    multi_reader = Column(Text, nullable=True)      # JSON AI artifact


class Scene(Base):
    __tablename__ = "scenes"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    chapter_id = Column(String, nullable=False, default="")  # app-managed ref → chapters.id
    position = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False, default="")
    body = Column(Text, nullable=False, default="")  # HTML prose


# ── Relationships (join tables) ─────────────────────────────────────────


class SceneLink(Base):
    """Polymorphic scene → entity link (which characters/locations/objects/
    strands a scene features). The reverse query ("scenes featuring X") is what
    Relations + speakersByChapter need."""

    __tablename__ = "scene_links"

    project_id = _fk_project()
    scene_id = Column(String, primary_key=True)
    kind = Column(String, primary_key=True)  # character|location|object|strand
    ref_id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)


class ChapterStrand(Base):
    """Which narrative strands a chapter carries (M2M)."""

    __tablename__ = "chapter_strands"

    project_id = _fk_project()
    chapter_id = Column(String, primary_key=True)
    strand_id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)


class GroupMember(Base):
    """Polymorphic group membership (characters/locations/objects)."""

    __tablename__ = "group_members"

    project_id = _fk_project()
    group_id = Column(String, primary_key=True)
    kind = Column(String, primary_key=True)  # character|location|object|strand
    ref_id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)


# ── Entities ────────────────────────────────────────────────────────────


class Character(Base):
    __tablename__ = "characters"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String, nullable=False, default="")
    main = Column(Boolean, nullable=False, default=False)
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=False, default="")
    pronouns = Column(String, nullable=False, default="")
    life_status = Column(String, nullable=False, default="")
    one_liner = Column(Text, nullable=False, default="")
    role = Column(String, nullable=False, default="")
    aliases = Column(Text, nullable=False, default="[]")  # JSON string[]
    tags = Column(Text, nullable=False, default="[]")     # JSON string[]
    extras = Column(Text, nullable=True)                  # JSON freeform 1:1 (voice/arc/…)
    audit = Column(Text, nullable=True)                   # JSON AI artifact


class Location(Base):
    __tablename__ = "locations"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String, nullable=False, default="")
    kind = Column(String, nullable=False, default="")
    note = Column(Text, nullable=False, default="")
    tags = Column(Text, nullable=False, default="[]")  # JSON string[]


class StoryObject(Base):
    __tablename__ = "objects"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String, nullable=False, default="")
    kind = Column(String, nullable=False, default="")
    note = Column(Text, nullable=False, default="")
    tags = Column(Text, nullable=False, default="[]")  # JSON string[]


class Group(Base):
    __tablename__ = "groups"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String, nullable=False, default="")
    blurb = Column(Text, nullable=False, default="")
    color = Column(String, nullable=False, default="")


class Note(Base):
    __tablename__ = "notes"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False, default="")
    body = Column(Text, nullable=False, default="")
    tag = Column(String, nullable=False, default="note")
    updated = Column(String, nullable=False, default="")  # display string ("May 22")
    # Anchor: null (story-wide) | chapter | chapter+scene. App-managed refs.
    anchor_chapter_id = Column(String, nullable=True)
    anchor_scene_id = Column(String, nullable=True)


class Strand(Base):
    __tablename__ = "strands"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    name = Column(String, nullable=False, default="")
    color = Column(String, nullable=False, default="")
    blurb = Column(Text, nullable=False, default="")
    body = Column(Text, nullable=False, default="")
    status = Column(String, nullable=False, default="open")


class StrandBeat(Base):
    """A turning point on a strand, pinned to a scene within a chapter."""

    __tablename__ = "strand_beats"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    strand_id = Column(String, nullable=False, default="")  # app-managed ref → strands.id
    position = Column(Integer, nullable=False, default=0)
    chapter_id = Column(String, nullable=True)
    scene_id = Column(String, nullable=True)
    label = Column(String, nullable=False, default="")
    note = Column(Text, nullable=False, default="")


class Worldbuilding(Base):
    __tablename__ = "worldbuilding"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    category_id = Column(String, nullable=False, default="")  # app-managed ref → worldbuilding_categories.id
    title = Column(String, nullable=False, default="")
    status = Column(String, nullable=False, default="")
    words = Column(Integer, nullable=False, default=0)
    summary = Column(Text, nullable=False, default="")
    body = Column(Text, nullable=False, default="")
    tags = Column(Text, nullable=False, default="[]")     # JSON string[]
    related = Column(Text, nullable=False, default="[]")  # JSON id[] ("see also")


class WorldbuildingCategory(Base):
    __tablename__ = "worldbuilding_categories"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    label = Column(String, nullable=False, default="")
    icon = Column(String, nullable=False, default="")
    hue = Column(Integer, nullable=False, default=0)


class Status(Base):
    __tablename__ = "statuses"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    position = Column(Integer, nullable=False, default=0)
    label = Column(String, nullable=False, default="")
    color = Column(String, nullable=False, default="")


class TagVocab(Base):
    """One curated tag suggestion, scoped to a kind (characters/locations/…)."""

    __tablename__ = "tag_vocab"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    kind = Column(String, nullable=False, default="")
    position = Column(Integer, nullable=False, default=0)
    label = Column(String, nullable=False, default="")


class Architecture(Base):
    """A structural doc (premise / fabula / setting). Fixed-ish small set."""

    __tablename__ = "architecture"

    project_id = _fk_project()
    id = Column(String, primary_key=True)  # "premise" | "fabula" | "setting" | …
    position = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False, default="")
    blurb = Column(Text, nullable=False, default="")
    status = Column(String, nullable=False, default="")
    words = Column(Integer, nullable=False, default=0)
    body = Column(Text, nullable=False, default="")


# ── Polymorphic attachments ─────────────────────────────────────────────


class Image(Base):
    """An image attached to any entity (character/location/object/group/
    setting/…). `data_json` is the imageStore record (path or data-url)."""

    __tablename__ = "images"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    entity_kind = Column(String, nullable=False, default="")
    entity_id = Column(String, nullable=False, default="")
    position = Column(Integer, nullable=False, default=0)
    added_at = Column(Integer, nullable=True)  # epoch ms
    data = Column(Text, nullable=False, default="{}")  # JSON imageStore record


class Event(Base):
    """A dated event on any entity's timeline (the per-entity event log)."""

    __tablename__ = "events"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    entity_kind = Column(String, nullable=False, default="")
    entity_id = Column(String, nullable=False, default="")
    position = Column(Integer, nullable=False, default=0)
    when = Column(String, nullable=False, default="")  # datetime-local string
    title = Column(String, nullable=False, default="")
    note = Column(Text, nullable=False, default="")


# ── AI artifacts (freeform, individually addressable) ───────────────────


class ProjectArtifact(Base):
    """Per-project AI-generated artifact. `kind` ∈ reverseOutline | plotHoles |
    marketingPack | beatSheet | dailyRecap | relationshipArc; `key` = '' for
    singletons, else dayKey / templateKey / pairKey. Freeform `data_json` —
    these are model output, genuinely variable-shape; storing one per row makes
    regenerating one (e.g. a beat sheet) a single-row write, not a book write."""

    __tablename__ = "project_artifacts"

    project_id = _fk_project()
    kind = Column(String, primary_key=True)
    key = Column(String, primary_key=True, default="")
    data = Column(Text, nullable=False, default="{}")  # JSON
    updated_at = Column(String, nullable=False, default="")


# ── Soft delete ─────────────────────────────────────────────────────────


class TrashItem(Base):
    """A soft-deleted entity awaiting restore. Heterogeneous by nature (any
    kind, plus restore metadata like partId/index), so the payload is JSON —
    the one legitimate blob: a tombstone, not live queryable data."""

    __tablename__ = "trash"

    project_id = _fk_project()
    id = Column(String, primary_key=True)
    kind = Column(String, primary_key=True)  # chapters|scenes|characters|…
    payload = Column(Text, nullable=False, default="{}")  # JSON entity + restore meta
    deleted_at = Column(Integer, nullable=True)  # epoch ms


# ── RAG (P3) ────────────────────────────────────────────────────────────


class RagMeta(Base):
    """Per-project RAG index metadata — the embedding model it was built with
    and the vector dimensionality (so the renderer can detect a model switch)."""

    __tablename__ = "rag_meta"

    project_id = Column(String, primary_key=True)
    model = Column(String, nullable=False, default="")
    dims = Column(Integer, nullable=False, default=0)


class RagVector(Base):
    """One embedded manuscript chunk. Moves the RAG index off the renderer
    (it used to load the whole vector blob and cosine-search in JS) into a
    per-project table the server searches. `vector` and `chunk` are JSON."""

    __tablename__ = "rag_vectors"

    project_id = Column(String, primary_key=True)
    chunk_id = Column(String, primary_key=True)
    sha = Column(String, nullable=False, default="")
    vector = Column(Text, nullable=False, default="[]")  # JSON number[]
    chunk = Column(Text, nullable=False, default="{}")   # JSON chunk metadata


# ── Chat (manuscript-RAG threads) ───────────────────────────────────────


class ChatMessage(Base):
    """One turn in a manuscript-RAG chat thread. A thread is identified by
    (project_id, mode, character_id) — `mode` ∈ book|character, character_id is
    '' for book mode — and its turns are ordered rows by `position`. The
    ChatPanel loads a thread on open and replaces it wholesale when a turn
    settles, so a save is a delete-all-then-insert for that thread key. Replaces
    the renderer's `justwrite:rag:thread:*` kv blobs; project_id FKs projects so
    deleting a book cascades its threads away."""

    __tablename__ = "chat_messages"

    project_id = _fk_project()
    mode = Column(String, primary_key=True)                       # book | character
    character_id = Column(String, primary_key=True, default="")   # '' for book mode
    position = Column(Integer, primary_key=True)
    role = Column(String, nullable=False, default="user")         # user | assistant
    content = Column(Text, nullable=False, default="")
    citations = Column(Text, nullable=False, default="[]")        # JSON citation[]
    error = Column(Text, nullable=True)


# ── Chapter version history ─────────────────────────────────────────────


class ChapterVersion(Base):
    """A named, restorable snapshot of one chapter's scenes — the per-chapter
    version history (separate from undo). Replaces the renderer's
    `justwrite:versions` kv blob. `scenes` is a JSON snapshot of the chapter's
    prose (a version artifact, not live queryable data — like a trash payload).
    project_id FKs projects so deleting a book cascades its versions away;
    `position` orders newest-first within a chapter."""

    __tablename__ = "chapter_versions"

    project_id = _fk_project()
    chapter_id = Column(String, primary_key=True)
    id = Column(String, primary_key=True)                  # version id
    position = Column(Integer, nullable=False, default=0)  # 0 = newest
    saved_at = Column(String, nullable=False, default="")
    label = Column(String, nullable=False, default="")
    words = Column(Integer, nullable=False, default=0)
    scenes = Column(Text, nullable=False, default="[]")    # JSON [{id,title,body}]


# ── Images (P4) ─────────────────────────────────────────────────────────


class ImageBlob(Base):
    """An uploaded image's bytes, served by /v1/images. The project's `images`
    table references one by id (the record's `serverId`). A content store —
    deliberately not project-scoped, so an image survives being moved between
    entities; moves the renderer off the Tauri FS bridge / data-URL-in-snapshot."""

    __tablename__ = "image_blobs"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="")
    mime = Column(String, nullable=False, default="application/octet-stream")
    data = Column(LargeBinary, nullable=False)
    created_at = Column(String, nullable=False, default="")


# ── LLM providers (P5) ──────────────────────────────────────────────────


class LlmProvider(Base):
    """A configured LLM provider — every field a real column (the shared
    `LLMProviderConfig` shape), not a JSON blob. The dispatch resolves a provider
    by id and the registry constructs an adapter from `provider_type` + `base_url`
    + the server-held `api_key`. `local` is the explicit Local/Online choice from
    the form (drives the UI's Local-vs-Cloud grouping); `built_in` marks a seeded
    row, `position` orders the list."""

    __tablename__ = "llm_providers"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="")
    kind = Column(String, nullable=False, default="llm")
    built_in = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    provider_type = Column(String, nullable=False, default="openai-compat")
    base_url = Column(String, nullable=False, default="")
    api_key = Column(String, nullable=True)
    default_model = Column(String, nullable=False, default="")
    embedding_model = Column(String, nullable=False, default="")
    timeout_seconds = Column(Integer, nullable=False, default=60)
    local = Column(Boolean, nullable=False, default=True)


class LlmUsage(Base):
    """One recorded LLM call — the cost/token ledger behind Settings → Usage.
    Replaces the renderer's `justwrite:ai:usage` kv blob. Lifetime totals are
    computed from these rows with SQL aggregates, so trimming the displayed log
    never loses cost history the way the old in-memory 1000-row cap did."""

    __tablename__ = "llm_usage"

    id = Column(String, primary_key=True)
    at = Column(Integer, nullable=False, default=0)             # epoch ms
    feature = Column(String, nullable=False, default="unknown")
    provider_id = Column(String, nullable=True)
    model = Column(String, nullable=True)
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    cost = Column(Float, nullable=False, default=0.0)
    meta = Column(Text, nullable=False, default="{}")           # JSON


# ── Built-in llama.cpp catalog (the DB-backed source of truth) ──────────
#
# The runner's downloadable model catalog moved off `runner-manifest.json` into
# this table — so a user can add/edit/curate models without re-shipping the
# manifest. `runner-manifest.json` keeps only ship data (`llamacpp.binaries`,
# `flagPresets`, `vramFit`). QuickSetup + the model download list + the runner's
# /v1/llm-runner/models endpoint all read from this one source. Companion table
# `model_recommendations` carries the many-per-model job-tag curation.


class ModelCatalog(Base):
    """One downloadable llama.cpp model — catalog fields only. Catalog drives
    download (`hf_repo` + `quant` resolve a GGUF on HuggingFace; `mmproj` for
    multimodal) and Fit (`min_vram_mb`/`min_ram_mb`). Per-model switch overrides
    live in the `model_switches` child table (variable-cardinality, normalized).
    `built_in` marks seeded rows so the editor can offer 'reset to factory'."""

    __tablename__ = "model_catalog"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False, default="")
    hf_repo = Column(String, nullable=False, default="")
    quant = Column(String, nullable=False, default="")
    mmproj = Column(String, nullable=True)  # null = text-only, else mmproj filename
    total_params = Column(String, nullable=False, default="")   # "35B" etc.
    active_params = Column(String, nullable=False, default="")  # MoE active count
    mtp = Column(Boolean, nullable=False, default=False)        # multi-token-prediction GGUF
    min_vram_mb = Column(Integer, nullable=True)
    min_ram_mb = Column(Integer, nullable=True)
    tier = Column(String, nullable=False, default="mid")        # cpu|low-vram-moe|mid|high
    built_in = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)


class ModelSwitch(Base):
    """Per-model llama.cpp spawn-flag override — the variable-cardinality child
    of `model_catalog`. PK (model_id, flag_name); `flag_value` is text (the
    runner parses it into the typed `Overrides` field). At spawn, these layer
    UNDER any user-supplied Overrides (user wins per-field). Examples seeded:
    35B MoE → spec_type=none (override the mtp:true → draft-mtp default; our
    research found spec hurts MoE) + no_mmap=true; 27B dense MTP → spec_type=
    draft-mtp + spec_n_max=3. Names mirror `Overrides` (process.py:44-80) so
    they map 1:1. `built_in` marks seeded rows."""

    __tablename__ = "model_switches"

    model_id = Column(
        String,
        ForeignKey("model_catalog.id", ondelete="CASCADE"),
        primary_key=True,
    )
    flag_name = Column(String, primary_key=True)   # e.g. "spec_type", "no_mmap"
    flag_value = Column(Text, nullable=False, default="")  # parsed by the runner
    built_in = Column(Boolean, nullable=False, default=False)


# ── Model recommendations (per-model job-tag curation, QuickSetup Q3 layer) ──


class ModelRecommendation(Base):
    """One curated 'model X is good for job Y' record — the editable layer
    QuickSetup uses to pre-fill role picks (filter by job + Fit-OK, order by
    rank). PK is (modelId, job) so a model can be ranked for many jobs without
    duplicating the row. `built_in` marks a seeded row so the editor can offer
    'reset to factory' (delete user edits + re-seed). Host side of the shared
    `llm_runner.llm.recommendations_api.RecommendationStore` Protocol — see
    docs for the Q3 (catalog-curation) vs Q1/Q2 (auto-detected fit/flags) split."""

    __tablename__ = "model_recommendations"

    model_id = Column(String, primary_key=True)
    job = Column(String, primary_key=True)
    rank = Column(Integer, nullable=False, default=100)
    why = Column(Text, nullable=False, default="")
    built_in = Column(Boolean, nullable=False, default=False)


# ── Routing (default + roles + per-feature pins; live config + presets) ──


class RoutingConfigRow(Base):
    """A routing configuration in real columns — the live config (id='active')
    AND named presets share this one table (`is_active` + `name` distinguish).
    Default LLM/embedding + the Quick/Accuracy role targets are columns; the
    per-feature pins are rows in `routing_pins` (FK). Replaces the routing keys
    that used to live in the `ai` settings JSON blob (defaultLlmId / llmRoles /
    featurePins / routingPresets) — config.py reads the active row to drive
    dispatch; the shared /v1/ai/routing* router reads/writes it."""

    __tablename__ = "routing_configs"

    id = Column(String, primary_key=True)  # 'active' for the live config; else a preset id
    name = Column(String, nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    default_llm_id = Column(String, nullable=False, default="")
    default_model = Column(String, nullable=False, default="")
    default_embedding_id = Column(String, nullable=False, default="")
    default_embedding_model = Column(String, nullable=False, default="")
    quick_provider_id = Column(String, nullable=False, default="")
    quick_model = Column(String, nullable=False, default="")
    accuracy_provider_id = Column(String, nullable=False, default="")
    accuracy_model = Column(String, nullable=False, default="")


class RoutingPin(Base):
    """One feature → provider/model/role pin within a routing config. A row
    exists only for a feature that actually routes somewhere (explicit provider
    or an inherited role); "inherit default" is the absence of a row."""

    __tablename__ = "routing_pins"

    config_id = Column(
        String, ForeignKey("routing_configs.id", ondelete="CASCADE"), primary_key=True
    )
    feature = Column(String, primary_key=True)
    provider_id = Column(String, nullable=False, default="")
    model = Column(String, nullable=False, default="")
    role = Column(String, nullable=False, default="")


# ── Jobs (the editable routing-unit list + the feature→job map) ──────────


class Job(Base):
    """One job — the routing unit that replaces the two fixed roles. A small,
    user-editable list (seeded chat/prose/extraction/analysis). `id` is an
    IMMUTABLE slug (minted from the label at create) so a rename — which edits
    only `label` — never orphans the rows that reference it (`feature_jobs`,
    later `job_routes` + `model_recommendations.job`). `built_in` marks a seeded
    row. Host side of the shared `llm_runner.llm.jobs_api.JobStore` Protocol."""

    __tablename__ = "jobs"

    id = Column(String, primary_key=True)
    label = Column(String, nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    position = Column(Integer, nullable=False, default=0)
    built_in = Column(Boolean, nullable=False, default=False)


class FeatureJob(Base):
    """One feature's job classification (the per-feature dropdown). `feature_key`
    matches `feature_catalog.py`; `job_id` is a `Job.id`. Deliberately NOT a hard
    FK to `jobs` — deleting a job leaves this a dangling ref that dispatch
    resolves to the default job (graceful fallback, like an unregistered
    provider), per the jobs-architecture design. `built_in` marks the seeded
    best-guess. Host side of the shared `FeatureJobStore` Protocol."""

    __tablename__ = "feature_jobs"

    feature_key = Column(String, primary_key=True)
    job_id = Column(String, nullable=False, default="")
    built_in = Column(Boolean, nullable=False, default=False)


# ── Feature presets (Feature Workbench — named saved configs per feature) ──


class FeaturePreset(Base):
    """A named saved AI config for one ACTION (the Feature Workbench's
    save-as/load). Many per action; `is_active` marks the one currently in
    production — applying it writes the action's live prompt + routing pin, so the
    live config the dispatch runs IS the active preset (no separate plumbing).
    `is_active` + `name` drive the PRODUCTION badge. (`action` is the prompt/action
    key, e.g. "writerAI.tighten"; the "feature" is just its visual group.)"""

    __tablename__ = "feature_presets"

    id = Column(String, primary_key=True)
    action = Column(String, nullable=False, default="")
    name = Column(String, nullable=False, default="")
    is_active = Column(Boolean, nullable=False, default=False)
    position = Column(Integer, nullable=False, default=0)
    provider_id = Column(String, nullable=False, default="")
    role = Column(String, nullable=False, default="")
    model = Column(String, nullable=False, default="")
    system = Column(Text, nullable=False, default="")
    user_template = Column(Text, nullable=False, default="")
    temperature = Column(Float, nullable=True)
    think = Column(Boolean, nullable=False, default=False)


# ── Feature prompts (LLM feature catalog — DB-seeded, Lab-editable) ──────


class FeaturePrompt(Base):
    """One feature's prompt — seeded from the seed module and editable in the
    Lab; the DB is the source of truth (no hardcoded prompt text and no runtime
    code fallback — see docs/plans/2026-06-21-feature-prompts-db-seed.md).

    `key` is the action id (e.g. "critique", "critiqueStructure"); `feature` is
    the routing key for pins/roles/usage (several actions can share one).
    `system` + `user_template` carry the prompt text ({{var}} placeholders the
    server fills at request time); `temperature`/`think` are per-action defaults.
    `built_in` marks a seeded row (so the Lab can offer "reset to default")."""

    __tablename__ = "feature_prompts"

    key = Column(String, primary_key=True)
    feature = Column(String, nullable=False, default="")
    system = Column(Text, nullable=False, default="")
    user_template = Column(Text, nullable=False, default="")
    temperature = Column(Float, nullable=False, default=0.7)
    think = Column(Boolean, nullable=False, default=False)
    max_tokens = Column(Integer, nullable=False, default=0)  # 0 → no cap
    built_in = Column(Boolean, nullable=False, default=True)
    # Feature Workbench nav metadata: the action's display name, a short blurb, and
    # an optional sub-section label (e.g. writerAI's "Prose actions" / "Line
    # edits"). Column is `subgroup` because GROUP is a SQL reserved word; the wire
    # field is `group`. `label` empty → the UI derives a name from the key / the
    # feature label.
    label = Column(String, nullable=False, default="")
    description = Column(Text, nullable=False, default="")
    subgroup = Column(String, nullable=False, default="")


# ── Sessions (writing-activity log) ─────────────────────────────────────


class SessionDay(Base):
    """One calendar day's total words written, across all projects — the daily
    word-count log behind Home / Analysis. Global (per install), not project
    scoped. A real table replaces the old `justwrite:sessions` kv blob, so the
    full history is kept (the prior 400-day cap + monthly archive existed only
    to bound a blob and are gone)."""

    __tablename__ = "sessions"

    day = Column(String, primary_key=True)  # yyyy-mm-dd in the client's local time
    words = Column(Integer, nullable=False, default=0)


class SessionChapterWord(Base):
    """The last word count already attributed for a chapter — the checkpoint
    `recordChapterWords` diffs against so a re-count never double-attributes."""

    __tablename__ = "session_chapter_words"

    chapter_id = Column(String, primary_key=True)
    words = Column(Integer, nullable=False, default=0)


class SessionMeta(Base):
    """Singleton row: the chapter + day that last received a positive delta,
    driving Home's 'jump to today's chapter'."""

    __tablename__ = "session_meta"

    id = Column(String, primary_key=True, default="singleton")
    last_write_chapter = Column(String, nullable=True)
    last_write_day = Column(String, nullable=True)
