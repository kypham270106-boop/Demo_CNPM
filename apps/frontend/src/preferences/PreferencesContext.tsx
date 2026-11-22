import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import api, { getAccessToken } from "../services/api";
import { translate, type Language } from "./translations";
import "./preferences.css";

type Preferences = { theme: "light" | "dark"; language: Language };
const defaults: Preferences = { theme: "light", language: "vi" };

function normalize(value: Partial<Preferences>): Preferences {
  return {
    theme: value.theme === "dark" ? "dark" : "light",
    language: value.language === "en" ? "en" : "vi",
  };
}

function readCache(key: string): Preferences {
  try { return normalize(JSON.parse(localStorage.getItem(key) || "{}")); }
  catch { return defaults; }
}

function accountKey() {
  try {
    const user = JSON.parse(localStorage.getItem("user") || sessionStorage.getItem("user") || "{}");
    return `mobility.preferences.${user.id || "guest"}`;
  } catch { return "mobility.preferences.guest"; }
}

const Context = createContext<{
  preferences: Preferences;
  loading: boolean;
  saving: boolean;
  error: boolean;
  reload: () => void;
  save: (patch: Partial<Preferences>) => Promise<void>;
  t: (text: string) => string;
} | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  useLocation(); // Recheck the account after sign-in, sign-out, and navigation.
  const token = getAccessToken();
  const key = token ? accountKey() : "mobility.preferences.guest";
  const currentKey = useRef(key);
  currentKey.current = key;
  const [preferences, setPreferences] = useState(() => readCache(key));
  const [loading, setLoading] = useState(Boolean(token));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPreferences(readCache(key));
    setError(false);
    setLoading(Boolean(token));
    if (token) {
      api.get<Preferences>("/settings").then(({ data }) => {
        if (cancelled) return;
        const next = normalize(data);
        setPreferences(next);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* API remains authoritative. */ }
      }).catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; };
  }, [key, token, revision]);

  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
    document.documentElement.lang = preferences.language;
  }, [preferences]);

  const save = async (patch: Partial<Preferences>) => {
    const savingKey = key;
    setSaving(true);
    try {
      const { data } = await api.patch<Preferences>("/settings", patch);
      if (currentKey.current !== savingKey) return;
      const next = normalize(data);
      setPreferences(next);
      setError(false);
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Saved on server. */ }
    } finally { setSaving(false); }
  };

  return <Context.Provider value={{ preferences, loading, saving, error,
    reload: () => setRevision(value => value + 1), save,
    t: text => translate(text, preferences.language),
  }}>{children}</Context.Provider>;
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferencesProvider is required");
  return value;
}
