"""Assemble / decompose a JustWrite book between the normalized tables and the
renderer's snapshot JSON (the `exportSnapshot()` shape in stores/project.js).

- `decompose(db, project_id, snapshot)` replaces a project's rows from a
  snapshot. Delete-then-insert within the caller's transaction — simple and
  obviously correct; incremental per-entity writes are P2.5. Does NOT commit.
- `assemble(db, project_id)` rebuilds the snapshot from the rows, read-only.

assemble emits the **canonical** snapshot shape (link arrays always present on
scenes; full-key entities; the four default tag-vocab kinds; an empty scene
list for every chapter). On canonical input, `assemble(decompose(x)) == x`
(modulo dict key order) — verified by tests/test_book_io.py.

camelCase on the wire; snake_case columns. See
docs/plans/2026-06-18-jw-p2-normalization-design.md.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from .models import (
    Architecture,
    Chapter,
    ChapterStrand,
    Character,
    Event,
    Group,
    GroupMember,
    Image,
    Location,
    Note,
    Part,
    Project,
    ProjectArtifact,
    Scene,
    SceneLink,
    Status,
    StoryObject,
    Strand,
    StrandBeat,
    TagVocab,
    TrashItem,
    Worldbuilding,
    WorldbuildingCategory,
)

# Every per-project table, wiped on decompose (NOT projects itself — it's
# upserted — and NOT the rag_* tables, which the /v1/rag API owns separately).
_PROJECT_TABLES = [
    Part, Chapter, Scene, SceneLink, ChapterStrand, Character, Location,
    StoryObject, Group, GroupMember, Note, Strand, StrandBeat, Worldbuilding,
    WorldbuildingCategory, Status, TagVocab, Architecture, Image, Event,
    ProjectArtifact, TrashItem,
]

# scene_links / group_members store a singular kind; the snapshot groups by
# plural collection name.
_LINK_PLURAL = {"characters": "character", "locations": "location", "objects": "object", "strands": "strand"}
_LINK_SINGULAR = {v: k for k, v in _LINK_PLURAL.items()}

_TRASH_KINDS = [
    "chapters", "scenes", "characters", "locations", "objects", "groups",
    "notes", "strands", "worldbuilding", "events", "statuses", "tagVocab",
]
_TAG_KINDS = ["characters", "locations", "objects", "worldbuilding"]


# ── small coercion helpers ──────────────────────────────────────────────


def _s(v) -> str:
    return "" if v is None else str(v)


def _i(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _opt_i(v):
    return None if v is None else _i(v)


def _ref(v):
    """A non-empty id, or None (for nullable cross-entity refs)."""
    s = _s(v)
    return s or None


def _json_or_none(v):
    return json.dumps(v) if v is not None else None


# ── decompose: snapshot → rows ──────────────────────────────────────────


def decompose(db: Session, project_id: str, snap: dict) -> None:
    snap = snap or {}
    proj = snap.get("project") or {}

    row = db.get(Project, project_id)
    if row is None:
        row = Project(id=project_id)
        db.add(row)
    row.title = _s(proj.get("title") or "Untitled")
    row.author = _s(proj.get("author"))
    row.subtitle = _s(proj.get("subtitle"))
    row.genre = _s(proj.get("genre"))
    row.words_goal = _i(proj.get("wordsGoal"))
    row.daily_target = _i(proj.get("dailyTarget"))
    row.words_written = _i(proj.get("wordsWritten"))
    row.started_on = _s(proj.get("startedOn"))
    row.deadline = _s(proj.get("deadline"))
    row.premise = _s(proj.get("premise"))
    row.world_rules = _s(snap.get("worldRules"))
    row.cover_image = _json_or_none(proj.get("coverImage"))
    row.updated_at = _s(snap.get("savedAt"))
    row.data = "{}"  # legacy blob retired once normalized
    # Materialize the parent row before inserting any FK children (and before
    # the wipe), so the project_id FK is satisfiable regardless of the unit-of-
    # work's insert ordering at commit.
    db.flush()

    # Wipe existing child rows; reinsert below.
    for model in _PROJECT_TABLES:
        db.query(model).filter(model.project_id == project_id).delete(synchronize_session=False)

    saved_at = _s(snap.get("savedAt"))
    voice_canon = set(snap.get("voiceCanonChapterIds") or [])

    # parts → chapters → chapter_strands
    for pi, part in enumerate(snap.get("parts") or []):
        pid = _s(part.get("id"))
        db.add(Part(project_id=project_id, id=pid, position=pi, title=_s(part.get("title"))))
        for ci, ch in enumerate(part.get("chapters") or []):
            chid = _s(ch.get("id"))
            db.add(Chapter(
                project_id=project_id, id=chid, part_id=pid, position=ci,
                num=_i(ch.get("num")), title=_s(ch.get("title")), words=_i(ch.get("words")),
                status=_s(ch.get("status") or "todo"), is_voice_canon=chid in voice_canon,
                critique=_json_or_none(ch.get("critique")),
                reader_knowledge=_json_or_none(ch.get("readerKnowledge")),
                multi_reader=_json_or_none(ch.get("multiReader")),
            ))
            for li, sid in enumerate(ch.get("strands") or []):
                db.add(ChapterStrand(project_id=project_id, chapter_id=chid, strand_id=_s(sid), position=li))

    # scenes → scene_links
    for chid, scene_list in (snap.get("scenes") or {}).items():
        for si, scn in enumerate(scene_list or []):
            sid = _s(scn.get("id"))
            db.add(Scene(project_id=project_id, id=sid, chapter_id=_s(chid), position=si,
                         title=_s(scn.get("title")), body=_s(scn.get("body"))))
            for plural, singular in _LINK_PLURAL.items():
                for li, ref in enumerate(scn.get(plural) or []):
                    db.add(SceneLink(project_id=project_id, scene_id=sid, kind=singular,
                                     ref_id=_s(ref), position=li))

    # characters (+ extras pulled from the characterExtras map)
    extras_map = snap.get("characterExtras") or {}
    for i, c in enumerate(snap.get("characters") or []):
        cid = _s(c.get("id"))
        db.add(Character(
            project_id=project_id, id=cid, position=i, name=_s(c.get("name")),
            main=bool(c.get("main")), age=_opt_i(c.get("age")), gender=_s(c.get("gender")),
            pronouns=_s(c.get("pronouns")), life_status=_s(c.get("lifeStatus")),
            one_liner=_s(c.get("oneLiner")), role=_s(c.get("role")),
            aliases=json.dumps(c.get("aliases") or []), tags=json.dumps(c.get("tags") or []),
            extras=_json_or_none(extras_map.get(cid)), audit=_json_or_none(c.get("audit")),
        ))

    for i, loc in enumerate(snap.get("locations") or []):
        db.add(Location(project_id=project_id, id=_s(loc.get("id")), position=i,
                        name=_s(loc.get("name")), kind=_s(loc.get("kind")), note=_s(loc.get("note")),
                        tags=json.dumps(loc.get("tags") or [])))

    for i, obj in enumerate(snap.get("objects") or []):
        db.add(StoryObject(project_id=project_id, id=_s(obj.get("id")), position=i,
                           name=_s(obj.get("name")), kind=_s(obj.get("kind")), note=_s(obj.get("note")),
                           tags=json.dumps(obj.get("tags") or [])))

    # groups → group_members (member display name dropped; resolved on assemble)
    for i, g in enumerate(snap.get("groups") or []):
        gid = _s(g.get("id"))
        db.add(Group(project_id=project_id, id=gid, position=i, name=_s(g.get("name")),
                     blurb=_s(g.get("blurb")), color=_s(g.get("color"))))
        for mi, m in enumerate(g.get("members") or []):
            db.add(GroupMember(project_id=project_id, group_id=gid, kind=_s(m.get("kind")),
                               ref_id=_s(m.get("id")), position=mi))

    for i, n in enumerate(snap.get("notes") or []):
        anchor = n.get("anchor") or {}
        db.add(Note(project_id=project_id, id=_s(n.get("id")), position=i, title=_s(n.get("title")),
                    body=_s(n.get("body")), tag=_s(n.get("tag") or "note"), updated=_s(n.get("updated")),
                    anchor_chapter_id=_ref(anchor.get("chapterId")), anchor_scene_id=_ref(anchor.get("sceneId"))))

    # strands → strand_beats
    for i, s in enumerate(snap.get("strands") or []):
        sid = _s(s.get("id"))
        db.add(Strand(project_id=project_id, id=sid, position=i, name=_s(s.get("name")),
                      color=_s(s.get("color")), blurb=_s(s.get("blurb")), body=_s(s.get("body")),
                      status=_s(s.get("status") or "open")))
        for bi, b in enumerate(s.get("beats") or []):
            db.add(StrandBeat(project_id=project_id, id=_s(b.get("id")), strand_id=sid, position=bi,
                              chapter_id=_ref(b.get("chapterId")), scene_id=_ref(b.get("sceneId")),
                              label=_s(b.get("label")), note=_s(b.get("note"))))

    for i, w in enumerate(snap.get("worldbuilding") or []):
        db.add(Worldbuilding(project_id=project_id, id=_s(w.get("id")), position=i,
                             category_id=_s(w.get("category")), title=_s(w.get("title")),
                             status=_s(w.get("status")), words=_i(w.get("words")),
                             summary=_s(w.get("summary")), body=_s(w.get("body")),
                             tags=json.dumps(w.get("tags") or []), related=json.dumps(w.get("related") or [])))

    for i, c in enumerate(snap.get("worldbuildingCategories") or []):
        db.add(WorldbuildingCategory(project_id=project_id, id=_s(c.get("id")), position=i,
                                     label=_s(c.get("label")), icon=_s(c.get("icon")), hue=_i(c.get("hue"))))

    for i, st in enumerate(snap.get("statuses") or []):
        db.add(Status(project_id=project_id, id=_s(st.get("id")), position=i,
                      label=_s(st.get("label")), color=_s(st.get("color"))))

    for kind, items in (snap.get("tagVocabularies") or {}).items():
        for i, t in enumerate(items or []):
            db.add(TagVocab(project_id=project_id, id=_s(t.get("id")), kind=_s(kind),
                            position=i, label=_s(t.get("label"))))

    for i, (aid, doc) in enumerate((snap.get("architecture") or {}).items()):
        doc = doc or {}
        db.add(Architecture(project_id=project_id, id=_s(aid), position=i, title=_s(doc.get("title")),
                            blurb=_s(doc.get("blurb")), status=_s(doc.get("status")),
                            words=_i(doc.get("words")), body=_s(doc.get("body"))))

    for entity_id, img_list in (snap.get("images") or {}).items():
        for i, img in enumerate(img_list or []):
            rec = {k: v for k, v in img.items() if k not in ("id", "addedAt")}
            db.add(Image(project_id=project_id, id=_s(img.get("id")), entity_kind="",
                         entity_id=_s(entity_id), position=i, added_at=_opt_i(img.get("addedAt")),
                         data=json.dumps(rec)))

    for entity_id, ev_list in (snap.get("events") or {}).items():
        for i, ev in enumerate(ev_list or []):
            db.add(Event(project_id=project_id, id=_s(ev.get("id")), entity_kind="",
                         entity_id=_s(entity_id), position=i, when=_s(ev.get("when")),
                         title=_s(ev.get("title")), note=_s(ev.get("note"))))

    for kind, items in (snap.get("trash") or {}).items():
        for it in items or []:
            db.add(TrashItem(project_id=project_id, id=_s(it.get("id")), kind=_s(kind),
                             payload=json.dumps(it), deleted_at=_opt_i(it.get("deletedAt"))))

    # AI artifacts — singletons + keyed maps
    for kind in ("reverseOutline", "plotHoles", "marketingPack"):
        val = snap.get(kind)
        if val is not None:
            db.add(ProjectArtifact(project_id=project_id, kind=kind, key="",
                                   data=json.dumps(val), updated_at=saved_at))
    for kind, mapkey in (("dailyRecap", "dailyRecaps"), ("beatSheet", "beatSheets"), ("relationshipArc", "relationshipArcs")):
        for k, v in (snap.get(mapkey) or {}).items():
            db.add(ProjectArtifact(project_id=project_id, kind=kind, key=_s(k),
                                   data=json.dumps(v), updated_at=saved_at))


# ── assemble: rows → snapshot ───────────────────────────────────────────


def assemble(db: Session, project_id: str) -> dict | None:
    proj = db.get(Project, project_id)
    if proj is None:
        return None

    def ordered(model):
        return db.query(model).filter(model.project_id == project_id).order_by(model.position).all()

    # scenes (+ links) grouped by chapter
    links_by_scene: dict[str, dict] = {}
    for ln in db.query(SceneLink).filter(SceneLink.project_id == project_id).order_by(SceneLink.position).all():
        d = links_by_scene.setdefault(ln.scene_id, {p: [] for p in _LINK_PLURAL})
        plural = _LINK_SINGULAR.get(ln.kind)
        if plural:
            d[plural].append(ln.ref_id)
    scenes_by_ch: dict[str, list] = {}
    for scn in ordered(Scene):
        s = {"id": scn.id, "title": scn.title, "body": scn.body}
        s.update(links_by_scene.get(scn.id) or {p: [] for p in _LINK_PLURAL})
        scenes_by_ch.setdefault(scn.chapter_id, []).append(s)

    # chapters (+ strands) grouped by part
    strands_by_ch: dict[str, list] = {}
    for cs in db.query(ChapterStrand).filter(ChapterStrand.project_id == project_id).order_by(ChapterStrand.position).all():
        strands_by_ch.setdefault(cs.chapter_id, []).append(cs.strand_id)
    chapters_by_part: dict[str, list] = {}
    voice_canon: list[str] = []
    for ch in ordered(Chapter):
        scenes_by_ch.setdefault(ch.id, [])  # every chapter has a (possibly empty) scene list
        c = {"id": ch.id, "num": ch.num, "title": ch.title, "words": ch.words,
             "status": ch.status, "strands": strands_by_ch.get(ch.id, [])}
        if ch.critique is not None:
            c["critique"] = json.loads(ch.critique)
        if ch.reader_knowledge is not None:
            c["readerKnowledge"] = json.loads(ch.reader_knowledge)
        if ch.multi_reader is not None:
            c["multiReader"] = json.loads(ch.multi_reader)
        if ch.is_voice_canon:
            voice_canon.append(ch.id)
        chapters_by_part.setdefault(ch.part_id, []).append(c)
    parts = [{"id": p.id, "title": p.title, "chapters": chapters_by_part.get(p.id, [])} for p in ordered(Part)]

    characters = []
    extras: dict[str, dict] = {}
    for c in ordered(Character):
        obj = {"id": c.id, "main": c.main, "age": c.age, "gender": c.gender,
               "pronouns": c.pronouns, "aliases": json.loads(c.aliases),
               "lifeStatus": c.life_status, "oneLiner": c.one_liner, "role": c.role,
               "name": c.name, "tags": json.loads(c.tags)}
        if c.audit is not None:
            obj["audit"] = json.loads(c.audit)
        characters.append(obj)
        if c.extras is not None:
            extras[c.id] = json.loads(c.extras)

    locations = [{"id": x.id, "name": x.name, "kind": x.kind, "note": x.note, "tags": json.loads(x.tags)} for x in ordered(Location)]
    objects = [{"id": x.id, "name": x.name, "kind": x.kind, "note": x.note, "tags": json.loads(x.tags)} for x in ordered(StoryObject)]
    strands = [{"id": s.id, "name": s.name, "color": s.color, "blurb": s.blurb, "body": s.body,
                "status": s.status, "beats": []} for s in ordered(Strand)]

    # strand beats grouped onto their strand (which already carries beats=[])
    beats_by_strand: dict[str, list] = {}
    for b in db.query(StrandBeat).filter(StrandBeat.project_id == project_id).order_by(StrandBeat.position).all():
        beats_by_strand.setdefault(b.strand_id, []).append(
            {"id": b.id, "chapterId": b.chapter_id, "sceneId": b.scene_id, "label": b.label, "note": b.note})
    for s in strands:
        s["beats"] = beats_by_strand.get(s["id"], [])

    # group members, with display name resolved from the entity tables
    name_by: dict[tuple, str] = {}
    for c in characters:
        name_by[("character", c["id"])] = c["name"]
    for x in locations:
        name_by[("location", x["id"])] = x["name"]
    for x in objects:
        name_by[("object", x["id"])] = x["name"]
    for s in strands:
        name_by[("strand", s["id"])] = s["name"]
    members_by_group: dict[str, list] = {}
    for gm in db.query(GroupMember).filter(GroupMember.project_id == project_id).order_by(GroupMember.position).all():
        m = {"kind": gm.kind, "id": gm.ref_id}
        nm = name_by.get((gm.kind, gm.ref_id))
        if nm is not None:
            m["name"] = nm
        members_by_group.setdefault(gm.group_id, []).append(m)
    groups = [{"id": g.id, "name": g.name, "blurb": g.blurb, "color": g.color,
               "members": members_by_group.get(g.id, [])} for g in ordered(Group)]

    notes = []
    for n in ordered(Note):
        anchor = None
        if n.anchor_chapter_id:
            anchor = {"chapterId": n.anchor_chapter_id}
            if n.anchor_scene_id:
                anchor["sceneId"] = n.anchor_scene_id
        notes.append({"id": n.id, "title": n.title, "body": n.body, "tag": n.tag,
                      "updated": n.updated, "anchor": anchor})

    worldbuilding = [{"id": w.id, "category": w.category_id, "title": w.title, "tags": json.loads(w.tags),
                      "status": w.status, "words": w.words, "summary": w.summary, "body": w.body,
                      "related": json.loads(w.related)} for w in ordered(Worldbuilding)]
    wb_categories = [{"id": c.id, "label": c.label, "icon": c.icon, "hue": c.hue} for c in ordered(WorldbuildingCategory)]
    statuses = [{"id": s.id, "label": s.label, "color": s.color} for s in ordered(Status)]

    tag_vocab: dict[str, list] = {k: [] for k in _TAG_KINDS}
    for t in db.query(TagVocab).filter(TagVocab.project_id == project_id).order_by(TagVocab.position).all():
        tag_vocab.setdefault(t.kind, []).append({"id": t.id, "label": t.label})

    architecture: dict[str, dict] = {}
    for a in ordered(Architecture):
        architecture[a.id] = {"id": a.id, "title": a.title, "blurb": a.blurb,
                              "status": a.status, "words": a.words, "body": a.body}

    images: dict[str, list] = {}
    for im in ordered(Image):
        images.setdefault(im.entity_id, []).append({"id": im.id, "addedAt": im.added_at, **json.loads(im.data)})

    events: dict[str, list] = {}
    for ev in ordered(Event):
        events.setdefault(ev.entity_id, []).append({"id": ev.id, "when": ev.when, "title": ev.title, "note": ev.note})

    trash: dict[str, list] = {k: [] for k in _TRASH_KINDS}
    for it in db.query(TrashItem).filter(TrashItem.project_id == project_id).order_by(TrashItem.deleted_at, TrashItem.id).all():
        trash.setdefault(it.kind, []).append(json.loads(it.payload))

    reverse_outline = plot_holes = marketing_pack = None
    daily_recaps: dict[str, dict] = {}
    beat_sheets: dict[str, dict] = {}
    relationship_arcs: dict[str, dict] = {}
    for a in db.query(ProjectArtifact).filter(ProjectArtifact.project_id == project_id).all():
        data = json.loads(a.data)
        if a.kind == "reverseOutline":
            reverse_outline = data
        elif a.kind == "plotHoles":
            plot_holes = data
        elif a.kind == "marketingPack":
            marketing_pack = data
        elif a.kind == "dailyRecap":
            daily_recaps[a.key] = data
        elif a.kind == "beatSheet":
            beat_sheets[a.key] = data
        elif a.kind == "relationshipArc":
            relationship_arcs[a.key] = data

    project_obj = {
        "title": proj.title, "author": proj.author, "subtitle": proj.subtitle, "genre": proj.genre,
        "wordsGoal": proj.words_goal, "dailyTarget": proj.daily_target, "wordsWritten": proj.words_written,
        "startedOn": proj.started_on, "deadline": proj.deadline, "premise": proj.premise,
        "coverImage": json.loads(proj.cover_image) if proj.cover_image else None,
    }

    return {
        "project": project_obj, "parts": parts, "scenes": scenes_by_ch,
        "characters": characters, "characterExtras": extras, "locations": locations,
        "objects": objects, "groups": groups, "strands": strands, "notes": notes,
        "architecture": architecture, "worldbuilding": worldbuilding,
        "worldbuildingCategories": wb_categories, "tagVocabularies": tag_vocab,
        "images": images, "events": events, "statuses": statuses, "trash": trash,
        "dailyRecaps": daily_recaps, "reverseOutline": reverse_outline,
        "beatSheets": beat_sheets, "plotHoles": plot_holes,
        "voiceCanonChapterIds": voice_canon, "relationshipArcs": relationship_arcs,
        "marketingPack": marketing_pack, "worldRules": proj.world_rules, "savedAt": proj.updated_at,
    }
