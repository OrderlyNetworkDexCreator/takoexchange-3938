import type { ReactNode } from "react";
import {
  LocaleCode,
  LocaleEnum,
  LocaleProvider,
  defaultLanguages,
  importLocaleJsonModule,
} from "@orderly.network/i18n";
import type { AsyncResources, LocaleJsonModule } from "@orderly.network/i18n";
import { getRuntimeConfigArray } from "@/utils/runtime-config";
import { getUserLanguage } from "@/utils/seo";
import extendEnLocale from "../../locales/en.json";

// The Orderly i18n SDK persists the user's chosen language here (localStorage + cookie)
// via its i18next languageDetector. We read the same key so a previously chosen language
// always wins over auto-detection.
const LANGUAGE_STORAGE_KEY = "orderly_i18nLng";

const getStoredLanguage = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const fromStorage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (fromStorage) return fromStorage;
    const cookieMatch = document.cookie.match(
      /(?:^|;\s*)orderly_i18nLng=([^;]+)/,
    );
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  } catch {
    return null;
  }
};

const baseLoaders = import.meta.glob<LocaleJsonModule>(
  "/node_modules/@orderly.network/i18n/dist/locales/*.json",
);

const extendLoaders = import.meta.glob<LocaleJsonModule>(
  "../../locales/*.json",
);

async function loadBase(lang: LocaleCode): Promise<Record<string, string>> {
  const key = `/node_modules/@orderly.network/i18n/dist/locales/${lang}.json`;
  return importLocaleJsonModule(baseLoaders[key]);
}

async function loadExtend(lang: LocaleCode): Promise<Record<string, string>> {
  const key = `../../locales/${lang}.json`;
  return importLocaleJsonModule(extendLoaders[key]);
}

const resources: AsyncResources = async (lang) => {
  if (lang === LocaleEnum.en) {
    return extendEnLocale;
  }

  const [base, extend] = await Promise.all([loadBase(lang), loadExtend(lang)]);
  return { ...base, ...extend };
};

const getAvailableLanguages = (): string[] => {
  const languages = getRuntimeConfigArray("VITE_AVAILABLE_LANGUAGES");

  return languages.length > 0 ? languages : ["en"];
};

const getDefaultLanguage = (): LocaleCode => {
  const availableLanguages = getAvailableLanguages();

  // 1) A previously saved manual choice ALWAYS wins (localStorage / cookie).
  const storedLanguage = getStoredLanguage();
  if (storedLanguage && availableLanguages.includes(storedLanguage)) {
    return storedLanguage as LocaleCode;
  }

  // 2) Explicit ?lang= override in the URL (e.g. shared localized links).
  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get("lang");
    if (langParam && availableLanguages.includes(langParam)) {
      return langParam as LocaleCode;
    }
  }

  // 3) Auto-detect from the browser (with zh-Hant -> "tc" mapping).
  const userLanguage = getUserLanguage();
  if (availableLanguages.includes(userLanguage)) {
    return userLanguage as LocaleCode;
  }

  // 4) Fallback.
  return "en" as LocaleCode;
};

const onLanguageChanged = async (lang: LocaleCode) => {
  if (typeof window !== "undefined") {
    // Persist the manual choice (the SDK also caches this key; we set it
    // defensively so getDefaultLanguage() reliably honors it next time).
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors (private mode, etc.)
    }

    const url = new URL(window.location.href);
    if (lang === LocaleEnum.en) {
      url.searchParams.delete("lang");
    } else {
      url.searchParams.set("lang", lang);
    }
    window.history.replaceState({}, "", url.toString());
  }
};

type OrderlyLocaleProviderProps = {
  children: ReactNode;
};

export const OrderlyLocaleProvider = (props: OrderlyLocaleProviderProps) => {
  const defaultLanguage = getDefaultLanguage();
  const availableLanguages = getAvailableLanguages();
  const filteredLanguages = defaultLanguages.filter((lang) =>
    availableLanguages.includes(lang.localCode),
  );

  return (
    <LocaleProvider
      resources={resources}
      locale={defaultLanguage}
      languages={filteredLanguages}
      onLanguageChanged={onLanguageChanged}
    >
      {props.children}
    </LocaleProvider>
  );
};
