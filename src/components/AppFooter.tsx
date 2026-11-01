import { useI18n } from "../i18n/I18nContext";

export function AppFooter() {
  const { t } = useI18n();

  return (
    <footer className="app-footer">
      <p className="app-footer-by">{t("appBy")}</p>
      <p className="app-footer-meta">
        {t("appCopyright")} · {t("appLicense")}
      </p>
      <p className="app-footer-note">{t("appLicenseNote")}</p>
    </footer>
  );
}
