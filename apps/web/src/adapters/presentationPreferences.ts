import { packIdSchema } from '../presentation/contracts';

export interface PresentationPreferences {
  localeId?: string;
  themeId?: string;
}
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const PREFERENCE_KEY = 'haeram-soccor:presentation';

/** Browser presentation is independent of slot ownership and checkpoint persistence. */
export class PresentationPreferencesStore {
  private session: PresentationPreferences = {};
  sessionOnly = false;
  constructor(private readonly storage: () => PreferenceStorage = () => localStorage) {}

  read(): PresentationPreferences {
    let raw: string | null;
    try {
      raw = this.storage().getItem(PREFERENCE_KEY);
    } catch {
      this.sessionOnly = true;
      return { ...this.session };
    }
    if (raw) {
      try {
        const value: unknown = JSON.parse(raw);
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const candidate = value as PresentationPreferences;
          this.session = {
            ...(packIdSchema.safeParse(candidate.localeId).success
              ? { localeId: candidate.localeId }
              : {}),
            ...(packIdSchema.safeParse(candidate.themeId).success
              ? { themeId: candidate.themeId }
              : {}),
          };
        }
      } catch {
        /* Malformed settings fall back through the registries. */
      }
    }
    return { ...this.session };
  }

  write(preferences: Required<PresentationPreferences>): boolean {
    this.session = { localeId: preferences.localeId, themeId: preferences.themeId };
    try {
      this.storage().setItem(PREFERENCE_KEY, JSON.stringify(this.session));
      this.sessionOnly = false;
      return true;
    } catch {
      this.sessionOnly = true;
      return false;
    }
  }
}
