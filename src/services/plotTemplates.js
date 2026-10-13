// Plot-structure templates. Each one is a strand seed plus an ordered
// list of beat labels with short notes, named by their i18n keys: the picker shows them in the
// interface language, and applyTemplate() writes them in it (ruled 2026-10-13 — a template's
// beats follow the app's language when applied). `applyTemplate()` materializes
// the template into the project store via the existing addStrand /
// addStrandBeat actions, returning the new strand id so the caller can
// scroll to it.
//
// Beats start unassigned (chapterId: null) — the writer drags them onto
// chapters on the plot board.

import { t } from "../i18n/index.js";

export const PLOT_TEMPLATES = {
  "three-act": {
    id: "three-act",
    labelKey: "plotBoard.template.threeAct.label",
    blurbKey: "plotBoard.template.threeAct.blurb",
    color: "oklch(0.66 0.13 250)",
    beats: [
      { labelKey: "plotBoard.template.threeAct.beat.hook.label", noteKey: "plotBoard.template.threeAct.beat.hook.note" },
      { labelKey: "plotBoard.template.threeAct.beat.incitingIncident.label", noteKey: "plotBoard.template.threeAct.beat.incitingIncident.note" },
      { labelKey: "plotBoard.template.threeAct.beat.firstPlotPoint.label", noteKey: "plotBoard.template.threeAct.beat.firstPlotPoint.note" },
      { labelKey: "plotBoard.template.threeAct.beat.midpoint.label", noteKey: "plotBoard.template.threeAct.beat.midpoint.note" },
      { labelKey: "plotBoard.template.threeAct.beat.secondPlotPoint.label", noteKey: "plotBoard.template.threeAct.beat.secondPlotPoint.note" },
      { labelKey: "plotBoard.template.threeAct.beat.climax.label", noteKey: "plotBoard.template.threeAct.beat.climax.note" },
      { labelKey: "plotBoard.template.threeAct.beat.resolution.label", noteKey: "plotBoard.template.threeAct.beat.resolution.note" },
    ],
  },

  "five-act": {
    id: "five-act",
    labelKey: "plotBoard.template.fiveAct.label",
    blurbKey: "plotBoard.template.fiveAct.blurb",
    color: "oklch(0.62 0.14 30)",
    beats: [
      { labelKey: "plotBoard.template.fiveAct.beat.exposition.label", noteKey: "plotBoard.template.fiveAct.beat.exposition.note" },
      { labelKey: "plotBoard.template.fiveAct.beat.incitingMoment.label", noteKey: "plotBoard.template.fiveAct.beat.incitingMoment.note" },
      { labelKey: "plotBoard.template.fiveAct.beat.risingAction.label", noteKey: "plotBoard.template.fiveAct.beat.risingAction.note" },
      { labelKey: "plotBoard.template.fiveAct.beat.turn.label", noteKey: "plotBoard.template.fiveAct.beat.turn.note" },
      { labelKey: "plotBoard.template.fiveAct.beat.climax.label", noteKey: "plotBoard.template.fiveAct.beat.climax.note" },
      { labelKey: "plotBoard.template.fiveAct.beat.fallingAction.label", noteKey: "plotBoard.template.fiveAct.beat.fallingAction.note" },
      { labelKey: "plotBoard.template.fiveAct.beat.denouement.label", noteKey: "plotBoard.template.fiveAct.beat.denouement.note" },
    ],
  },

  "save-the-cat": {
    id: "save-the-cat",
    labelKey: "plotBoard.template.saveTheCat.label",
    blurbKey: "plotBoard.template.saveTheCat.blurb",
    color: "oklch(0.74 0.13 150)",
    beats: [
      { labelKey: "plotBoard.template.saveTheCat.beat.openingImage.label", noteKey: "plotBoard.template.saveTheCat.beat.openingImage.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.themeStated.label", noteKey: "plotBoard.template.saveTheCat.beat.themeStated.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.setUp.label", noteKey: "plotBoard.template.saveTheCat.beat.setUp.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.catalyst.label", noteKey: "plotBoard.template.saveTheCat.beat.catalyst.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.debate.label", noteKey: "plotBoard.template.saveTheCat.beat.debate.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.breakIntoTwo.label", noteKey: "plotBoard.template.saveTheCat.beat.breakIntoTwo.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.bStory.label", noteKey: "plotBoard.template.saveTheCat.beat.bStory.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.funAndGames.label", noteKey: "plotBoard.template.saveTheCat.beat.funAndGames.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.midpoint.label", noteKey: "plotBoard.template.saveTheCat.beat.midpoint.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.badGuysCloseIn.label", noteKey: "plotBoard.template.saveTheCat.beat.badGuysCloseIn.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.allIsLost.label", noteKey: "plotBoard.template.saveTheCat.beat.allIsLost.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.darkNightOfTheSoul.label", noteKey: "plotBoard.template.saveTheCat.beat.darkNightOfTheSoul.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.breakIntoThree.label", noteKey: "plotBoard.template.saveTheCat.beat.breakIntoThree.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.finale.label", noteKey: "plotBoard.template.saveTheCat.beat.finale.note" },
      { labelKey: "plotBoard.template.saveTheCat.beat.finalImage.label", noteKey: "plotBoard.template.saveTheCat.beat.finalImage.note" },
    ],
  },

  "heros-journey": {
    id: "heros-journey",
    labelKey: "plotBoard.template.herosJourney.label",
    blurbKey: "plotBoard.template.herosJourney.blurb",
    color: "oklch(0.72 0.14 70)",
    beats: [
      { labelKey: "plotBoard.template.herosJourney.beat.ordinaryWorld.label", noteKey: "plotBoard.template.herosJourney.beat.ordinaryWorld.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.callToAdventure.label", noteKey: "plotBoard.template.herosJourney.beat.callToAdventure.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.refusalOfTheCall.label", noteKey: "plotBoard.template.herosJourney.beat.refusalOfTheCall.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.meetingTheMentor.label", noteKey: "plotBoard.template.herosJourney.beat.meetingTheMentor.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.crossingTheThreshold.label", noteKey: "plotBoard.template.herosJourney.beat.crossingTheThreshold.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.testsAlliesEnemies.label", noteKey: "plotBoard.template.herosJourney.beat.testsAlliesEnemies.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.approachToTheInmostCave.label", noteKey: "plotBoard.template.herosJourney.beat.approachToTheInmostCave.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.ordeal.label", noteKey: "plotBoard.template.herosJourney.beat.ordeal.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.reward.label", noteKey: "plotBoard.template.herosJourney.beat.reward.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.theRoadBack.label", noteKey: "plotBoard.template.herosJourney.beat.theRoadBack.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.resurrection.label", noteKey: "plotBoard.template.herosJourney.beat.resurrection.note" },
      { labelKey: "plotBoard.template.herosJourney.beat.returnWithTheElixir.label", noteKey: "plotBoard.template.herosJourney.beat.returnWithTheElixir.note" },
    ],
  },

  "story-circle": {
    id: "story-circle",
    labelKey: "plotBoard.template.storyCircle.label",
    blurbKey: "plotBoard.template.storyCircle.blurb",
    color: "oklch(0.70 0.12 200)",
    beats: [
      { labelKey: "plotBoard.template.storyCircle.beat.you.label", noteKey: "plotBoard.template.storyCircle.beat.you.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.need.label", noteKey: "plotBoard.template.storyCircle.beat.need.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.go.label", noteKey: "plotBoard.template.storyCircle.beat.go.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.search.label", noteKey: "plotBoard.template.storyCircle.beat.search.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.find.label", noteKey: "plotBoard.template.storyCircle.beat.find.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.take.label", noteKey: "plotBoard.template.storyCircle.beat.take.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.return.label", noteKey: "plotBoard.template.storyCircle.beat.return.note" },
      { labelKey: "plotBoard.template.storyCircle.beat.change.label", noteKey: "plotBoard.template.storyCircle.beat.change.note" },
    ],
  },
};

export const TEMPLATE_ORDER = [
  "three-act",
  "five-act",
  "save-the-cat",
  "heros-journey",
  "story-circle",
];

/**
 * Materialize a template into the project store. Creates a new strand
 * with the template's name + color + blurb, then appends every beat as
 * an unassigned beat (chapterId: null). Returns the new strand id.
 *
 * @param {ReturnType<typeof import("../stores/project.js").useProjectStore>} project
 * @param {string} templateId
 * @param {{ name?: string }} opts — override the new strand's name
 */
export function applyTemplate(project, templateId, opts = {}) {
  const tpl = PLOT_TEMPLATES[templateId];
  if (!tpl) return null;
  const strandId = project.addStrand({
    name: opts.name || t(tpl.labelKey),
    color: tpl.color,
    blurb: t(tpl.blurbKey),
    body: "",
    status: "open",
  });
  for (const b of tpl.beats) {
    project.addStrandBeat(strandId, {
      label: t(b.labelKey),
      note: t(b.noteKey),
      chapterId: null,
      sceneId: null,
    });
  }
  return strandId;
}
