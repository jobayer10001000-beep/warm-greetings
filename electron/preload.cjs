const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("myraa", {
  isDesktop: true,
  execute:    (cmd) => ipcRenderer.invoke("myraa:execute", cmd),
  info:       () => ipcRenderer.invoke("myraa:info"),
  ai:         (payload) => ipcRenderer.invoke("myraa:ai", payload),
  tts:        (text) => ipcRenderer.invoke("myraa:tts", text),
  screenshot: () => ipcRenderer.invoke("myraa:screenshot"),
  hasKey:     () => ipcRenderer.invoke("myraa:hasKey"),
  setKey:     (key) => ipcRenderer.invoke("myraa:setKey", key),
});
