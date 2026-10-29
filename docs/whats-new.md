# What's new

Recent changes worth noticing. Older entries fall off the bottom — see the [Roadmap](roadmap.md) for direction.

---

## 2026-10-28

**AI-written words, chapter by chapter.** Under the count of AI-written words in **Settings →
Project**, **By chapter** lists the chapters that have some, with each one's share of its chapter,
and **Copy as text** puts the list on the clipboard — for a publisher's question about AI-generated
text. It counts the words still marked; Mark as mine clears a mark. See
[Writing](writing.md#ai-written-text-the-ais-words-marked).

**Settings → Project on a phone.** Each label now sits above its field, which gets the whole width;
before, the labels took a column of their own and the fields a third of the screen.

**Export your story bible.** A fifth card on the Export page, **Story bible**, makes your characters,
locations, objects, groups and worldbuilding articles into one Word document or PDF — every filled
field under its page's label — to hand an editor, a co-author or an illustrator. Tick **Leave out
entries marked Exclude from AI** to keep your spoilers out of it. See
[Import and export](import-and-export.md#story-bible).

**The PDF's page size.** **Export → PDF** lets you choose the page: A4, US Letter, A5, or a novel's
trim size (5 × 8 up to 6 × 9 inches), each with its own margins, which you can change — top, bottom
and sides, in the size's unit. The book remembers its choice; every book starts on A4, the page every
PDF had. See [Import and export](import-and-export.md#pdf).

**Brainstorm where you use it.** **Name ideas** (beside a character's, location's, object's or
group's name), the new **Title ideas** (beside the book's title in **Settings → Project**, and the
title in the editor's header — a scene's or a chapter's), and the plot ideas in the editor's AI menu
and a Plot board strand's ✨ menu now open on Brainstorm's own panel: a **Seed prompt** you can fill
or leave empty, **Generate**, thumbs-up and **More like these**. Nothing runs until you press
Generate, and **Use** — **Add as beat** on a strand (its window stays open for more), **Write this**
in the editor — puts an idea in place, with no copying from the Brainstorm page. See
[Brainstorm](brainstorm.md#name-and-title-ideas-where-you-use-them).

**Dates without a time read as dates.** On the **Timeline** and an entity's **Events**, an event whose
time was left at midnight — a date picked alone — no longer shows "12:00 AM".

**Relations keeps names readable.** A long name in its circle on **Relations** now takes two lines
instead of squeezing its letters together.

**The sidebar shows the version you're running.** Under the JustWrite name it said "v0.1 · local"
in every version; it now shows the real one, as **Settings → About** does.

**A scene opened from a link shows in the sidebar.** A beat on a strand, **Appears in scenes**, a
mention or a search result opens the scene and now also opens its chapter in the sidebar, the
scene's row highlighted. Before, the chapter stayed closed and the scene's row hidden.

**Fields sized to what they hold.** In **Settings → Project**, **Brainstorm** and **Import**, a
title or a premise is as wide as a line of prose and a name or a menu as wide as what it holds,
instead of stretching across the page. The **Plot board** shows each strand's whole name.

**Plot board beats show their labels.** A beat pinned to a scene showed only its *Scene 1* badge in
its chapter's column; the label now takes the first line and the badge sits under it.

**Also known as, labelled.** A character's aliases row read "Tags", like the row above it. It says
**Also known as** now, with *Add a name…* in its box.

**The book index counts entries.** Ask the book's index line says how many **entries** it holds —
scene excerpts and story-bible entries together — instead of calling them all scenes, and the index
window lists each story-bible entry by name.

**A new document template re-embeds by itself.** Change an embedding model's **Document template** on
the AI page and the index's next update re-embeds the whole book with it; no manual Rebuild.

**Brainstorm's instructions, in the Lab.** What Brainstorm tells the model to do with the ideas you
liked and those already shown is part of its prompts now, on the AI page's **Routing by feature**
tab, where you can read and edit them.

**Empty lists say so.** An empty section of the sidebar says *No chapters yet* (or *No articles yet*)
instead of *No chapters match* when nothing is filtered.

## 2026-10-24

**Long local answers no longer give up after a minute.** The built-in provider waited only 60
seconds in libraries set up before 2026-10-07, so a model thinking at High could fail with "The AI
provider can't be reached" while it was still answering. It now waits 900 seconds, like a new
install, and every provider's **Timeout (seconds)** can be changed in its **Edit**.

**The start-up screen names the model it's loading**, "Gemma 4 26B-A4B (QAT)" rather than its id,
and shows the whole progress line; Quick Setup names it the same way.

**Two windows on one server see each other's changes.** With the desktop app and a browser tab
(or two tabs) open on the same server, a change made in one now shows up in the other within a few
seconds, as changes from another device already did. Before, the other window kept showing the book
as it had loaded it and could save over the change. See
[Several windows at once](headless-access.md#opening-justwrite-in-a-browser).

---

## 2026-10-20

**Websites can't read your JustWrite server.** Until now a web page open in your browser could
read JustWrite's server on your computer — your books, a backup and your AI providers' keys
included. The server now answers only JustWrite's own windows. If you run it behind a reverse
proxy, see [Behind a reverse proxy](headless-access.md#behind-a-reverse-proxy).

**Pictures show when the server asks for a token.** Covers, portraits and scene images now load
through the window's access token, so they appear in a browser signed in to a server that requires
one; before, they stayed blank. And a page on another site can no longer make the server start a
backup by linking to it.

**Your access tokens stay with the server.** Resetting the workspace or restoring a backup keeps
the server's tokens and its **Require a token even on localhost** switch, and a backup no longer
contains them. See [API access](headless-access.md#api-access-bearer-tokens).

**Copy works from another computer.** In a browser at a plain `http://` address — JustWrite on
another computer on your network — the **Copy** buttons (the server address, Brainstorm, the
marketing pack) now copy; before, they failed. The editor's **Paste** button can't read the
clipboard there, and now says so: **Ctrl+V** pastes.

**A restore waits for the saves under way.** While a backup is restored or the workspace is reset,
the changes already being saved finish first and new ones are refused with a message, so none of
them lands in the middle of it.

**`justwrite-server` on macOS and Linux.** The command that runs the server on its own, without
the window, now comes with the Mac and Linux apps too, as it does on Windows. See
[Running the server yourself](headless-access.md#running-the-server-yourself).

**Why the app can't reach its server, in more cases.** The connection page now also says when
another person signed in to the computer has JustWrite open, when Windows has reserved its port,
and the server's own error when it stopped as it started. See
[The app can't reach its server](troubleshooting.md#the-app-cant-reach-its-server).

**Change folder makes its own folder, and keeps the old one.** **Settings → Storage → Change
folder…** now copies your data into a new JustWrite folder inside the one you pick, after checking
the drive has room. The old folder keeps its copy until you remove it from the same page (**Remove
the old copy…**), and **Move back to the default folder…** returns it. See
[Moving your data](storage.md#moving-your-data-to-another-folder).

**Requiring a token on this computer no longer locks the window out.** Switching on **Require a
token even on localhost** (Settings → Server) left the window without a token: everything it asked
was refused, and a reload showed the welcome screen as if your books were gone (they never were).
The window now keeps one of your tokens.

**Number boxes say what's wrong.** **Enter** takes the number you typed; text that isn't a number
stays in the box with a note saying so, instead of being cleared; and a box emptied where a number
is needed says **Required**.

**Fields and warnings easier to see.** Text boxes, menus and the segmented switches have an edge
you can see against every background, in both themes, and the red of delete buttons and error text
is darker, so the words on and in it are easy to read in every danger colour you can choose.

**Update checks while it runs.** The desktop app looks for a new version every six hours and when
the computer wakes, not only when it starts.

## 2026-10-19

**Sign in from another computer.** When JustWrite's server asks for a token (Settings → Server →
API access), a browser on another computer now gets a page asking for one, and keeps it once it's
accepted; before, it said it couldn't reach the server. See
[API access](headless-access.md#api-access-bearer-tokens).

**Draft from plan shows its progress where you write.** Its progress strip and **Context:** line
now sit under the editor, as every other AI action's do, and the other AI actions wait until it
finishes; before, its progress showed only in the AI tasks panel.

## 2026-10-18

**Your book's language.** **Settings → Project → Book language** says what the book is written in.
Its PDF, Word and EPUB files declare it — e-readers and Word then hyphenate and proof in it — and
write their own few words in it (Contents, Chapter 3) when JustWrite speaks it. Until now every EPUB
said English. A new book starts in the language of JustWrite's screens. See
[The book's language](import-and-export.md#the-books-language).

**Prose highlights.** **Writing settings** can underline filter words (*saw*, *felt*), adverbs and
AI-tell phrases as you write — the lists Analysis counts — each in its own colour, with the reason
on hover. Off until you turn them on; English books only. See
[Prose highlights](writing.md#prose-highlights).

**Spelling knows your story bible.** Your characters', places', objects' and groups' names are never
underlined as misspellings. In the desktop app, the editor's **Show browser menu** now opens a real
spelling menu — suggestions, **Add to dictionary**, cut, copy and paste — and the spellchecker
checks in your book's language. See [Spelling](writing.md#spelling).

**The daily target counts.** Home's **Today's session** card shows a bar toward the **daily target**
set in Settings → Project (0 hides it); before, the target was stored and nothing used it.

**Draft from plan — a scene from its Summary.** Turn on **AI scene drafting** for a book in
**Settings → Project**, write a scene's **Summary** in its Links panel, and **Draft from plan**
drafts the scene — from an empty scene's button, or from the cursor in the AI dropdown — as an
accept/reject change. It has its own row in Settings → AI, **Scene drafting**, so it can run on a
bigger model. See [Draft from plan](writing.md#draft-from-plan-a-scene-from-its-summary).

**The AI's words are marked.** Text the AI writes keeps a violet ink once you accept it. The words
you type are yours; **Mark as mine** clears the rest; **Writing settings → Highlight AI-written
text** turns the colour off. Settings → Project counts the AI's words still in the book. See
[AI-written text](writing.md#ai-written-text-the-ais-words-marked).

**No more English words on Spanish screens.** Import's chapter and note wording, the sidebar's
**+** buttons, the confidence chips on comp titles, the marker categories, the Architecture
documents in the sidebar, the choices in Writing settings, a new tag's name and the **Fine Press**
and **Ivory Press** theme names
now follow your language, and a new note's tag starts as your language's word ("nota" in
Spanish). In **Settings → Backups**, restoring a copy asks "Restore … from the previous autosave?"
instead of naming it "prev2". See [Backups and data](backups-and-data.md).

**Ready-made names in your language.** The statuses (Draft, Revise, Done…), the worldbuilding
categories, and on the AI page the features, actions, presets and the built-in providers now show
in your language — until you rename one, which then stays as you wrote it. A status or category
you add starts with your language's word, and a note whose tag you leave blank stays blank. See
[UI language](appearance.md#ui-language).

**Smaller fixes.** **Continue with direction…** has that one name everywhere — the AI page called it
"Guided continue" and the AI tasks list "Continue (guided)". A notice with a long button (in
Spanish, "Ejecutar configuración rápida") puts the button under its text instead of squeezing the
text into a narrow column, and the "Your graphics hardware changed" notice shows its title.
**Try tutorial project** now opens the tutorial book this version ships, also on a computer that
had an older JustWrite. Writing settings fits a phone's screen, the chapter footer says "Saved as you
type" (it claimed local storage), and the AI engine panel has no download settings any more —
downloads use several connections and retry by themselves.

## 2026-10-17

**All of JustWrite in Spanish.** With Spanish chosen in **Settings → Appearance**, every screen's
words are now Spanish — the AI setup and model screens, sync, settings and the error messages
included — where many were still English. A term means the same thing on every screen: a plot
beat stays **beat**, a strand of the plot board is a **hilo**, and counts put the number first
("3 notas").

## 2026-10-16

**Locations, objects and groups have sheets.** Under the description, a location now has
**Atmosphere & senses** and **History**; an object **Properties**, **History** and **Where it is
now**; a group **Goals & beliefs**, **Leadership** and **History**. Each row stays folded until
it has something in it, and its hint gives an example. The AI reads them with the entry — Ask
the book, and the writer actions in a scene set there. See
[Story bible](story-bible.md#locations). Your other devices ask to be updated before they sync
with this one again.

**Draft them with AI.** On a location, object or group, **Describe this location** (object, group)
— or **Draft with AI → From a description** in the header — drafts the sheet, and the description
if the page has none, from a line or two of yours and the book; you review each field before it's applied, and one Undo takes it back.
**Name ideas** (✨ beside the name) now works on these pages too, **Suggest locations…** on the
Locations list proposes places the book doesn't have yet, and a worldbuilding article's
**Draft with AI** writes its body from the title and summary, as a change you accept or reject.
They're routed under **Story-world sheets** in Settings → AI (the suggestions and names under
Brainstorm). See [Story bible](story-bible.md#locations) and
[Worldbuilding](worldbuilding.md#the-article-editor).

**Plan with AI.** A scene has a **Summary** now — in its **Links** panel, with **Summarize this
scene** to draft it from the prose — and the chapter's **Cards** show it instead of the prose's
first lines; the AI writing actions read it with the scene. On the **Plot board**, a strand's ✨
menu offers **Fill this template for my story** (each template beat's note, for your book),
**Suggest next beats** and **Plot twists** (new beat cards). Architecture's Fabula and Setting
have **Draft from the premise**. All of it is reviewed before it's saved, and routed under
**Planning** in Settings → AI. See [Writing → the Links panel](writing.md#the-links-panel),
[Plot and time](plot-and-time.md#the-ai-on-a-strand) and
[Worldbuilding and Architecture](worldbuilding.md#whats-in-each-document).

**Plot ideas in the editor.** The AI menu's **From the cursor** group has **Next plot beats** and
**Plot twists**: Brainstorm's ideas from where your prose ends, read with your book and the scene.
**Write this** on one drafts the next paragraphs in that direction, as Unstuck's does. See
[Writing](writing.md#whole-passage-actions).

**Fixed:** on the Plot board, a click outside the **Apply template** list now closes it.

**Fixed: books bigger than about 64 KB are saved again.** Once a book passed that size (a few
chapters), its changes were no longer saved — every save failed without a message. Saves now go
through at any size. The same fix covers long chats (Ask the book, **Talk to {Name}**).

**On a phone, the no-model message fits the phone.** Before a model is set, an AI feature on the
phone no longer points at Quick Setup and the model catalog, which a phone doesn't have: it says
to add an online provider with its Default model on the AI page and press **Set as default**.
See [Sync → On your phone](sync.md#on-your-phone).

## 2026-10-15

**Started and Deadline are dates.** In **Settings → Project** you now pick them from a calendar,
and they show in the interface language — on Home, "Deadline March 1, 2027", or with Spanish
chosen, "1 de marzo de 2027". A date typed in before today shows as it was typed until you pick
one.

**The connection page says why.** When the desktop app's server can't start because another
JustWrite server is using the data folder, or another program holds its port, the "Can't reach
the JustWrite server" page now says so, and **Retry** starts the server again. See
[Troubleshooting](troubleshooting.md#the-app-cant-reach-its-server).

**Restoring a backup on a device that syncs** keeps your other devices' newer work: this device
carries on in sync as a new device and keeps its own sync settings, and a backup from another sync
library is refused while it syncs. See [Sync](sync.md#good-to-know).

**Wide tables scroll inside their own box.** On a narrow window, a list wider than its card —
Characters, Chapters, Worldbuilding, the Analysis tables — now scrolls sideways inside the card
instead of pushing the whole page sideways.

**The model catalog fits its columns to their content.** In **AI → Providers & models**, the
License, Bench, Fit and Status columns and the buttons take only the room they need, each on one
line, and the Model column takes the rest. When the window is too narrow for all of them, the list
scrolls sideways inside its box, with its column names still pinned at the top. The tags under a
model's name wrap like the rest of its text, so at a 1280 px window the whole list fits.

**On a phone, the provider form's buttons wrap.** When a provider is open for editing, **Save
provider** moves to a second row instead of running off the screen.

**The writing year scrolls.** On **Analysis**, when the year is wider than its card it scrolls
sideways in its own box instead of hiding the latest weeks.

## 2026-10-13

**Times follow the interface language.** "5m ago", "2h ago" and the like — in the AI panels, the
chat history, Trash and the sidebar's saved time — now come out in the interface language: with
Spanish chosen, "hace 5 min". The dialogs, lists, errors and AI task names across the app now
follow the language too; their words stay English until their Spanish is reviewed.

**Dates and numbers follow the interface language.** Word counts, goals, percentages, backup and
version times, the timeline's days, the date picker's months and weekdays, and the day letters on
Home's and Analysis's charts now come out the interface language's way: with Spanish chosen,
"105.000 palabras", "13 oct", "15,7", "lunes".

**The Notes list sorts by date.** A note now keeps the moment it was last saved, so the Updated
column sorts by date, and its dates follow the interface language ("Oct 13", "13 oct").
A note saved before today shows its date as it was written until you next edit it.

## 2026-10-12

**Spanish reaches a few more buttons.** With Spanish as the interface language, the AI task bar's
Cancel, Retry and Dismiss, the AI chip's Cancel and the Updates heading now show in Spanish. The
rest of the AI and settings screens now follow the language too; their words stay English until
their Spanish is reviewed.

## 2026-10-11

**The editor's AI menu stays on screen.** With the sidebar open its left edge was cut off, and in a
narrow window most of it was off the screen. It now always opens where it fits, and works from the
keyboard: ↓ on the AI button opens it, the arrows move, Enter picks. The note under the editor no
longer reads "done in NaNs" for the first seconds after an AI action.

**Rewrite with direction… and Write dialogue….** Two new items in the editor's AI dropdown.
**Rewrite with direction…** rewrites the selection the way you say ("make her colder").
**Write dialogue…** writes an exchange at the cursor between the scene's characters, in the voices
their sheets describe — say what it's about first. See [Writing](writing.md#rewrite-with-direction).

**Rejecting AI changes works every time.** **Reject all** (and Reject on one change) could fail
with an error when the change ended the scene — a Continue at the end of a scene always does — and
with two or more changes pending, **Reject all** could fail and **Accept all** could leave some
pending. Both now settle every change.

**The AI knows the scene.** Rewrite, Expand, Tighten, Continue, Describe and Continue with
direction… now also read the scene they work in — your premise and main cast, the characters,
places and objects linked to the scene, its beats and notes, and how the previous scene ends — so
Continue stops inventing who's in the room. A line under the progress strip names what was sent.
Line edits don't change. See [Writing](writing.md#story-context-the-ai-knows-the-scene).

**Save to sheet.** Under an answer in a **Talk to {Name}** chat, **Save to sheet** drafts the
character's sheet from what they just said. You review every field before anything saves. See
[Story bible](story-bible.md#talk-to-a-character-interview-them-in-their-voice).

**Name ideas.** The ✨ beside a character's name lists names that fit the character and your
book, and never one your cast already uses. Thumbs-up the ones you like and click **More like
these**, as on Brainstorm; click a name to use it. See
[Brainstorm](brainstorm.md#name-and-title-ideas-where-you-use-them). Brainstorm's categories are now
translated too.

**Draft a character with AI.** On a character's page, describe them in the
**Describe this character** box and click **Draft**: the AI drafts the sheet —
identity, motivation, arc, voice, backstory — from your description and your
book. **Draft this section** on each section of the sheet drafts just that
section. **Fill from book** moved into the new **Draft with AI** menu in the
page header. You review every field before anything saves, and fields you've
written are never overwritten unless you tick them. See the
[Character sheet](character-sheet.md).

**Headers that fit.** A page header with many buttons no longer squeezes the name beside them —
a character's name box had shrunk to a sliver; the buttons now move to the row below. Window titles
no longer squeeze beside the AI chip either, and the chip shortens its model name instead of running
past the edge on a phone.

**Suggest characters.** **Suggest characters…** on the Characters list asks the
AI for people your book doesn't have yet — say what you're looking for, or leave
it blank. Tick the ones you want and add them to your story bible. See
[Story bible](story-bible.md#suggest-characters-who-is-this-book-missing).

**Status and Exclude from AI are kept.** The status you pick for a scene, character, location,
object or group, and the **Exclude from AI** box on those and on worldbuilding articles, were
forgotten when the book was reopened. They're saved now. And Exclude from AI now does what it says
for characters, locations, objects, groups and articles: Ask the book, Talk to a character and AI
drafting leave them out (it already worked for scenes, until the book was reopened). Earlier
settings couldn't be recovered, so set them again where you need them. See
[Keeping content out of AI context](ai-providers.md#keeping-content-out-of-ai-context).

**A scene's POV and "When" are kept.** The two answers you give in a scene's
[Links panel](writing.md#the-links-panel), the POV perspective and when the scene happens, were
lost the next time the book was saved and reopened. They're saved now. Earlier answers
couldn't be recovered, so set them again where you need them. If you sync, update JustWrite on
each device: one on an older version asks to be updated before it syncs again (for both of these
fixes).

---

## 2026-10-09

**The desktop app updates itself.** It checks for a new version when it starts; **Settings →
Updates** says when one is out, **Download** fetches it, and it installs when you quit the app —
or at once with **Restart now**. On a Mac, which can't install an unsigned update, it opens the
release page instead.

---

## 2026-10-08

**Export this book works for any title.** A book titled outside Western European letters —
in Japanese, say — failed to export with a server error. It now exports; the downloaded
`.zip` and the folder inside it carry the book's real title. See
[Backups and data](backups-and-data.md#export-this-book).

---

## v1.4.0 — 2026-09

**The engine's Update button works again — and updating is now safe.** It had quietly
stopped appearing in August, when llama.cpp changed the way it labels releases: the app
compared the new label against its own version numbering, concluded you were already up to
date, and said nothing. It now follows llama.cpp's official releases, and also offers the
build this version of the app is tested with, whichever is newer. More importantly, an
update can no longer leave you unable to load models. Before a new engine replaces the one
you have, the app checks two things — that it starts, and that it accepts the settings the
app launches models with. If it fails either, your current engine is kept and the message
names what it refused; your old engine is removed only once the new one is working. If the
newer release has no download for your kind of graphics card, the app tells you and changes
nothing at all. Updates work again on **AMD** cards, whose download files had been renamed
upstream. See [Models](models.md) for the details.

**A newer engine is not automatically a faster one**, so Update stays your deliberate click.
New installs get the engine build this release is tested with. Update also offers that
build to an existing install whenever it is newer than yours, even when llama.cpp's official
releases have not caught up with it. Hover the button to see whether it is offering the
tested build or the newest official release. An existing install keeps whatever engine it
already has until you update.

**Entity sweep really uses its shape now.** Actions that carry a JSON schema were sending it
to the local engine in a form the engine silently ignores, so the answer was only required to
be valid JSON rather than to match the expected fields. The schema now reaches the engine and
is enforced.

## v1.3.0 — 2026-07

**Move a book between computers — or share it.** New **Export this book** / **Import a book** buttons in Settings → Backups save a book as a single `.zip` (named after it) and read one back as a **new** project — the whole thing, images and all. Import the same file as many times as you like; each becomes its own book. And every save now lets you **choose where it goes** — defaulting to your data folder and remembering where you last saved — for the per-book export, the whole-workspace backup, and the data-folder location alike.

**Manage your autosaves.** Settings → Backups can now point the on-disk autosave at any folder you choose (it defaults to your data folder, remembers the choice, and moves your existing autosaves along), and you can delete autosaves you no longer need — one at a time or all at once. (Any folder you've changed also survives a workspace reset now.)

## v1.2.0 — 2026-07

**A new tutorial novel — *The Ninth Facet*.** "Try tutorial project" now opens a fresh sample: a magitech guild-adventure with a full cast, locations, objects, factions, a worldbuilding bible, plot strands, and real full-length chapters — a richer starting point for exploring every screen than the old sample. It works exactly as before: a normal editable project, created on demand, deletable and re-creatable any time.

*(Under the hood the sample is now just data — an exported book folder shipped with the app — so samples can be swapped or added without code changes.)*

## v1.1.0 — 2026-07

**+ New opens the new entry directly — name ready to type.** Creating a character, location, object, group, note, or narrative strand no longer pops up a box asking for a name first. **+ New** (from a list header or the sidebar) makes the entry and takes you straight to its page with its name selected — just start typing to replace the placeholder, then fill in the rest. New chapters work the same way, landing in the editor with the title focused. Changed your mind? It's an ordinary row you can delete, or press Ctrl/⌘ + Z on its page to undo the creation. (Worldbuilding articles still ask first — that popup is where you pick the article's category.)

## v1.0.0 — 2026-06

**Ask the book knows your story bible.** Grounded chat used to see only your
prose — "who is X?" came back as a guess from scenes. Now every character,
location, object, group, worldbuilding article, note, strand, and
architecture doc is part of the searchable index as a "Story Bible" entry,
naming an entity in your question pins its entry into the answer's sources
(marked "pinned" in the citations), scene excerpts carry their linked
characters/location/objects/POV even when the prose doesn't name them, and
clicking a Story Bible citation jumps to that entity's page. If you already
built a book index, open Ask the book and hit **Rebuild** once (it also
self-heals on the next index update) — the embedding models now apply their
proper task instructions, which sharpens search for everyone.

**Imports split into real scenes.** Importing a manuscript now detects the
standard scene-break markers ("* * *", "#", a horizontal rule) and creates
one scene per section instead of one giant scene per chapter — so search,
chat excerpts, and scene links work at the right grain on imported books.

**The entity sweep keeps its receipts.** Accepting a proposed character,
location, or object now also links it to the scenes it appears in (the
Relations graph fills in instead of staying empty), and character proposals
include the nicknames/aliases the text uses — editable before you accept.
For the entities you already have, a new **Link scenes** button on the
Analysis page runs a no-AI pass over the whole book and proposes every
missing scene link for review — nothing applies until you confirm.

**A welcome screen on first run.** A fresh JustWrite now opens on a welcome
page: start a new project or the tutorial book with one click, see what the
app does at a glance, and — if you want the AI features — run Quick Setup
(local, uses your PC) or connect an online provider right from there. It
shows once; reopen it anytime from the Help page.

**Scene notes beside the editor.** The Notes buttons on a scene and on the
chapter toolbar now open a panel docked next to your prose instead of
navigating away: jot a note in the composer and it's pinned to that scene,
click a note to edit it in place, and delete with the trash button (it moves
to Trash, so nothing is lost by accident). Managing the full notes list stays
in the Notes view ("Manage all notes ↗").

**Page-related undo.** Ctrl/⌘ + Z now undoes changes to the page you're on — character edits on Characters, manuscript changes on Chapters — and never silently reverts something from another page. Each page's redo also survives work you do elsewhere, and the title-bar Undo button tells you when the current page has nothing to undo. Redoing an undone prose change works with the scene editor open, too — previously the open editor could quietly swallow the redo.

**In-app help drawer.** Every pane now has a small `?` next to its title that opens a side panel with the docs for that surface — no more hunting the marketing site.

**Keyboard shortcut cheatsheet (Ctrl/⌘ + /).** A quick reference overlay you can summon from anywhere.

**What's new modal.** When you open JustWrite after an upgrade, a modal shows you what changed in the new version — dismissible, and keyed to the version number so it only shows once.

**Tutorial project.** The **sidebar's project switcher menu → "Try tutorial project"** opens *The Ninth Facet* — a complete sample novel (characters, locations, objects, groups, worldbuilding, chapters, plot strands, events) created on demand, so a fresh install starts clean on the welcome screen instead. It is a real project you can poke at without touching your own work; delete it from the same switcher when you're done, and the button brings it back fresh any time.

**Better empty states.** Every catalog (Characters / Locations / Objects / Groups / Notes / Strands / Worldbuilding) now explains what the surface is for and where it connects, rather than just "No characters yet."

**Clearer disabled buttons.** Greyed-out actions (Render, Export, AI scans) now explain their prerequisite when you hover them — no more guessing why a button won't click.

**Command palette help mode.** The `Ctrl/⌘ + P` palette now lists every help doc — type a doc title or keyword and hit Enter to open the drawer directly.

**Tooltip enrichment.** Every shortcut-bound action surfaces its shortcut in the tooltip. AI actions name what call they make. Studio playback controls and the voice preview button now have tooltips at all.

---

## Earlier

For the full history of shipped features, dip into the [Roadmap](roadmap.md) and [AI features roadmap](ai-features-roadmap.md) — items annotated with a ship date.

---

*This page is also what **Settings → Updates** shows in-app: your current version
plus these release notes. In the desktop app the panel also says whether a newer
version is out — **Download** fetches it, and it installs when you quit the app.*
