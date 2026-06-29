class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.tokens = new Set();
  }

  _syncOwner() {
    this.owner._className = Array.from(this.tokens).join(' ');
  }

  setFromString(value) {
    this.tokens = new Set(String(value || '').split(/\s+/).filter(Boolean));
    this._syncOwner();
  }

  add(...names) {
    for (const name of names) this.tokens.add(name);
    this._syncOwner();
  }

  remove(...names) {
    for (const name of names) this.tokens.delete(name);
    this._syncOwner();
  }

  toggle(name, force) {
    if (force === true) {
      this.tokens.add(name);
    } else if (force === false) {
      this.tokens.delete(name);
    } else if (this.tokens.has(name)) {
      this.tokens.delete(name);
    } else {
      this.tokens.add(name);
    }
    this._syncOwner();
    return this.tokens.has(name);
  }

  contains(name) {
    return this.tokens.has(name);
  }
}

export class FakeEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    this.key = options.key;
    this.target = options.target ?? null;
    this.defaultPrevented = false;
    this._stopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }
}

class FakeNode {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this._listeners = new Map();
  }

  addEventListener(type, handler, options = false) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    const capture = options === true || Boolean(options?.capture);
    this._listeners.get(type).push({ handler, capture });
  }

  removeEventListener(type, handler, options = false) {
    const handlers = this._listeners.get(type);
    if (!handlers) return;
    const capture = options === true || Boolean(options?.capture);
    const idx = handlers.findIndex((entry) => entry.handler === handler && entry.capture === capture);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  _eventPath() {
    const path = [];
    let node = this;
    while (node) {
      path.push(node);
      node = node.parentNode;
    }

    const doc = this.ownerDocument;
    if (doc && path[path.length - 1] !== doc) path.push(doc);
    return path;
  }

  _invokeListeners(evt, node, capture) {
    const entries = node._listeners.get(evt.type) || [];
    for (const entry of [...entries]) {
      if (entry.capture !== capture) continue;
      entry.handler(evt);
      if (evt._stopped) return true;
    }
    return false;
  }

  dispatchEvent(event) {
    const evt = event instanceof FakeEvent ? event : new FakeEvent(event.type, event);
    if (!evt.target) evt.target = this;

    const path = this._eventPath(); // [target, parent, ..., document]

    // Capture phase: document -> ... -> parent of target
    for (let i = path.length - 1; i >= 1; i -= 1) {
      if (this._invokeListeners(evt, path[i], true)) return !evt.defaultPrevented;
    }

    // Target phase: capture then bubble listeners on target.
    if (this._invokeListeners(evt, path[0], true)) return !evt.defaultPrevented;
    if (this._invokeListeners(evt, path[0], false)) return !evt.defaultPrevented;

    if (evt.bubbles) {
      // Bubble phase: parent of target -> ... -> document
      for (let i = 1; i < path.length; i += 1) {
        if (this._invokeListeners(evt, path[i], false)) return !evt.defaultPrevented;
      }
    }

    return !evt.defaultPrevented;
  }
}

export class FakeElement extends FakeNode {
  constructor(tagName, ownerDocument) {
    super(ownerDocument);
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
    this._className = '';
    this._id = '';
    this.attributes = new Map();
    this.classList = new FakeClassList(this);
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    if (this._id) this.ownerDocument?._registerId(this._id, this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this.classList.setFromString(value);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    // Minimal behavior needed for tests.
    if (this._innerHTML === '') {
      this.children = [];
    }
  }

  appendChild(child) {
    child.parentNode = this;
    if (!child.ownerDocument) child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    if (child.id) this.ownerDocument?._registerId(child.id, child);
    return child;
  }

  setAttribute(name, value) {
    const key = String(name);
    const val = String(value);
    this.attributes.set(key, val);
    if (key === 'id') this.id = val;
    if (key === 'class') this.className = val;
    if (key.startsWith('data-')) {
      const dataKey = key
        .slice(5)
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[dataKey] = val;
    }
  }

  getAttribute(name) {
    return this.attributes.get(String(name)) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(String(name));
  }

  contains(node) {
    if (this === node) return true;
    return this.children.some((child) => child.contains?.(node));
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  scrollIntoView() {}

  querySelectorAll(selector) {
    const results = [];
    const search = (root) => {
      for (const child of root.children) {
        const isClassSelector = selector.startsWith('.');
        const className = selector.slice(1);
        const classMatch = isClassSelector && child.classList.contains(className);
        const tagMatch = !isClassSelector && child.tagName.toLowerCase() === selector.toLowerCase();
        if (classMatch || tagMatch) results.push(child);
        search(child);
      }
    };
    search(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

export class FakeDocument extends FakeNode {
  constructor() {
    super(null);
    this.ownerDocument = this;
    this._ids = new Map();
    this.activeElement = null;
    this.body = new FakeElement('body', this);
  }

  _registerId(id, element) {
    this._ids.set(String(id), element);
  }

  getElementById(id) {
    return this._ids.get(String(id)) ?? null;
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

export function click(target) {
  target.dispatchEvent(new FakeEvent('click', { bubbles: true }));
}

export function input(target, value) {
  target.value = value;
  target.dispatchEvent(new FakeEvent('input', { bubbles: true }));
}

export function keydown(target, key) {
  const evt = new FakeEvent('keydown', { key, bubbles: true });
  target.dispatchEvent(evt);
  return evt;
}
