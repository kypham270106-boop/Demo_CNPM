import { useState } from "react";
import { Moon, Sun, Languages, Settings } from "lucide-react";
import { usePreferences } from "./PreferencesContext";

export default function SettingsPanel() {
  const { preferences, loading, saving, error, reload, save, t } = usePreferences();
  const [message, setMessage] = useState<"saved" | "error" | "">("");

  const update = async (patch: Parameters<typeof save>[0]) => {
    setMessage("");
    try { await save(patch); setMessage("saved"); }
    catch { setMessage("error"); }
  };

  return (
    <section className="preferences-panel" aria-labelledby="preferences-title">
      <header className="preferences-heading">
        <Settings size={26} aria-hidden="true" />
        <div><h1 id="preferences-title">{t("Cài đặt")}</h1>
          <p>{t("Tùy chỉnh giao diện và ngôn ngữ theo sở thích của bạn.")}</p></div>
      </header>
      {error && <div className="preferences-feedback" role="alert">
        <p>{t("Không thể tải cài đặt. Vui lòng thử lại.")}</p>
        <button onClick={reload} disabled={loading}>{t("Thử lại")}</button>
      </div>}
      {loading && <p role="status">{t("Đang tải cài đặt...")}</p>}
      <fieldset disabled={loading || saving || error} className="preferences-group">
        <legend>{t("Giao diện")}</legend>
        <p>{t("Chọn chế độ sáng hoặc tối cho ứng dụng.")}</p>
        <div className="preferences-options">
          {([ ["light", "Sáng", Sun], ["dark", "Tối", Moon] ] as const).map(([value, label, Icon]) => (
            <label key={value} className={`preferences-option ${preferences.theme === value ? "selected" : ""}`}>
              <input type="radio" name="theme" value={value} checked={preferences.theme === value}
                onChange={() => update({ theme: value })} />
              <Icon size={22} aria-hidden="true" /><span>{t(label)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset disabled={loading || saving || error} className="preferences-group">
        <legend><Languages size={20} aria-hidden="true" /> {t("Ngôn ngữ")}</legend>
        <p>{t("Chọn ngôn ngữ hiển thị.")}</p>
        <div className="preferences-options">
          {([ ["vi", "Tiếng Việt"], ["en", "English"] ] as const).map(([value, label]) => (
            <label key={value} className={`preferences-option ${preferences.language === value ? "selected" : ""}`}>
              <input type="radio" name="language" value={value} checked={preferences.language === value}
                onChange={() => update({ language: value })} />
              <span lang={value}>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="preferences-status" role={message === "error" ? "alert" : "status"}>
        {saving ? t("Đang lưu...") : message === "saved" ? t("Đã lưu cài đặt.") : message === "error"
          ? t("Không thể lưu cài đặt. Vui lòng thử lại.") : t("Thay đổi được lưu tự động vào tài khoản của bạn.")}
      </p>
    </section>
  );
}
