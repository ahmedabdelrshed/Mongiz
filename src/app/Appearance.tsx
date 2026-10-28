import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readStored, writeStored } from "../shared/storage/storage";
import {
  SOUND_KEY,
  playSound,
  setSoundsEnabled,
  soundsEnabled,
  syncSounds,
} from "../shared/ui/sounds";

export type ThemePreference = "light" | "dark" | "system";
export const APPEARANCE_KEY = "taskflow:v1:appearance";
export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system";
const systemTheme = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const AppearanceContext = createContext({
  preference: "system" as ThemePreference,
  setPreference: (_value: ThemePreference) => {},
  error: "",
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setValue] = useState<ThemePreference>(() =>
    readStored(APPEARANCE_KEY, "system", isThemePreference),
  );
  const [deviceTheme, setDeviceTheme] = useState(systemTheme);
  const [error, setError] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setDeviceTheme(media.matches ? "dark" : "light");
    const sync = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null)
        setValue(readStored(APPEARANCE_KEY, "system", isThemePreference));
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", sync);
    };
  }, []);
  useEffect(() => {
    const theme = preference === "system" ? deviceTheme : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [preference, deviceTheme]);
  const setPreference = (value: ThemePreference) => {
    setValue(value);
    setError(
      writeStored(APPEARANCE_KEY, value)
        ? ""
        : "Appearance changed for this visit. Browser storage is unavailable.",
    );
  };
  return (
    <AppearanceContext.Provider value={{ preference, setPreference, error }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function AppearanceSettings() {
  const { preference, setPreference, error } = useContext(AppearanceContext);
  const [sound, setSound] = useState(soundsEnabled);
  const [soundError, setSoundError] = useState("");
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === SOUND_KEY || event.key === null) setSound(syncSounds());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  return (
    <section
      className="panel appearance-panel"
      aria-labelledby="appearance-title"
    >
      <div>
        <h2 id="appearance-title">Appearance</h2>
        <p className="muted">Make this workspace feel like yours.</p>
      </div>
      <div className="appearance-options" role="group" aria-label="Color theme">
        {(
          [
            { value: "light", label: "Light", icon: Sun },
            { value: "dark", label: "Dark", icon: Moon },
            { value: "system", label: "System", icon: Monitor },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={preference === value}
            onClick={() => setPreference(value)}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <label>
        <input
          type="checkbox"
          checked={sound}
          onChange={(event) => {
            const next = event.target.checked;
            setSound(next);
            setSoundError(
              setSoundsEnabled(next)
                ? ""
                : "Sound preference changed for this visit. Browser storage is unavailable.",
            );
            if (next) playSound("success");
          }}
        />
        Sound feedback for completed actions
      </label>
      {soundError && (
        <p role="status" className="muted">
          {soundError}
        </p>
      )}
      {error && (
        <p role="status" className="muted">
          {error}
        </p>
      )}
    </section>
  );
}
