(() => {
  "use strict";

  const LS_KEY = "nexus.chats.v1";
  const MAX_HISTORIAL = 18;

  const SUGERENCIAS = [
    "¿Cuáles son los principales gases de efecto invernadero?",
    "¿Cuál es la diferencia entre tiempo y clima?",
    "¿Cómo afecta el cambio climático a Argentina?",
  ];

  // Códigos de idioma de la voz del navegador para cada idioma de NEXUS.
  const LANG_VOZ = {
    es: "es-AR", en: "en-US", pt: "pt-BR", fr: "fr-FR", it: "it-IT",
    de: "de-DE", ja: "ja-JP", zh: "zh-CN", ru: "ru-RU",
  };
  const HAY_VOZ = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const $ = (sel) => document.querySelector(sel);
  const el = {
    app: $("#app"),
    lista: $("#lista-chats"),
    mensajes: $("#mensajes"),
    form: $("#form"),
    texto: $("#texto"),
    enviar: $("#btn-enviar"),
    estado: $("#estado"),
    nuevo: $("#btn-nuevo"),
    menu: $("#btn-menu"),
    velo: $("#velo"),
    idiomas: document.querySelectorAll(".btn-idioma"),
  };

  /* ---------- Estado (guardado en el navegador de cada visitante) ---------- */
  let estado = cargar();
  const cargando = new Set();   // ids de chats esperando respuesta
  let hablando = null;          // "chatId:indice" del mensaje que se está leyendo

  function cargar() {
    try {
      const guardado = JSON.parse(localStorage.getItem(LS_KEY));
      if (guardado && Array.isArray(guardado.chats)) return guardado;
    } catch (_) { /* sin datos o datos rotos */ }
    return { chats: [], actual: null, idioma: "es" };
  }

  function guardar() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(estado)); } catch (_) { /* sin espacio o bloqueado */ }
  }

  function crearChat() {
    const chat = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      titulo: "Chat nuevo",
      mensajes: [],
      creado: Date.now(),
    };
    estado.chats.unshift(chat);
    estado.actual = chat.id;
    return chat;
  }

  function chatActual() {
    let chat = estado.chats.find((c) => c.id === estado.actual);
    if (!chat) chat = estado.chats[0] || crearChat();
    estado.actual = chat.id;
    return chat;
  }

  /* ---------- Texto con formato básico (escapa todo el HTML primero) ---------- */
  function esc(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function enLinea(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  }

  function formatear(texto) {
    const salida = [];
    let parrafo = [];
    let lista = null;
    const cerrarP = () => { if (parrafo.length) { salida.push("<p>" + parrafo.join("<br>") + "</p>"); parrafo = []; } };
    const cerrarL = () => { if (lista) { salida.push("</" + lista + ">"); lista = null; } };
    const abrirL = (tipo) => { if (lista !== tipo) { cerrarL(); salida.push("<" + tipo + ">"); lista = tipo; } };

    for (const linea of texto.replace(/\r/g, "").split("\n")) {
      let m;
      if ((m = linea.match(/^\s*[-*•]\s+(.*)/))) { cerrarP(); abrirL("ul"); salida.push("<li>" + enLinea(m[1]) + "</li>"); }
      else if ((m = linea.match(/^\s*\d+[.)]\s+(.*)/))) { cerrarP(); abrirL("ol"); salida.push("<li>" + enLinea(m[1]) + "</li>"); }
      else if ((m = linea.match(/^#{1,4}\s+(.*)/))) { cerrarP(); cerrarL(); salida.push("<h4>" + enLinea(m[1]) + "</h4>"); }
      else if (!linea.trim()) { cerrarP(); cerrarL(); }
      else { cerrarL(); parrafo.push(enLinea(linea)); }
    }
    cerrarP();
    cerrarL();
    return salida.join("");
  }

  /* ---------- Render ---------- */
  function mensajeEstado(texto, esError = false) {
    el.estado.textContent = texto || "";
    el.estado.classList.toggle("error", esError);
  }

  function renderIdiomas() {
    el.idiomas.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.codigo === estado.idioma)));
  }

  function renderLista() {
    el.lista.textContent = "";
    estado.chats.forEach((chat, i) => {
      const li = document.createElement("li");
      li.className = "chat-item" + (chat.id === estado.actual ? " activo" : "");
      li.style.setProperty("--n", i);

      const abrir = document.createElement("button");
      abrir.type = "button";
      abrir.className = "chat-abrir";
      if (chat.id === estado.actual) abrir.setAttribute("aria-current", "true");
      const titulo = document.createElement("span");
      titulo.className = "chat-titulo";
      titulo.textContent = chat.titulo;
      const meta = document.createElement("span");
      meta.className = "chat-meta";
      const n = chat.mensajes.length;
      meta.textContent = n === 0 ? "Sin mensajes" : n === 1 ? "1 mensaje" : n + " mensajes";
      abrir.append(titulo, meta);
      abrir.addEventListener("click", () => seleccionar(chat.id));

      const borrar = document.createElement("button");
      borrar.type = "button";
      borrar.className = "chat-borrar";
      borrar.textContent = "Borrar";
      borrar.setAttribute("aria-label", "Borrar el chat " + chat.titulo);
      borrar.addEventListener("click", () => borrarChat(chat.id));

      li.append(abrir, borrar);
      el.lista.append(li);
    });
  }

  function renderMensajes() {
    const chat = chatActual();
    el.mensajes.textContent = "";

    if (chat.mensajes.length === 0 && !cargando.has(chat.id)) {
      const vacio = document.createElement("div");
      vacio.className = "vacio";
      vacio.innerHTML =
        "<h1>Preguntale a NEXUS sobre el clima y el ambiente</h1>" +
        "<p>NEXUS explica ciencia del clima con ejemplos simples y distingue lo comprobado de lo incierto. Elegí un idioma arriba y escribí tu pregunta.</p>";
      const grupo = document.createElement("div");
      grupo.className = "sugerencias";
      SUGERENCIAS.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "sugerencia";
        b.textContent = s;
        b.addEventListener("click", () => enviar(s));
        grupo.append(b);
      });
      vacio.append(grupo);
      el.mensajes.append(vacio);
      return;
    }

    const hilo = document.createElement("div");
    hilo.className = "hilo";

    chat.mensajes.forEach((m, i) => {
      if (m.role === "user") {
        const u = document.createElement("div");
        u.className = "msg-usuario";
        u.textContent = m.content;
        hilo.append(u);
        return;
      }
      const art = document.createElement("article");
      art.className = "msg-nexus";
      const autor = document.createElement("div");
      autor.className = "msg-autor";
      autor.textContent = "NEXUS";
      const cuerpo = document.createElement("div");
      cuerpo.className = "msg-texto";
      cuerpo.innerHTML = formatear(m.content);
      const acciones = document.createElement("div");
      acciones.className = "msg-acciones";

      if (HAY_VOZ) {
        const clave = chat.id + ":" + i;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn-escuchar";
        b.dataset.clave = clave;
        b.textContent = hablando === clave ? "Detener" : "Escuchar respuesta";
        b.addEventListener("click", () => escuchar(chat.id, i));
        acciones.append(b);
      }
      art.append(autor, cuerpo, acciones);
      hilo.append(art);
    });

    if (cargando.has(chat.id)) {
      const p = document.createElement("p");
      p.className = "pensando";
      p.textContent = "NEXUS está preparando la respuesta…";
      hilo.append(p);
    }

    el.mensajes.append(hilo);
    el.mensajes.scrollTop = el.mensajes.scrollHeight;
  }

  function render() {
    renderIdiomas();
    renderLista();
    renderMensajes();
    el.enviar.disabled = cargando.has(estado.actual);
  }

  /* ---------- Acciones ---------- */
  function seleccionar(id) {
    estado.actual = id;
    guardar();
    mensajeEstado("");
    cerrarMenu();
    render();
    el.texto.focus();
  }

  function borrarChat(id) {
    const chat = estado.chats.find((c) => c.id === id);
    if (!chat) return;
    if (chat.mensajes.length && !confirm("¿Borrar este chat? No se puede deshacer.")) return;
    estado.chats = estado.chats.filter((c) => c.id !== id);
    if (hablando && hablando.startsWith(id + ":")) detener();
    if (estado.actual === id) estado.actual = estado.chats[0] ? estado.chats[0].id : null;
    guardar();
    render();
  }

  function nuevoChat() {
    const actual = estado.chats.find((c) => c.id === estado.actual);
    if (!actual || actual.mensajes.length > 0) crearChat();
    guardar();
    mensajeEstado("");
    cerrarMenu();
    render();
    el.texto.focus();
  }

  async function enviar(textoCrudo) {
    const chat = chatActual();
    if (cargando.has(chat.id)) return;
    const texto = textoCrudo.trim();
    if (!texto) return;

    // En Discord se pide "leelo"; acá funciona igual.
    if (texto.toLowerCase() === "leelo") {
      el.texto.value = "";
      ajustarAltura();
      const i = ultimoIndiceNexus(chat);
      if (i === -1) { mensajeEstado("Todavía no hay una respuesta para leer en este chat.", true); return; }
      escuchar(chat.id, i);
      return;
    }

    const historial = chat.mensajes.slice(-MAX_HISTORIAL).map(({ role, content }) => ({ role, content }));
    const idioma = estado.idioma;
    chat.mensajes.push({ role: "user", content: texto });
    if (chat.mensajes.length === 1) chat.titulo = texto.length > 48 ? texto.slice(0, 48) + "…" : texto;
    cargando.add(chat.id);
    el.texto.value = "";
    ajustarAltura();
    mensajeEstado("");
    guardar();
    render();

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: texto, idioma, historial }),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok || !datos.respuesta) throw new Error(datos.error || "No pude generar una respuesta.");
      chat.mensajes.push({ role: "assistant", content: datos.respuesta, idioma });
    } catch (e) {
      // Se quita la pregunta sin respuesta y se devuelve al cuadro para reintentar.
      chat.mensajes.pop();
      if (chat.mensajes.length === 0) chat.titulo = "Chat nuevo";
      if (chat.id === estado.actual) el.texto.value = texto;
      mensajeEstado(e.message || "No pude conectar con el servidor.", true);
    } finally {
      cargando.delete(chat.id);
      guardar();
      render();
    }
  }

  function ultimoIndiceNexus(chat) {
    for (let i = chat.mensajes.length - 1; i >= 0; i--) if (chat.mensajes[i].role === "assistant") return i;
    return -1;
  }

  /* ---------- Voz del navegador (sin servidor ni librerías) ---------- */
  function limpiarParaVoz(md) {
    return md.replace(/\r/g, "").replace(/[*_`#]/g, "").replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, "");
  }

  // Algunos navegadores cortan los textos largos: se lee de a frases.
  function trozos(texto) {
    const frases = texto.match(/[^.!?。！？\n]+[.!?。！？]*/g) || [];
    const partes = [];
    let actual = "";
    for (const f of frases) {
      const t = f.trim();
      if (!t) continue;
      if (actual && (actual + " " + t).length > 200) { partes.push(actual); actual = t; }
      else actual = actual ? actual + " " + t : t;
    }
    if (actual) partes.push(actual);
    return partes;
  }

  function elegirVoz(codigo) {
    const lang = (LANG_VOZ[codigo] || codigo).toLowerCase();
    const voces = window.speechSynthesis.getVoices();
    const norm = (v) => v.lang.replace("_", "-").toLowerCase();
    return voces.find((v) => norm(v) === lang) || voces.find((v) => norm(v).startsWith(codigo)) || null;
  }

  function actualizarBotonesVoz() {
    document.querySelectorAll(".btn-escuchar").forEach((b) => {
      b.textContent = b.dataset.clave === hablando ? "Detener" : "Escuchar respuesta";
    });
  }

  function detener() {
    if (HAY_VOZ) window.speechSynthesis.cancel();
    hablando = null;
    actualizarBotonesVoz();
  }

  function escuchar(chatId, indice) {
    if (!HAY_VOZ) { mensajeEstado("Este navegador no tiene voz disponible.", true); return; }
    const chat = estado.chats.find((c) => c.id === chatId);
    const msg = chat && chat.mensajes[indice];
    if (!msg) return;

    const clave = chatId + ":" + indice;
    if (hablando === clave) { detener(); return; }
    detener();

    const partes = trozos(limpiarParaVoz(msg.content));
    if (!partes.length) return;
    const codigo = msg.idioma || estado.idioma;
    const voz = elegirVoz(codigo);
    mensajeEstado(voz ? "" : "Tu dispositivo no tiene una voz en ese idioma; se usa la voz por defecto.");

    hablando = clave;
    actualizarBotonesVoz();
    partes.forEach((parte, n) => {
      const u = new SpeechSynthesisUtterance(parte);
      u.lang = LANG_VOZ[codigo] || codigo;
      if (voz) u.voice = voz;
      if (n === partes.length - 1) {
        u.onend = () => { if (hablando === clave) { hablando = null; actualizarBotonesVoz(); } };
      }
      u.onerror = (e) => {
        if (e.error === "canceled" || e.error === "interrupted") return;
        if (hablando === clave) { hablando = null; actualizarBotonesVoz(); }
        mensajeEstado("No pude reproducir el audio en este navegador.", true);
      };
      window.speechSynthesis.speak(u);
    });
  }

  /* ---------- Interfaz ---------- */
  function ajustarAltura() {
    el.texto.style.height = "auto";
    el.texto.style.height = Math.min(el.texto.scrollHeight, 160) + "px";
  }

  function abrirMenu() { el.app.classList.add("menu-abierto"); el.menu.setAttribute("aria-expanded", "true"); }
  function cerrarMenu() { el.app.classList.remove("menu-abierto"); el.menu.setAttribute("aria-expanded", "false"); }

  el.form.addEventListener("submit", (e) => { e.preventDefault(); enviar(el.texto.value); });
  el.texto.addEventListener("input", ajustarAltura);
  el.texto.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(el.texto.value); }
  });
  el.nuevo.addEventListener("click", nuevoChat);
  el.menu.addEventListener("click", () => (el.app.classList.contains("menu-abierto") ? cerrarMenu() : abrirMenu()));
  el.velo.addEventListener("click", cerrarMenu);
  el.idiomas.forEach((b) =>
    b.addEventListener("click", () => {
      estado.idioma = b.dataset.codigo;
      guardar();
      renderIdiomas();
      mensajeEstado("Las próximas respuestas van a ser en " + b.textContent + ".");
    })
  );

  if (!estado.chats.some((c) => c.id === estado.actual)) {
    if (estado.chats.length === 0) crearChat(); else estado.actual = estado.chats[0].id;
    guardar();
  }
  render();
})();
