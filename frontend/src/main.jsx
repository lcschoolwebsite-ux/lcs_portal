import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './i18n';

document.documentElement.style.backgroundColor = "#051a1a";
document.body.style.backgroundColor = "#051a1a";
document.body.style.color = "#ffffff";

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

const configureNativeShell = async () => {
  try {
    const nativeCapacitor = globalThis.Capacitor;
    if (
      !nativeCapacitor ||
      typeof nativeCapacitor.getPlatform !== "function" ||
      typeof nativeCapacitor.isNativePlatform !== "function" ||
      nativeCapacitor.getPlatform() !== "android" ||
      !nativeCapacitor.isNativePlatform()
    ) {
      return;
    }

    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() !== "android" || !Capacitor.isNativePlatform()) return;

    const [{ SplashScreen }, { StatusBar, Style }] = await Promise.all([
      import("@capacitor/splash-screen"),
      import("@capacitor/status-bar")
    ]);

    let nativeSplashHidden = false;
    const hideNativeSplash = () => {
      if (nativeSplashHidden) return;
      nativeSplashHidden = true;
      SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});
    };

    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: "#051a1a" }).catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});

    const scheduleHide = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(hideNativeSplash, 120);
        });
      });
    };

    if (document.readyState === "complete") scheduleHide();
    else window.addEventListener("load", scheduleHide, { once: true });

    setTimeout(hideNativeSplash, 4000);
  } catch (_) {}
};

configureNativeShell();
