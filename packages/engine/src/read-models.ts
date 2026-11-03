/** Explicit writer maintenance; reads of either model remain pure. */
import type { World } from '../../contracts/src/types';
import { initializeNewsJournal, refreshNewsJournal } from './news';
import { initializeCareerReads, refreshCareerReads } from './career-reads';
import { eventsInSeason, matchesInSeason } from './season-index';
export function initializeReadModels(w: World) {
  initializeNewsJournal(w);
  initializeCareerReads(w);
  refreshReadModels(w);
  eventsInSeason(w, w.year);
  matchesInSeason(w, w.year);
}
export function refreshReadModels(w: World) {
  refreshNewsJournal(w);
  refreshCareerReads(w);
}

/** Missing or lagging optional summaries are reconstructed/caught up only by a writer. */
export function needsReadModels(w: World) {
  const j = w.newsJournal,
    s = w.careerReads;
  return (
    !j ||
    !s ||
    j.matches !== w.ownMatches.length ||
    j.events !== w.events.length ||
    j.year !== w.year ||
    s.matches !== w.ownMatches.length ||
    s.events !== w.events.length ||
    s.history !== w.history.length ||
    s.year !== w.year
  );
}
