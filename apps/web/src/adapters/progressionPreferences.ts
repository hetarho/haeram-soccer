const KEY = 'haeram-soccor:progression-explanation';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** A browser preference, shared across careers and both switch directions. */
export class ProgressionPreferences {
  private skipped = false;
  constructor(private readonly storage: () => PreferenceStorage = () => localStorage) {}
  skipExplanation() {
    try {
      this.skipped ||= this.storage().getItem(KEY) === 'skip';
    } catch {
      /* Storage-denied browsers retain this session's choice. */
    }
    return this.skipped;
  }
  remember() {
    this.skipped = true;
    try {
      this.storage().setItem(KEY, 'skip');
    } catch {
      /* The successful choice remains available in this session. */
    }
  }
}
export const progressionPreferences = new ProgressionPreferences();
