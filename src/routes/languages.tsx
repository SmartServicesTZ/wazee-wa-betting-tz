import { Check, Languages as LanguagesIcon } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/app-shell";
import { subscribeToAuth } from "../lib/firebase";
import type { User } from "firebase/auth";

export const Route = createFileRoute("/languages")({ component: LanguagesPage });

type LanguageOption = { code: string; name: string; nativeName: string; flag: string };
const languageOptions: LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇬🇧" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", flag: "🇹🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italian", nativeName: "Italiano", flag: "🇮🇹" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "pt", name: "Portuguese", nativeName: "Português", flag: "🇵🇹" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili", flag: "🇹🇿" },
  { code: "ru", name: "Russian", nativeName: "Русский", flag: "🇷🇺" },
  { code: "ar", name: "Arabic", nativeName: "العربية", flag: "🇸🇦" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands", flag: "🇳🇱" },
  { code: "fa", name: "Persian", nativeName: "فارسی", flag: "🇮🇷" },
  { code: "ko", name: "Korean", nativeName: "한국어", flag: "🇰🇷" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", flag: "🇮🇳" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", flag: "🇧🇩" },
  { code: "th", name: "Thai", nativeName: "ภาษาไทย", flag: "🇹🇭" },
];

function LanguagesPage() {
  const [user, setUser] = useState<User | null>(null);
  const [selected, setSelected] = useState("sw");
  useEffect(() => subscribeToAuth(setUser), []);
  useEffect(() => {
    const saved = window.localStorage.getItem("wazee-language");
    if (saved && languageOptions.some((language) => language.code === saved)) setSelected(saved);
  }, []);
  const selectLanguage = (code: string) => {
    setSelected(code);
    window.localStorage.setItem("wazee-language", code);
  };
  return (
    <AppShell user={user}>
      <div className="page narrow language-page">
        <div className="page-title">
          <div>
            <span className="eyebrow">PREFERENCES</span>
            <h1>Chagua lugha</h1>
            <p>Chagua lugha unayopendelea. Tafsiri kamili itaonekana pale itakapowashwa kwenye app.</p>
          </div>
          <LanguagesIcon size={32} className="page-title-icon" />
        </div>
        <section className="language-list" aria-label="Lugha zinazopatikana">
          {languageOptions.map((language) => {
            const active = selected === language.code;
            return (
              <button
                type="button"
                className={`language-row ${active ? "is-selected" : ""}`}
                key={language.code}
                onClick={() => selectLanguage(language.code)}
                aria-pressed={active}
              >
                <span className="language-flag" aria-hidden="true">
                  {language.flag}
                </span>
                <span className="language-copy">
                  <b>{language.nativeName}</b>
                  <small>{language.name}</small>
                </span>
                {active && <Check size={19} aria-label="Lugha iliyochaguliwa" />}
              </button>
            );
          })}
        </section>
        <p className="fine-print">Uchaguzi huu unahifadhiwa kwenye kifaa hiki pekee kwa sasa.</p>
      </div>
    </AppShell>
  );
}
