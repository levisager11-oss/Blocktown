// Small helpers for building the interface out of plain page elements.
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Makes an element: h("button", { class: "big", onclick: fn }, "Text"). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = String(v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v as EventListener);
      else if (k === "html") el.innerHTML = String(v);
      else if (k in el && k !== "list") (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function clear(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); }
export function fill(el: HTMLElement, ...children: (Child | Child[])[]) {
  clear(el);
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
}

/** Sets the text of an element only when it changed, so the page isn't redrawn for nothing. */
export function setText(el: HTMLElement, text: string) { if (el.textContent !== text) el.textContent = text; }
