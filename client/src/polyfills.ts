// Polyfills required by pdfjs-dist 5.x on older Electron Chromium runtimes.
// Uint8Array.prototype.toHex / fromHex / toBase64 / fromBase64 are Stage-3 proposal
// methods that ship in very recent V8/Chromium (≥ Chrome 134). Electron < 31.4 does
// not have them, which causes "n.toHex is not a function" in the minified pdfjs build.

const HEX_CHARS = "0123456789abcdef";

if (typeof (Uint8Array.prototype as any).toHex !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value: function toHex(this: Uint8Array): string {
      let out = "";
      for (let i = 0; i < this.length; i++) {
        const b = this[i];
        out += HEX_CHARS[b >>> 4] + HEX_CHARS[b & 0x0f];
      }
      return out;
    },
  });
}

if (typeof (Uint8Array as any).fromHex !== "function") {
  Object.defineProperty(Uint8Array, "fromHex", {
    configurable: true,
    writable: true,
    value: function fromHex(s: string): Uint8Array {
      if (typeof s !== "string" || s.length % 2 !== 0) {
        throw new SyntaxError("invalid hex string");
      }
      const out = new Uint8Array(s.length / 2);
      for (let i = 0; i < out.length; i++) {
        const hi = parseInt(s[i * 2], 16);
        const lo = parseInt(s[i * 2 + 1], 16);
        if (Number.isNaN(hi) || Number.isNaN(lo)) {
          throw new SyntaxError("invalid hex char");
        }
        out[i] = (hi << 4) | lo;
      }
      return out;
    },
  });
}

if (typeof (Uint8Array.prototype as any).toBase64 !== "function") {
  Object.defineProperty(Uint8Array.prototype, "toBase64", {
    configurable: true,
    writable: true,
    value: function toBase64(this: Uint8Array): string {
      let s = "";
      for (let i = 0; i < this.length; i++) s += String.fromCharCode(this[i]);
      return btoa(s);
    },
  });
}

if (typeof (Uint8Array as any).fromBase64 !== "function") {
  Object.defineProperty(Uint8Array, "fromBase64", {
    configurable: true,
    writable: true,
    value: function fromBase64(s: string): Uint8Array {
      const bin = atob(s);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    },
  });
}

export {};
