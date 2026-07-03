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
  wa: {
    state:  () => ipcRenderer.invoke("myraa:wa:state"),
    start:  () => ipcRenderer.invoke("myraa:wa:start"),
    stop:   () => ipcRenderer.invoke("myraa:wa:stop"),
    logout: () => ipcRenderer.invoke("myraa:wa:logout"),
    test:   () => ipcRenderer.invoke("myraa:wa:test"),
    onState: (cb) => {
      const fn = (_e, snap) => cb(snap);
      ipcRenderer.on("myraa:wa:state", fn);
      return () => ipcRenderer.removeListener("myraa:wa:state", fn);
    },
  },
});
