const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("myraa", {
  isDesktop: true,
  execute:    (cmd) => ipcRenderer.invoke("myraa:execute", cmd),
  info:       () => ipcRenderer.invoke("myraa:info"),
  ai:         (payload) => ipcRenderer.invoke("myraa:ai", payload),
  tts:        (text, language) => ipcRenderer.invoke("myraa:tts", { text, language }),
  screenshot: () => ipcRenderer.invoke("myraa:screenshot"),
  hasKey:     () => ipcRenderer.invoke("myraa:hasKey"),
  setKey:     (key) => ipcRenderer.invoke("myraa:setKey", key),
  owner: {
    get: () => ipcRenderer.invoke("myraa:owner:get"),
    set: (name) => ipcRenderer.invoke("myraa:owner:set", name),
  },
  startup: {
    get: () => ipcRenderer.invoke("myraa:startup:get"),
    set: (enabled) => ipcRenderer.invoke("myraa:startup:set", enabled),
  },
  update: {
    check:    () => ipcRenderer.invoke("myraa:update:check"),
    download: (url) => ipcRenderer.invoke("myraa:update:download", url),
    onAvailable: (cb) => {
      const fn = (_e, info) => cb(info);
      ipcRenderer.on("myraa:update:available", fn);
      return () => ipcRenderer.removeListener("myraa:update:available", fn);
    },
  },
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
