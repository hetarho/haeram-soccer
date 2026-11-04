/**
 * Club detail widget (→WEB-15, WEB-58): one dialog for any club, 개요 · 선수단 · 코치진 · 역사.
 * - `ClubDetailHost`: mount once in the game shell; opens on `openClub` / `ClubLink`.
 * - `ClubDetail`: the dialog itself, for an opener with no career in play (the takeover list),
 *   which supplies its own 개요 and a profile read (`client.startClubProfile`).
 */
export { ClubDetail, type ClubDetailTab } from './ui/ClubDetail';
export { ClubDetailHost } from './ui/ClubDetailHost';
