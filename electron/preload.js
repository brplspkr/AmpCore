const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronWindow", {
  isDesktop: true,
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getPlatform: () => ipcRenderer.invoke("app:get-platform"),
  openSpeakerLibraryFolder: () => ipcRenderer.invoke("library:open-config-folder"),
  pickSlFolder: () => ipcRenderer.invoke("library:pick-sl-folder"),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  getRemoteInfo: () => ipcRenderer.invoke("remote:get-info"),
  setRemoteEnabled: (enabled) => ipcRenderer.invoke("remote:set-enabled", enabled),
  regenerateRemotePin: () => ipcRenderer.invoke("remote:regenerate-pin"),
  onMaximizedChange: (callback) => {
    const listener = (_event, maximized) => callback(Boolean(maximized));
    ipcRenderer.on("window:maximized-changed", listener);
    return () => ipcRenderer.removeListener("window:maximized-changed", listener);
  }
});
