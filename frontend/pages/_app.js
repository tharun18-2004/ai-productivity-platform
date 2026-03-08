import { useEffect } from "react";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const applyTheme = () => {
      const nextTheme = localStorage.getItem("app_theme") || "dark";
      document.documentElement.dataset.theme =
        nextTheme === "light" ? "light" : "dark";
    };

    applyTheme();
    window.addEventListener("app-theme-change", applyTheme);
    return () => {
      window.removeEventListener("app-theme-change", applyTheme);
    };
  }, []);

  return <Component {...pageProps} />;
}
