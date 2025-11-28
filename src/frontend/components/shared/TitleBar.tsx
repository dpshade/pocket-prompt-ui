import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { enableModernWindowStyle } from "@cloudworxx/tauri-plugin-mac-rounded-corners";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isHoveringControls, setIsHoveringControls] = useState(false);

  useEffect(() => {
    // Check if we're in Tauri
    if (typeof window === "undefined" || !("__TAURI__" in window)) {
      console.log("[TitleBar] Not in Tauri environment");
      return;
    }

    console.log("[TitleBar] Setting up window controls...");

    // Enable macOS rounded corners
    enableModernWindowStyle({
      cornerRadius: 10,
      offsetX: 0,
      offsetY: 0,
    }).catch((err) => {
      console.error("[TitleBar] Failed to enable rounded corners:", err);
    });

    const setupMaximizedListener = async () => {
      try {
        const appWindow = getCurrentWindow();

        // Get initial state
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
        console.log("[TitleBar] Initial maximized state:", maximized);

        // Listen for changes
        const unlisten = await appWindow.onResized(async () => {
          const newMaximized = await appWindow.isMaximized();
          setIsMaximized(newMaximized);
          console.log("[TitleBar] Maximized state changed:", newMaximized);
        });

        return unlisten;
      } catch (error) {
        console.error("[TitleBar] Failed to setup listener:", error);
      }
    };

    const unlistenPromise = setupMaximizedListener();

    return () => {
      unlistenPromise?.then((unlisten) => unlisten?.());
    };
  }, []);

  const handleMinimize = async () => {
    console.log("[TitleBar] Minimize clicked");
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
      console.log("[TitleBar] Window minimized");
    } catch (error) {
      console.error("[TitleBar] Failed to minimize:", error);
    }
  };

  const handleMaximize = async () => {
    console.log("[TitleBar] Maximize clicked");
    try {
      const appWindow = getCurrentWindow();
      await appWindow.toggleMaximize();
      console.log("[TitleBar] Window maximized toggled");
    } catch (error) {
      console.error("[TitleBar] Failed to maximize:", error);
    }
  };

  const handleClose = async () => {
    console.log("[TitleBar] Close clicked");
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
      console.log("[TitleBar] Window closed");
    } catch (error) {
      console.error("[TitleBar] Failed to close:", error);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="fixed top-0 left-0 right-0 h-8 bg-background/95 backdrop-blur-xl z-50 flex items-center select-none rounded-t-[16px] overflow-hidden cursor-default"
    >
      {/* Left side - macOS traffic light controls */}
      <div
        className="flex items-center gap-2 pl-3"
        onMouseEnter={() => setIsHoveringControls(true)}
        onMouseLeave={() => setIsHoveringControls(false)}
      >
        {/* Close button - Red */}
        <button
          onClick={handleClose}
          className="w-3 h-3 flex items-center justify-center cursor-pointer relative"
          title="Close"
        >
          <svg
            className="w-3 h-3 absolute inset-0"
            viewBox="0 0 85.4 85.4"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clipRule="evenodd" fillRule="evenodd">
              <path
                d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z"
                fill="#e24b41"
              />
              <path
                d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z"
                fill="#ed6a5f"
              />
              <g fill="#460804" opacity={isHoveringControls ? 1 : 0}>
                <path d="m22.5 57.8 35.3-35.3c1.4-1.4 3.6-1.4 5 0l.1.1c1.4 1.4 1.4 3.6 0 5l-35.3 35.3c-1.4 1.4-3.6 1.4-5 0l-.1-.1c-1.3-1.4-1.3-3.6 0-5z" />
                <path d="m27.6 22.5 35.3 35.3c1.4 1.4 1.4 3.6 0 5l-.1.1c-1.4 1.4-3.6 1.4-5 0l-35.3-35.3c-1.4-1.4-1.4-3.6 0-5l.1-.1c1.4-1.3 3.6-1.3 5 0z" />
              </g>
            </g>
          </svg>
        </button>

        {/* Minimize button - Yellow */}
        <button
          onClick={handleMinimize}
          className="w-3 h-3 flex items-center justify-center cursor-pointer relative"
          title="Minimize"
        >
          <svg
            className="w-3 h-3 absolute inset-0"
            viewBox="0 0 85.4 85.4"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g clipRule="evenodd" fillRule="evenodd">
              <path
                d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z"
                fill="#e1a73e"
              />
              <path
                d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1 17.5 39.1 39.1 39.1z"
                fill="#f6be50"
              />
              <path
                d="m17.8 39.1h49.9c1.9 0 3.5 1.6 3.5 3.5v.1c0 1.9-1.6 3.5-3.5 3.5h-49.9c-1.9 0-3.5-1.6-3.5-3.5v-.1c0-1.9 1.5-3.5 3.5-3.5z"
                fill="#90591d"
                opacity={isHoveringControls ? 1 : 0}
              />
            </g>
          </svg>
        </button>

        {/* Maximize/Restore button - Green */}
        <button
          onClick={handleMaximize}
          className="w-3 h-3 flex items-center justify-center cursor-pointer relative"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          <svg
            className="w-3 h-3 absolute inset-0"
            viewBox="0 0 85.4 85.4"
            xmlns="http://www.w3.org/2000/svg"
            style={{ transform: isHoveringControls ? "rotate(90deg)" : "none" }}
          >
            <g clipRule="evenodd" fillRule="evenodd">
              <path
                d="m42.7 85.4c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.7-42.7-42.7 19.1-42.7 42.7 19.1 42.7 42.7 42.7z"
                fill="#2dac2f"
              />
              <path
                d="m42.7 81.8c21.6 0 39.1-17.5 39.1-39.1s-17.5-39.1-39.1-39.1-39.1 17.5-39.1 39.1c0 21.5 17.5 39.1 39.1 39.1z"
                fill="#61c555"
              />
              <path
                d="m31.2 20.8h26.7c3.6 0 6.5 2.9 6.5 6.5v26.7zm23.2 43.7h-26.8c-3.6 0-6.5-2.9-6.5-6.5v-26.8z"
                fill="#2a6218"
                opacity={isHoveringControls ? 1 : 0}
              />
            </g>
          </svg>
        </button>
      </div>

      {/* Center - Drag region */}
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center justify-center cursor-default"
      ></div>

      {/* Right side - Empty for symmetry */}
      <div className="w-[72px]" />
    </div>
  );
}
