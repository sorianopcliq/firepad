/*!
 * Firepad is an open-source, collaborative code and text editor. It was designed
 * to be embedded inside larger applications. Since it uses Firebase as a backend,
 * it requires no server-side code and can be added to any web app simply by
 * including a couple JavaScript files.
 *
 * Firepad 0.0.0
 * http://www.firepad.io/
 * License: MIT
 * Copyright: 2014 Firebase
 * With code from ot.js (Copyright 2012-2013 Tim Baumann)
 */

(function (name, definition, context) {
  //try CommonJS, then AMD (require.js), then use global.
  if (typeof module != 'undefined' && module.exports) module.exports = definition();
  else if (typeof context['define'] == 'function' && context['define']['amd']) define(definition);
  else context[name] = definition();
})('Firepad', function () {var FOUNTAIN_SECTIONS = {
  title_page: /^((?:title|credit|author[s]?|source|notes|draft date|date|contact|copyright)\:)/gim,

  scene_heading: /^((?:\*{0,3}_?)?(?:(?:int|ext|i\/e|est)[. ]).+)|^(?:\.(?!\.+))(.+)/i,
  scene_number: /( *#(.+)# *)/,

  transition: /^((?:FADE (?:TO BLACK|OUT)|CUT TO BLACK)\.|.+ TO\:)|^(?:> *)(.+)/,

  character: /^[A-Z*_][0-9A-Z (._\-',)]*[A-Z*_)]$/,
  dialogue: /^([A-Z*_][0-9A-Z (._\-',)]*[A-Z*_)])(\^?)?(?:\n(?!\n+))([\s\S]+)/,
  parenthetical: /^(\(.+\))$/,
  lyrics: /^~(.+)/g,
  action: /^(.+)/g,
  centered: /^(?:> *)(.+)(?: *<)(\n.+)*/g,

  section: /^(#+)(?: *)(.*)/,
  synopsis: /^(?:\=(?!\=+) *)(.*)/,

  note: /^(?:\[{2}(?!\[+))(.+)(?:\]{2}(?!\[+))$/,
  note_inline: /(?:\[{2}(?!\[+))([\s\S]+?)(?:\]{2}(?!\[+))/g,
  boneyard: /(^\/\*|^\*\/)$/g,

  page_break: /^\={3,}$/,
  line_break: /^ {2}$/,

  emphasis: /(_|\*{1,3}|_\*{1,3}|\*{1,3}_)(.+)(_|\*{1,3}|_\*{1,3}|\*{1,3}_)/g,
  bold_italic_underline: /(_{1}\*{3}(?=.+\*{3}_{1})|\*{3}_{1}(?=.+_{1}\*{3}))(.+?)(\*{3}_{1}|_{1}\*{3})/g,
  bold_underline: /(_{1}\*{2}(?=.+\*{2}_{1})|\*{2}_{1}(?=.+_{1}\*{2}))(.+?)(\*{2}_{1}|_{1}\*{2})/g,
  italic_underline: /(?:_{1}\*{1}(?=.+\*{1}_{1})|\*{1}_{1}(?=.+_{1}\*{1}))(.+?)(\*{1}_{1}|_{1}\*{1})/g,
  bold_italic: /(\*{3}(?=.+\*{3}))(.+?)(\*{3})/g,
  bold: /(\*{2}(?=.+\*{2}))(.+?)(\*{2})/g,
  italic: /(\*{1}(?=.+\*{1}))(.+?)(\*{1})/g,
  underline: /(_{1}(?=.+_{1}))(.+?)(_{1})/g,

  splitter: /\n{2,}/g,
  cleaner: /^\n+|\n+$/,
  standardizer: /\r\n|\r/g,
  whitespacer: /^\t+|^ {3,}/gm
};

var FOUNTAIN_TOKENIZER = {
  clean: function(script) {
    return script
      .replace(FOUNTAIN_SECTIONS.boneyard, "\n$1\n")
      .replace(FOUNTAIN_SECTIONS.standardizer, "\n")
      .replace(FOUNTAIN_SECTIONS.cleaner, "")
      .replace(FOUNTAIN_SECTIONS.whitespacer, "");
  },

  tokenize: function(lines, indexByLine) {
    var script = lines
      .map(function(line) {
        return line.text;
      })
      .join("\n");

    var script_lines = FOUNTAIN_TOKENIZER.clean(script).split(
        FOUNTAIN_SECTIONS.splitter
      ),
      line,
      match,
      parts,
      text,
      meta,
      i,
      x,
      length,
      dual,
      scriptTokens,
      lineInd = 0;

    if (indexByLine) {
      scriptTokens = {};
    } else {
      scriptTokens = [];
    }

    for (i in script_lines) {
      line = script_lines[i];

      var tokens = [];
      var done = false;

      // title page
      if (!done && FOUNTAIN_SECTIONS.title_page.test(line)) {
        match = line
          .replace(FOUNTAIN_SECTIONS.title_page, "\n$1")
          .split(FOUNTAIN_SECTIONS.splitter);
        for (x = 0, length = match.length; x < length; x++) {
          parts = match[x]
            .replace(FOUNTAIN_SECTIONS.cleaner, "")
            .split(/\:\n*/);
          tokens.push({
            type: parts[0]
              .trim()
              .toLowerCase()
              .replace(" ", "_"),
            text: parts[1].trim()
          });
        }
        done = true;
      }

      // scene headings
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.scene_heading))) {
        text = match[1] || match[2];

        if (text.indexOf("  ") !== text.length - 2) {
          if ((meta = text.match(FOUNTAIN_SECTIONS.scene_number))) {
            meta = meta[2];
            text = text.replace(FOUNTAIN_SECTIONS.scene_number, "");
          }
          tokens.push({
            type: "scene_heading",
            text: text,
            scene_number: meta || undefined
          });
        }
        done = true;
      }

      // centered
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.centered))) {
        tokens.push({ type: "centered", text: match[0].replace(/>|</g, "") });
        done = true;
      }

      // transitions
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.transition))) {
        tokens.push({ type: "transition", text: match[1] || match[2] });
        done = true;
      }

      // dialogue blocks - characters, parentheticals and dialogue
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.dialogue))) {
        if (match[1].indexOf("  ") !== match[1].length - 2) {
          var str = match[3] + "\n";
          parts = str.split(/(?:^|\n+)(\(.+\))(?:\n+)/);

          dual_diaglogue = !!match[2];

          if (dual_diaglogue) {
            tokens.push({ type: "dual_dialogue_begin" });
          }

          tokens.push({
            type: "dialogue_begin",
            dual: dual_diaglogue ? "right" : dual ? "left" : undefined
          });
          tokens.push({ type: "character", text: match[1].trim() });

          for (x = 0, length = parts.length; x < length; x++) {
            text = parts[x].trim();

            if (text.length > 0) {
              var tokenType = FOUNTAIN_SECTIONS.parenthetical.test(text)
                ? "parenthetical"
                : "dialogue";
              tokens.push({ type: tokenType, text: text });
            }
          }

          tokens.push({ type: "dialogue_end" });

          if (dual_diaglogue) {
            tokens.push({ type: "dual_dialogue_end" });
          }

          done = true;
        }
      }

      // section
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.section))) {
        tokens.push({
          type: "section",
          text: match[2],
          depth: match[1].length
        });
        done = true;
      }

      // synopsis
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.synopsis))) {
        tokens.push({ type: "synopsis", text: match[1] });
        done = true;
      }

      // notes
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.note))) {
        tokens.push({ type: "note", text: match[1] });
        done = true;
      }

      // boneyard
      if (!done && (match = line.match(FOUNTAIN_SECTIONS.boneyard))) {
        tokens.push({
          type: match[0][0] === "/" ? "boneyard_begin" : "boneyard_end"
        });
        done = true;
      }

      // page breaks
      if (!done && FOUNTAIN_SECTIONS.page_break.test(line)) {
        tokens.push({ type: "page_break" });
        done = true;
      }

      // line breaks
      if (!done && FOUNTAIN_SECTIONS.line_break.test(line)) {
        tokens.push({ type: "line_break" });
        done = true;
      }

      // lyrics
      if (!done && FOUNTAIN_SECTIONS.lyrics.test(line)) {
        tokens.push({ type: "lyrics", text: line });
        done = true;
      }

      // actions
      if (!done) {
        tokens.push({ type: "action", text: line });
      }

      for (var j = 0; j < tokens.length; j++) {
        var token = tokens[j];

        if (token.text) {
          var splitted = token.text.split("\n");

          for (var k = 0; k < splitted.length; k++) {
            var textLine = splitted[k];
            var tok = JSON.parse(JSON.stringify(token));
            var found = false;
            var lineNum = null;

            tok.text = textLine;

            while (!found && lineInd < lines.length) {
              if (lines[lineInd].text.indexOf(textLine) >= 0) {
                lineNum = lines[lineInd].line;
                found = true;
              }

              lineInd++;
            }

            if (indexByLine) {
              if (lineNum) {
                scriptTokens[lineNum] = tok;
              }
            } else {
              scriptTokens.push(tok);
            }
          }
        } else {
          if (!indexByLine) {
            scriptTokens.push(token);
          }
        }
      }
    }

    return scriptTokens;
  }
};

var FOUNTAIN = {
  parse: function(lines, _options, callback) {
    if (callback === undefined && typeof _options === "function") {
      callback = _options;
      _options = {};
    } else if (_options === undefined) {
      _options = {};
    }

    // Default options
    var options = {
      tokens: _options["tokens"] || false,
      html: _options["html"] || false
    };

    var output = {};

    if (options.tokens) {
      output.tokens = FOUNTAIN_TOKENIZER.tokenize(lines, true);
    } else if (options.html) {
      var token,
        title_page_html = [],
        script_html = [];

      var tokens = FOUNTAIN_TOKENIZER.tokenize(lines, false);

      for (var j in tokens) {
        token = tokens[j];
        token.text = FOUNTAIN.lexer(token.text);

        switch (token.type) {
          case "title":
            title_page_html.push("<h1>" + token.text + "</h1>");
            break;

          case "credit":
            title_page_html.push('<p class="credit">' + token.text + "</p>");
            break;

          case "author":
            title_page_html.push('<p class="authors">' + token.text + "</p>");
            break;

          case "authors":
            title_page_html.push('<p class="authors">' + token.text + "</p>");
            break;

          case "source":
            title_page_html.push('<p class="source">' + token.text + "</p>");
            break;

          case "notes":
            title_page_html.push('<p class="notes">' + token.text + "</p>");
            break;

          case "draft_date":
            title_page_html.push(
              '<p class="draft-date">' + token.text + "</p>"
            );
            break;

          case "date":
            title_page_html.push('<p class="date">' + token.text + "</p>");
            break;

          case "contact":
            title_page_html.push('<p class="contact">' + token.text + "</p>");
            break;

          case "copyright":
            title_page_html.push('<p class="copyright">' + token.text + "</p>");
            break;

          case "scene_heading":
            script_html.push(
              "<h2" +
                (token.scene_number
                  ? ' id="' + token.scene_number + '">'
                  : ">") +
                token.text +
                "</h2>"
            );
            break;

          case "transition":
            script_html.push('<p class="transition">' + token.text + "</p>");
            break;

          case "dual_dialogue_begin":
            script_html.push('<div class="dual-dialogue">');
            break;

          case "dialogue_begin":
            script_html.push(
              '<div class="dialogue' +
                (token.dual ? " " + token.dual : "") +
                '">'
            );
            break;

          case "character":
            script_html.push("<h4>" + token.text.replace(/^@/, "") + "</h4>");
            break;

          case "parenthetical":
            script_html.push('<p class="parenthetical">' + token.text + "</p>");
            break;

          case "dialogue":
            script_html.push("<p>" + token.text + "</p>");
            break;

          case "dialogue_end":
            script_html.push("</div>");
            break;

          case "dual_dialogue_end":
            script_html.push("</div>");
            break;

          case "section":
            script_html.push(
              '<p class="section" data-depth="' +
                token.depth +
                '">' +
                token.text +
                "</p>"
            );
            break;

          case "synopsis":
            script_html.push('<p class="synopsis">' + token.text + "</p>");
            break;

          case "note":
            script_html.push("<!-- " + token.text + " -->");
            break;

          case "boneyard_begin":
            script_html.push("<!-- ");
            break;

          case "boneyard_end":
            script_html.push(" -->");
            break;

          case "lyrics":
            script_html.push('<p class="lyrics">' + token.text + "</p>");
            break;

          case "action":
            script_html.push("<p>" + token.text + "</p>");
            break;

          case "centered":
            script_html.push('<p class="centered">' + token.text + "</p>");
            break;

          case "page_break":
            script_html.push("<hr />");
            break;

          case "line_break":
            script_html.push("<br />");
            break;
        }
      }

      output.title_page_html = title_page_html.join("");
      output.script_html = script_html.join("");
    }

    if (typeof callback === "function") {
      return callback(output);
    }

    return output;
  },

  lexer: function(s) {
    if (!s) {
      return;
    }

    var inline = {
      note: "<!-- $1 -->",
      line_break: "<br />",
      bold_italic_underline:
        '<strong><em><span style="text-decoration:underline">$2</span></em></strong>',
      bold_underline:
        '<strong><span style="text-decoration:underline">$2</span></strong>',
      italic_underline:
        '<em><span style="text-decoration:underline">$1</span></em>',
      bold_italic: "<strong><em>$2</em></strong>",
      bold: "<strong>$2</strong>",
      italic: "<em>$2</em>",
      underline: '<span style="text-decoration:underline">$2</span>'
    };

    var styles = [
        "bold_italic_underline",
        "bold_underline",
        "italic_underline",
        "bold_italic",
        "bold",
        "italic",
        "underline"
      ],
      style,
      match;

    s = s
      .replace(FOUNTAIN_SECTIONS.note_inline, inline.note)
      .replace(/\\\*/g, "[star]")
      .replace(/\\_/g, "[underline]")
      .replace(/\n/g, inline.line_break);

    for (var i in styles) {
      style = styles[i];
      match = FOUNTAIN_SECTIONS[style];

      if (match.test(s)) {
        s = s.replace(match, inline[style]);
      }
    }

    return s
      .replace(/\[star\]/g, "*")
      .replace(/\[underline\]/g, "_")
      .trim();
  }
};

var firepad = firepad || {};
firepad.utils = {};

firepad.utils.makeEventEmitter = function(clazz, opt_allowedEVents) {
  clazz.prototype.allowedEvents_ = opt_allowedEVents;

  clazz.prototype.on = function(eventType, callback, context) {
    this.validateEventType_(eventType);
    this.eventListeners_ = this.eventListeners_ || {};
    this.eventListeners_[eventType] = this.eventListeners_[eventType] || [];
    this.eventListeners_[eventType].push({
      callback: callback,
      context: context
    });
  };

  clazz.prototype.off = function(eventType, callback) {
    this.validateEventType_(eventType);
    this.eventListeners_ = this.eventListeners_ || {};
    var listeners = this.eventListeners_[eventType] || [];
    for (var i = 0; i < listeners.length; i++) {
      if (listeners[i].callback === callback) {
        listeners.splice(i, 1);
        return;
      }
    }
  };

  clazz.prototype.trigger = function(eventType /*, args ... */) {
    this.eventListeners_ = this.eventListeners_ || {};
    var listeners = this.eventListeners_[eventType] || [];
    for (var i = 0; i < listeners.length; i++) {
      listeners[i].callback.apply(
        listeners[i].context,
        Array.prototype.slice.call(arguments, 1)
      );
    }
  };

  clazz.prototype.validateEventType_ = function(eventType) {
    if (this.allowedEvents_) {
      var allowed = false;
      for (var i = 0; i < this.allowedEvents_.length; i++) {
        if (this.allowedEvents_[i] === eventType) {
          allowed = true;
          break;
        }
      }
      if (!allowed) {
        throw new Error('Unknown event "' + eventType + '"');
      }
    }
  };
};

firepad.utils.elt = function(tag, content, attrs) {
  var e = document.createElement(tag);
  if (typeof content === "string") {
    firepad.utils.setTextContent(e, content);
  } else if (content) {
    for (var i = 0; i < content.length; ++i) {
      e.appendChild(content[i]);
    }
  }
  for (var attr in attrs || {}) {
    e.setAttribute(attr, attrs[attr]);
  }
  return e;
};

firepad.utils.setTextContent = function(e, str) {
  e.innerHTML = "";
  e.appendChild(document.createTextNode(str));
};

firepad.utils.on = function(emitter, type, f, capture) {
  if (emitter.addEventListener) {
    emitter.addEventListener(type, f, capture || false);
  } else if (emitter.attachEvent) {
    emitter.attachEvent("on" + type, f);
  }
};

firepad.utils.off = function(emitter, type, f, capture) {
  if (emitter.removeEventListener) {
    emitter.removeEventListener(type, f, capture || false);
  } else if (emitter.detachEvent) {
    emitter.detachEvent("on" + type, f);
  }
};

firepad.utils.preventDefault = function(e) {
  if (e.preventDefault) {
    e.preventDefault();
  } else {
    e.returnValue = false;
  }
};

firepad.utils.stopPropagation = function(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  } else {
    e.cancelBubble = true;
  }
};

firepad.utils.stopEvent = function(e) {
  firepad.utils.preventDefault(e);
  firepad.utils.stopPropagation(e);
};

firepad.utils.stopEventAnd = function(fn) {
  return function(e) {
    fn(e);
    firepad.utils.stopEvent(e);
    return false;
  };
};

firepad.utils.trim = function(str) {
  return str.replace(/^\s+/g, "").replace(/\s+$/g, "");
};

firepad.utils.stringEndsWith = function(str, suffix) {
  var list = typeof suffix == "string" ? [suffix] : suffix;
  for (var i = 0; i < list.length; i++) {
    var suffix = list[i];
    if (str.indexOf(suffix, str.length - suffix.length) !== -1) return true;
  }
  return false;
};

firepad.utils.assert = function assert(b, msg) {
  if (!b) {
    throw new Error(msg || "assertion error");
  }
};

firepad.utils.log = function() {
  if (typeof console !== "undefined" && typeof console.log !== "undefined") {
    var args = ["Firepad:"];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    console.log.apply(console, args);
  }
};

var firepad = firepad || {};
firepad.Span = (function() {
  function Span(pos, length) {
    this.pos = pos;
    this.length = length;
  }

  Span.prototype.end = function() {
    return this.pos + this.length;
  };

  return Span;
})();

var firepad = firepad || {};

firepad.TextOp = (function() {
  var utils = firepad.utils;

  // Operation are essentially lists of ops. There are three types of ops:
  //
  // * Retain ops: Advance the cursor position by a given number of characters.
  //   Represented by positive ints.
  // * Insert ops: Insert a given string at the current cursor position.
  //   Represented by strings.
  // * Delete ops: Delete the next n characters. Represented by negative ints.
  function TextOp(type) {
    this.type = type;
    this.chars = null;
    this.text = null;
    this.attributes = null;

    if (type === "insert") {
      this.text = arguments[1];
      utils.assert(typeof this.text === "string");
      this.attributes = arguments[2] || {};
      utils.assert(typeof this.attributes === "object");
    } else if (type === "delete") {
      this.chars = arguments[1];
      utils.assert(typeof this.chars === "number");
    } else if (type === "retain") {
      this.chars = arguments[1];
      utils.assert(typeof this.chars === "number");
      this.attributes = arguments[2] || {};
      utils.assert(typeof this.attributes === "object");
    }
  }

  TextOp.prototype.isInsert = function() {
    return this.type === "insert";
  };
  TextOp.prototype.isDelete = function() {
    return this.type === "delete";
  };
  TextOp.prototype.isRetain = function() {
    return this.type === "retain";
  };

  TextOp.prototype.equals = function(other) {
    return (
      this.type === other.type &&
      this.text === other.text &&
      this.chars === other.chars &&
      this.attributesEqual(other.attributes)
    );
  };

  TextOp.prototype.attributesEqual = function(otherAttributes) {
    for (var attr in this.attributes) {
      if (this.attributes[attr] !== otherAttributes[attr]) {
        return false;
      }
    }

    for (attr in otherAttributes) {
      if (this.attributes[attr] !== otherAttributes[attr]) {
        return false;
      }
    }

    return true;
  };

  TextOp.prototype.hasEmptyAttributes = function() {
    var empty = true;
    for (var attr in this.attributes) {
      empty = false;
      break;
    }

    return empty;
  };

  return TextOp;
})();

var firepad = firepad || {};

firepad.TextOperation = (function() {
  "use strict";
  var TextOp = firepad.TextOp;
  var utils = firepad.utils;

  // Constructor for new operations.
  function TextOperation() {
    if (!this || this.constructor !== TextOperation) {
      // => function was called without 'new'
      return new TextOperation();
    }

    // When an operation is applied to an input string, you can think of this as
    // if an imaginary cursor runs over the entire string and skips over some
    // parts, deletes some parts and inserts characters at some positions. These
    // actions (skip/delete/insert) are stored as an array in the "ops" property.
    this.ops = [];
    // An operation's baseLength is the length of every string the operation
    // can be applied to.
    this.baseLength = 0;
    // The targetLength is the length of every string that results from applying
    // the operation on a valid input string.
    this.targetLength = 0;
  }

  TextOperation.prototype.equals = function(other) {
    if (this.baseLength !== other.baseLength) {
      return false;
    }
    if (this.targetLength !== other.targetLength) {
      return false;
    }
    if (this.ops.length !== other.ops.length) {
      return false;
    }
    for (var i = 0; i < this.ops.length; i++) {
      if (!this.ops[i].equals(other.ops[i])) {
        return false;
      }
    }
    return true;
  };

  // After an operation is constructed, the user of the library can specify the
  // actions of an operation (skip/insert/delete) with these three builder
  // methods. They all return the operation for convenient chaining.

  // Skip over a given number of characters.
  TextOperation.prototype.retain = function(n, attributes) {
    if (typeof n !== "number" || n < 0) {
      throw new Error("retain expects a positive integer.");
    }
    if (n === 0) {
      return this;
    }
    this.baseLength += n;
    this.targetLength += n;
    attributes = attributes || {};
    var prevOp = this.ops.length > 0 ? this.ops[this.ops.length - 1] : null;
    if (prevOp && prevOp.isRetain() && prevOp.attributesEqual(attributes)) {
      // The last op is a retain op with the same attributes => we can merge them into one op.
      prevOp.chars += n;
    } else {
      // Create a new op.
      this.ops.push(new TextOp("retain", n, attributes));
    }
    return this;
  };

  // Insert a string at the current position.
  TextOperation.prototype.insert = function(str, attributes) {
    if (typeof str !== "string") {
      throw new Error("insert expects a string");
    }
    if (str === "") {
      return this;
    }
    attributes = attributes || {};
    this.targetLength += str.length;
    var prevOp = this.ops.length > 0 ? this.ops[this.ops.length - 1] : null;
    var prevPrevOp = this.ops.length > 1 ? this.ops[this.ops.length - 2] : null;
    if (prevOp && prevOp.isInsert() && prevOp.attributesEqual(attributes)) {
      // Merge insert op.
      prevOp.text += str;
    } else if (prevOp && prevOp.isDelete()) {
      // It doesn't matter when an operation is applied whether the operation
      // is delete(3), insert("something") or insert("something"), delete(3).
      // Here we enforce that in this case, the insert op always comes first.
      // This makes all operations that have the same effect when applied to
      // a document of the right length equal in respect to the `equals` method.
      if (
        prevPrevOp &&
        prevPrevOp.isInsert() &&
        prevPrevOp.attributesEqual(attributes)
      ) {
        prevPrevOp.text += str;
      } else {
        this.ops[this.ops.length - 1] = new TextOp("insert", str, attributes);
        this.ops.push(prevOp);
      }
    } else {
      this.ops.push(new TextOp("insert", str, attributes));
    }
    return this;
  };

  // Delete a string at the current position.
  TextOperation.prototype["delete"] = function(n) {
    if (typeof n === "string") {
      n = n.length;
    }
    if (typeof n !== "number" || n < 0) {
      throw new Error("delete expects a positive integer or a string");
    }
    if (n === 0) {
      return this;
    }
    this.baseLength += n;
    var prevOp = this.ops.length > 0 ? this.ops[this.ops.length - 1] : null;
    if (prevOp && prevOp.isDelete()) {
      prevOp.chars += n;
    } else {
      this.ops.push(new TextOp("delete", n));
    }
    return this;
  };

  // Tests whether this operation has no effect.
  TextOperation.prototype.isNoop = function() {
    return (
      this.ops.length === 0 ||
      (this.ops.length === 1 &&
        (this.ops[0].isRetain() && this.ops[0].hasEmptyAttributes()))
    );
  };

  TextOperation.prototype.clone = function() {
    var clone = new TextOperation();
    for (var i = 0; i < this.ops.length; i++) {
      if (this.ops[i].isRetain()) {
        clone.retain(this.ops[i].chars, this.ops[i].attributes);
      } else if (this.ops[i].isInsert()) {
        clone.insert(this.ops[i].text, this.ops[i].attributes);
      } else {
        clone["delete"](this.ops[i].chars);
      }
    }

    return clone;
  };

  // Pretty printing.
  TextOperation.prototype.toString = function() {
    // map: build a new array by applying a function to every element in an old
    // array.
    var map =
      Array.prototype.map ||
      function(fn) {
        var arr = this;
        var newArr = [];
        for (var i = 0, l = arr.length; i < l; i++) {
          newArr[i] = fn(arr[i]);
        }
        return newArr;
      };
    return map
      .call(this.ops, function(op) {
        if (op.isRetain()) {
          return "retain " + op.chars;
        } else if (op.isInsert()) {
          return "insert '" + op.text + "'";
        } else {
          return "delete " + op.chars;
        }
      })
      .join(", ");
  };

  // Converts operation into a JSON value.
  TextOperation.prototype.toJSON = function() {
    var ops = [];
    for (var i = 0; i < this.ops.length; i++) {
      // We prefix ops with their attributes if non-empty.
      if (!this.ops[i].hasEmptyAttributes()) {
        ops.push(this.ops[i].attributes);
      }
      if (this.ops[i].type === "retain") {
        ops.push(this.ops[i].chars);
      } else if (this.ops[i].type === "insert") {
        ops.push(this.ops[i].text);
      } else if (this.ops[i].type === "delete") {
        ops.push(-this.ops[i].chars);
      }
    }
    // Return an array with /something/ in it, since an empty array will be treated as null by Firebase.
    if (ops.length === 0) {
      ops.push(0);
    }
    return ops;
  };

  // Converts a plain JS object into an operation and validates it.
  TextOperation.fromJSON = function(ops) {
    var o = new TextOperation();
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      var attributes = {};
      if (typeof op === "object") {
        attributes = op;
        i++;
        op = ops[i];
      }
      if (typeof op === "number") {
        if (op > 0) {
          o.retain(op, attributes);
        } else {
          o["delete"](-op);
        }
      } else {
        utils.assert(typeof op === "string");
        o.insert(op, attributes);
      }
    }
    return o;
  };

  // Apply an operation to a string, returning a new string. Throws an error if
  // there's a mismatch between the input string and the operation.
  TextOperation.prototype.apply = function(str, oldAttributes, newAttributes) {
    var operation = this;
    oldAttributes = oldAttributes || [];
    newAttributes = newAttributes || [];
    if (str.length !== operation.baseLength) {
      throw new Error(
        "The operation's base length must be equal to the string's length."
      );
    }
    var newStringParts = [],
      j = 0,
      k,
      attr;
    var oldIndex = 0;
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.isRetain()) {
        if (oldIndex + op.chars > str.length) {
          throw new Error(
            "Operation can't retain more characters than are left in the string."
          );
        }
        // Copy skipped part of the retained string.
        newStringParts[j++] = str.slice(oldIndex, oldIndex + op.chars);

        // Copy (and potentially update) attributes for each char in retained string.
        for (k = 0; k < op.chars; k++) {
          var currAttributes = oldAttributes[oldIndex + k] || {},
            updatedAttributes = {};
          for (attr in currAttributes) {
            updatedAttributes[attr] = currAttributes[attr];
            utils.assert(updatedAttributes[attr] !== false);
          }
          for (attr in op.attributes) {
            if (op.attributes[attr] === false) {
              delete updatedAttributes[attr];
            } else {
              updatedAttributes[attr] = op.attributes[attr];
            }
            utils.assert(updatedAttributes[attr] !== false);
          }
          newAttributes.push(updatedAttributes);
        }

        oldIndex += op.chars;
      } else if (op.isInsert()) {
        // Insert string.
        newStringParts[j++] = op.text;

        // Insert attributes for each char.
        for (k = 0; k < op.text.length; k++) {
          var insertedAttributes = {};
          for (attr in op.attributes) {
            insertedAttributes[attr] = op.attributes[attr];
            utils.assert(insertedAttributes[attr] !== false);
          }
          newAttributes.push(insertedAttributes);
        }
      } else {
        // delete op
        oldIndex += op.chars;
      }
    }
    if (oldIndex !== str.length) {
      throw new Error("The operation didn't operate on the whole string.");
    }
    var newString = newStringParts.join("");
    utils.assert(newString.length === newAttributes.length);

    return newString;
  };

  // Computes the inverse of an operation. The inverse of an operation is the
  // operation that reverts the effects of the operation, e.g. when you have an
  // operation 'insert("hello "); skip(6);' then the inverse is 'delete("hello ");
  // skip(6);'. The inverse should be used for implementing undo.
  TextOperation.prototype.invert = function(str) {
    var strIndex = 0;
    var inverse = new TextOperation();
    var ops = this.ops;
    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.isRetain()) {
        inverse.retain(op.chars);
        strIndex += op.chars;
      } else if (op.isInsert()) {
        inverse["delete"](op.text.length);
      } else {
        // delete op
        inverse.insert(str.slice(strIndex, strIndex + op.chars));
        strIndex += op.chars;
      }
    }
    return inverse;
  };

  // Compose merges two consecutive operations into one operation, that
  // preserves the changes of both. Or, in other words, for each input string S
  // and a pair of consecutive operations A and B,
  // apply(apply(S, A), B) = apply(S, compose(A, B)) must hold.
  TextOperation.prototype.compose = function(operation2) {
    var operation1 = this;
    if (operation1.targetLength !== operation2.baseLength) {
      throw new Error(
        "The base length of the second operation has to be the target length of the first operation"
      );
    }

    function composeAttributes(first, second, firstOpIsInsert) {
      var merged = {},
        attr;
      for (attr in first) {
        merged[attr] = first[attr];
      }
      for (attr in second) {
        if (firstOpIsInsert && second[attr] === false) {
          delete merged[attr];
        } else {
          merged[attr] = second[attr];
        }
      }
      return merged;
    }

    var operation = new TextOperation(); // the combined operation
    var ops1 = operation1.clone().ops,
      ops2 = operation2.clone().ops;
    var i1 = 0,
      i2 = 0; // current index into ops1 respectively ops2
    var op1 = ops1[i1++],
      op2 = ops2[i2++]; // current ops
    var attributes;
    while (true) {
      // Dispatch on the type of op1 and op2
      if (typeof op1 === "undefined" && typeof op2 === "undefined") {
        // end condition: both ops1 and ops2 have been processed
        break;
      }

      if (op1 && op1.isDelete()) {
        operation["delete"](op1.chars);
        op1 = ops1[i1++];
        continue;
      }
      if (op2 && op2.isInsert()) {
        operation.insert(op2.text, op2.attributes);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === "undefined") {
        throw new Error(
          "Cannot compose operations: first operation is too short."
        );
      }
      if (typeof op2 === "undefined") {
        throw new Error(
          "Cannot compose operations: first operation is too long."
        );
      }

      if (op1.isRetain() && op2.isRetain()) {
        attributes = composeAttributes(op1.attributes, op2.attributes);
        if (op1.chars > op2.chars) {
          operation.retain(op2.chars, attributes);
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          operation.retain(op1.chars, attributes);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.retain(op1.chars, attributes);
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
      } else if (op1.isInsert() && op2.isDelete()) {
        if (op1.text.length > op2.chars) {
          op1.text = op1.text.slice(op2.chars);
          op2 = ops2[i2++];
        } else if (op1.text.length === op2.chars) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op2.chars -= op1.text.length;
          op1 = ops1[i1++];
        }
      } else if (op1.isInsert() && op2.isRetain()) {
        attributes = composeAttributes(
          op1.attributes,
          op2.attributes,
          /*firstOpIsInsert=*/ true
        );
        if (op1.text.length > op2.chars) {
          operation.insert(op1.text.slice(0, op2.chars), attributes);
          op1.text = op1.text.slice(op2.chars);
          op2 = ops2[i2++];
        } else if (op1.text.length === op2.chars) {
          operation.insert(op1.text, attributes);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation.insert(op1.text, attributes);
          op2.chars -= op1.text.length;
          op1 = ops1[i1++];
        }
      } else if (op1.isRetain() && op2.isDelete()) {
        if (op1.chars > op2.chars) {
          operation["delete"](op2.chars);
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          operation["delete"](op2.chars);
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          operation["delete"](op1.chars);
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
      } else {
        throw new Error(
          "This shouldn't happen: op1: " +
            JSON.stringify(op1) +
            ", op2: " +
            JSON.stringify(op2)
        );
      }
    }
    return operation;
  };

  function getSimpleOp(operation) {
    var ops = operation.ops;
    switch (ops.length) {
      case 1:
        return ops[0];
      case 2:
        return ops[0].isRetain() ? ops[1] : ops[1].isRetain() ? ops[0] : null;
      case 3:
        if (ops[0].isRetain() && ops[2].isRetain()) {
          return ops[1];
        }
    }
    return null;
  }

  function getStartIndex(operation) {
    if (operation.ops[0].isRetain()) {
      return operation.ops[0].chars;
    }
    return 0;
  }

  // When you use ctrl-z to undo your latest changes, you expect the program not
  // to undo every single keystroke but to undo your last sentence you wrote at
  // a stretch or the deletion you did by holding the backspace key down. This
  // This can be implemented by composing operations on the undo stack. This
  // method can help decide whether two operations should be composed. It
  // returns true if the operations are consecutive insert operations or both
  // operations delete text at the same position. You may want to include other
  // factors like the time since the last change in your decision.
  TextOperation.prototype.shouldBeComposedWith = function(other) {
    if (this.isNoop() || other.isNoop()) {
      return true;
    }

    var startA = getStartIndex(this),
      startB = getStartIndex(other);
    var simpleA = getSimpleOp(this),
      simpleB = getSimpleOp(other);
    if (!simpleA || !simpleB) {
      return false;
    }

    if (simpleA.isInsert() && simpleB.isInsert()) {
      return startA + simpleA.text.length === startB;
    }

    if (simpleA.isDelete() && simpleB.isDelete()) {
      // there are two possibilities to delete: with backspace and with the
      // delete key.
      return startB + simpleB.chars === startA || startA === startB;
    }

    return false;
  };

  // Decides whether two operations should be composed with each other
  // if they were inverted, that is
  // `shouldBeComposedWith(a, b) = shouldBeComposedWithInverted(b^{-1}, a^{-1})`.
  TextOperation.prototype.shouldBeComposedWithInverted = function(other) {
    if (this.isNoop() || other.isNoop()) {
      return true;
    }

    var startA = getStartIndex(this),
      startB = getStartIndex(other);
    var simpleA = getSimpleOp(this),
      simpleB = getSimpleOp(other);
    if (!simpleA || !simpleB) {
      return false;
    }

    if (simpleA.isInsert() && simpleB.isInsert()) {
      return startA + simpleA.text.length === startB || startA === startB;
    }

    if (simpleA.isDelete() && simpleB.isDelete()) {
      return startB + simpleB.chars === startA;
    }

    return false;
  };

  TextOperation.transformAttributes = function(attributes1, attributes2) {
    var attributes1prime = {},
      attributes2prime = {};
    var attr,
      allAttrs = {};
    for (attr in attributes1) {
      allAttrs[attr] = true;
    }
    for (attr in attributes2) {
      allAttrs[attr] = true;
    }

    for (attr in allAttrs) {
      var attr1 = attributes1[attr],
        attr2 = attributes2[attr];
      utils.assert(attr1 != null || attr2 != null);
      if (attr1 == null) {
        // Only modified by attributes2; keep it.
        attributes2prime[attr] = attr2;
      } else if (attr2 == null) {
        // only modified by attributes1; keep it
        attributes1prime[attr] = attr1;
      } else if (attr1 === attr2) {
        // Both set it to the same value.  Nothing to do.
      } else {
        // attr1 and attr2 are different. Prefer attr1.
        attributes1prime[attr] = attr1;
      }
    }
    return [attributes1prime, attributes2prime];
  };

  // Transform takes two operations A and B that happened concurrently and
  // produces two operations A' and B' (in an array) such that
  // `apply(apply(S, A), B') = apply(apply(S, B), A')`. This function is the
  // heart of OT.
  TextOperation.transform = function(operation1, operation2) {
    if (operation1.baseLength !== operation2.baseLength) {
      throw new Error("Both operations have to have the same base length");
    }

    var operation1prime = new TextOperation();
    var operation2prime = new TextOperation();
    var ops1 = operation1.clone().ops,
      ops2 = operation2.clone().ops;
    var i1 = 0,
      i2 = 0;
    var op1 = ops1[i1++],
      op2 = ops2[i2++];
    while (true) {
      // At every iteration of the loop, the imaginary cursor that both
      // operation1 and operation2 have that operates on the input string must
      // have the same position in the input string.

      if (typeof op1 === "undefined" && typeof op2 === "undefined") {
        // end condition: both ops1 and ops2 have been processed
        break;
      }

      // next two cases: one or both ops are insert ops
      // => insert the string in the corresponding prime operation, skip it in
      // the other one. If both op1 and op2 are insert ops, prefer op1.
      if (op1 && op1.isInsert()) {
        operation1prime.insert(op1.text, op1.attributes);
        operation2prime.retain(op1.text.length);
        op1 = ops1[i1++];
        continue;
      }
      if (op2 && op2.isInsert()) {
        operation1prime.retain(op2.text.length);
        operation2prime.insert(op2.text, op2.attributes);
        op2 = ops2[i2++];
        continue;
      }

      if (typeof op1 === "undefined") {
        throw new Error(
          "Cannot transform operations: first operation is too short."
        );
      }
      if (typeof op2 === "undefined") {
        throw new Error(
          "Cannot transform operations: first operation is too long."
        );
      }

      var minl;
      if (op1.isRetain() && op2.isRetain()) {
        // Simple case: retain/retain
        var attributesPrime = TextOperation.transformAttributes(
          op1.attributes,
          op2.attributes
        );
        if (op1.chars > op2.chars) {
          minl = op2.chars;
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          minl = op2.chars;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1.chars;
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }

        operation1prime.retain(minl, attributesPrime[0]);
        operation2prime.retain(minl, attributesPrime[1]);
      } else if (op1.isDelete() && op2.isDelete()) {
        // Both operations delete the same string at the same position. We don't
        // need to produce any operations, we just skip over the delete ops and
        // handle the case that one operation deletes more than the other.
        if (op1.chars > op2.chars) {
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
        // next two cases: delete/retain and retain/delete
      } else if (op1.isDelete() && op2.isRetain()) {
        if (op1.chars > op2.chars) {
          minl = op2.chars;
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          minl = op2.chars;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1.chars;
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
        operation1prime["delete"](minl);
      } else if (op1.isRetain() && op2.isDelete()) {
        if (op1.chars > op2.chars) {
          minl = op2.chars;
          op1.chars -= op2.chars;
          op2 = ops2[i2++];
        } else if (op1.chars === op2.chars) {
          minl = op1.chars;
          op1 = ops1[i1++];
          op2 = ops2[i2++];
        } else {
          minl = op1.chars;
          op2.chars -= op1.chars;
          op1 = ops1[i1++];
        }
        operation2prime["delete"](minl);
      } else {
        throw new Error("The two operations aren't compatible");
      }
    }

    return [operation1prime, operation2prime];
  };

  // convenience method to write transform(a, b) as a.transform(b)
  TextOperation.prototype.transform = function(other) {
    return TextOperation.transform(this, other);
  };

  return TextOperation;
})();

var firepad = firepad || {};

// TODO: Rewrite this (probably using a splay tree) to be efficient.  Right now it's based on a linked list
// so all operations are O(n), where n is the number of spans in the list.
firepad.AnnotationList = (function() {
  var Span = firepad.Span;

  function assert(bool, text) {
    if (!bool) {
      throw new Error(
        "AnnotationList assertion failed" + (text ? ": " + text : "")
      );
    }
  }

  function OldAnnotatedSpan(pos, node) {
    this.pos = pos;
    this.length = node.length;
    this.annotation = node.annotation;
    this.attachedObject_ = node.attachedObject;
  }

  OldAnnotatedSpan.prototype.getAttachedObject = function() {
    return this.attachedObject_;
  };

  function NewAnnotatedSpan(pos, node) {
    this.pos = pos;
    this.length = node.length;
    this.annotation = node.annotation;
    this.node_ = node;
  }

  NewAnnotatedSpan.prototype.attachObject = function(object) {
    this.node_.attachedObject = object;
  };

  var NullAnnotation = {
    equals: function() {
      return false;
    }
  };

  function AnnotationList(changeHandler) {
    // There's always a head node; to avoid special cases.
    this.head_ = new Node(0, NullAnnotation);
    this.changeHandler_ = changeHandler;
  }

  AnnotationList.prototype.insertAnnotatedSpan = function(span, annotation) {
    this.wrapOperation_(new Span(span.pos, 0), function(oldPos, old) {
      assert(!old || old.next === null); // should be 0 or 1 nodes.
      var toInsert = new Node(span.length, annotation);
      if (!old) {
        return toInsert;
      } else {
        assert(span.pos > oldPos && span.pos < oldPos + old.length);
        var newNodes = new Node(0, NullAnnotation);
        // Insert part of old before insertion point.
        newNodes.next = new Node(span.pos - oldPos, old.annotation);
        // Insert new node.
        newNodes.next.next = toInsert;
        // Insert part of old after insertion point.
        toInsert.next = new Node(
          oldPos + old.length - span.pos,
          old.annotation
        );
        return newNodes.next;
      }
    });
  };

  AnnotationList.prototype.removeSpan = function(removeSpan) {
    if (removeSpan.length === 0) {
      return;
    }

    this.wrapOperation_(removeSpan, function(oldPos, old) {
      assert(old !== null);
      var newNodes = new Node(0, NullAnnotation),
        current = newNodes;
      // Add new node for part before the removed span (if any).
      if (removeSpan.pos > oldPos) {
        current.next = new Node(removeSpan.pos - oldPos, old.annotation);
        current = current.next;
      }

      // Skip over removed nodes.
      while (removeSpan.end() > oldPos + old.length) {
        oldPos += old.length;
        old = old.next;
      }

      // Add new node for part after the removed span (if any).
      var afterChars = oldPos + old.length - removeSpan.end();
      if (afterChars > 0) {
        current.next = new Node(afterChars, old.annotation);
      }

      return newNodes.next;
    });
  };

  AnnotationList.prototype.updateSpan = function(span, updateFn) {
    if (span.length === 0) {
      return;
    }

    this.wrapOperation_(span, function(oldPos, old) {
      assert(old !== null);
      var newNodes = new Node(0, NullAnnotation),
        current = newNodes,
        currentPos = oldPos;

      // Add node for any characters before the span we're updating.
      var beforeChars = span.pos - currentPos;
      assert(beforeChars < old.length);
      if (beforeChars > 0) {
        current.next = new Node(beforeChars, old.annotation);
        current = current.next;
        currentPos += current.length;
      }

      // Add updated nodes for entirely updated nodes.
      while (old !== null && span.end() >= oldPos + old.length) {
        var length = oldPos + old.length - currentPos;
        current.next = new Node(length, updateFn(old.annotation, length));
        current = current.next;
        oldPos += old.length;
        old = old.next;
        currentPos = oldPos;
      }

      // Add updated nodes for last node.
      var updateChars = span.end() - currentPos;
      if (updateChars > 0) {
        assert(updateChars < old.length);
        current.next = new Node(
          updateChars,
          updateFn(old.annotation, updateChars)
        );
        current = current.next;
        currentPos += current.length;

        // Add non-updated remaining part of node.
        current.next = new Node(
          oldPos + old.length - currentPos,
          old.annotation
        );
      }

      return newNodes.next;
    });
  };

  AnnotationList.prototype.wrapOperation_ = function(span, operationFn) {
    if (span.pos < 0) {
      throw new Error("Span start cannot be negative.");
    }
    var oldNodes = [],
      newNodes = [];

    var res = this.getAffectedNodes_(span);

    var tail;
    if (res.start !== null) {
      tail = res.end.next;
      // Temporarily truncate list so we can pass it to operationFn.  We'll splice it back in later.
      res.end.next = null;
    } else {
      // start and end are null, because span is empty and lies on the border of two nodes.
      tail = res.succ;
    }

    // Create a new segment to replace the affected nodes.
    var newSegment = operationFn(res.startPos, res.start);

    var includePredInOldNodes = false,
      includeSuccInOldNodes = false;
    if (newSegment) {
      this.mergeNodesWithSameAnnotations_(newSegment);

      var newPos;
      if (res.pred && res.pred.annotation.equals(newSegment.annotation)) {
        // We can merge the pred node with newSegment's first node.
        includePredInOldNodes = true;
        newSegment.length += res.pred.length;

        // Splice newSegment in after beforePred.
        res.beforePred.next = newSegment;
        newPos = res.predPos;
      } else {
        // Splice newSegment in after beforeStart.
        res.beforeStart.next = newSegment;
        newPos = res.startPos;
      }

      // Generate newNodes, but not the last one (since we may be able to merge it with succ).
      while (newSegment.next) {
        newNodes.push(new NewAnnotatedSpan(newPos, newSegment));
        newPos += newSegment.length;
        newSegment = newSegment.next;
      }

      if (res.succ && res.succ.annotation.equals(newSegment.annotation)) {
        // We can merge newSegment's last node with the succ node.
        newSegment.length += res.succ.length;
        includeSuccInOldNodes = true;

        // Splice rest of list after succ after newSegment.
        newSegment.next = res.succ.next;
      } else {
        // Splice tail after newSegment.
        newSegment.next = tail;
      }

      // Add last newSegment node to newNodes.
      newNodes.push(new NewAnnotatedSpan(newPos, newSegment));
    } else {
      // newList is empty.  Try to merge pred and succ.
      if (
        res.pred &&
        res.succ &&
        res.pred.annotation.equals(res.succ.annotation)
      ) {
        includePredInOldNodes = true;
        includeSuccInOldNodes = true;

        // Create succ + pred merged node and splice list together.
        newSegment = new Node(
          res.pred.length + res.succ.length,
          res.pred.annotation
        );
        res.beforePred.next = newSegment;
        newSegment.next = res.succ.next;

        newNodes.push(
          new NewAnnotatedSpan(res.startPos - res.pred.length, newSegment)
        );
      } else {
        // Just splice list back together.
        res.beforeStart.next = tail;
      }
    }

    // Build list of oldNodes.

    if (includePredInOldNodes) {
      oldNodes.push(new OldAnnotatedSpan(res.predPos, res.pred));
    }

    var oldPos = res.startPos,
      oldSegment = res.start;
    while (oldSegment !== null) {
      oldNodes.push(new OldAnnotatedSpan(oldPos, oldSegment));
      oldPos += oldSegment.length;
      oldSegment = oldSegment.next;
    }

    if (includeSuccInOldNodes) {
      oldNodes.push(new OldAnnotatedSpan(oldPos, res.succ));
    }

    this.changeHandler_(oldNodes, newNodes);
  };

  AnnotationList.prototype.getAffectedNodes_ = function(span) {
    // We want to find nodes 'start', 'end', 'beforeStart', 'pred', and 'succ' where:
    //  - 'start' contains the first character in span.
    //  - 'end' contains the last character in span.
    //  - 'beforeStart' is the node before 'start'.
    //  - 'beforePred' is the node before 'pred'.
    //  - 'succ' contains the node after 'end' if span.end() was on a node boundary, else null.
    //  - 'pred' contains the node before 'start' if span.pos was on a node boundary, else null.

    var result = {};

    var prevprev = null,
      prev = this.head_,
      current = prev.next,
      currentPos = 0;
    while (current !== null && span.pos >= currentPos + current.length) {
      currentPos += current.length;
      prevprev = prev;
      prev = current;
      current = current.next;
    }
    if (current === null && !(span.length === 0 && span.pos === currentPos)) {
      throw new Error("Span start exceeds the bounds of the AnnotationList.");
    }

    result.startPos = currentPos;
    // Special case if span is empty and on the border of two nodes
    if (span.length === 0 && span.pos === currentPos) {
      result.start = null;
    } else {
      result.start = current;
    }
    result.beforeStart = prev;

    if (currentPos === span.pos && currentPos > 0) {
      result.pred = prev;
      result.predPos = currentPos - prev.length;
      result.beforePred = prevprev;
    } else {
      result.pred = null;
    }

    while (current !== null && span.end() > currentPos) {
      currentPos += current.length;
      prev = current;
      current = current.next;
    }
    if (span.end() > currentPos) {
      throw new Error("Span end exceeds the bounds of the AnnotationList.");
    }

    // Special case if span is empty and on the border of two nodes.
    if (span.length === 0 && span.end() === currentPos) {
      result.end = null;
    } else {
      result.end = prev;
    }
    result.succ = currentPos === span.end() ? current : null;

    return result;
  };

  AnnotationList.prototype.mergeNodesWithSameAnnotations_ = function(list) {
    if (!list) {
      return;
    }
    var prev = null,
      curr = list;
    while (curr) {
      if (prev && prev.annotation.equals(curr.annotation)) {
        prev.length += curr.length;
        prev.next = curr.next;
      } else {
        prev = curr;
      }
      curr = curr.next;
    }
  };

  AnnotationList.prototype.forEach = function(callback) {
    var current = this.head_.next;
    while (current !== null) {
      callback(current.length, current.annotation, current.attachedObject);
      current = current.next;
    }
  };

  AnnotationList.prototype.getAnnotatedSpansForPos = function(pos) {
    var currentPos = 0;
    var current = this.head_.next,
      prev = null;
    while (current !== null && currentPos + current.length <= pos) {
      currentPos += current.length;
      prev = current;
      current = current.next;
    }
    if (current === null && currentPos !== pos) {
      throw new Error("pos exceeds the bounds of the AnnotationList");
    }

    var res = [];
    if (currentPos === pos && prev) {
      res.push(new OldAnnotatedSpan(currentPos - prev.length, prev));
    }
    if (current) {
      res.push(new OldAnnotatedSpan(currentPos, current));
    }
    return res;
  };

  AnnotationList.prototype.getAnnotatedSpansForSpan = function(span) {
    if (span.length === 0) {
      return [];
    }
    var oldSpans = [];
    var res = this.getAffectedNodes_(span);
    var currentPos = res.startPos,
      current = res.start;
    while (current !== null && currentPos < span.end()) {
      var start = Math.max(currentPos, span.pos),
        end = Math.min(currentPos + current.length, span.end());
      var oldSpan = new Span(start, end - start);
      oldSpan.annotation = current.annotation;
      oldSpans.push(oldSpan);

      currentPos += current.length;
      current = current.next;
    }
    return oldSpans;
  };

  AnnotationList.prototype.getAllAnnotations = function() {
    var annotations = [];
    var current = this.head_.next;

    while (current !== null) {
      annotations.push(current.annotation);
      current = current.next;
    }

    return annotations;
  };

  // For testing.
  AnnotationList.prototype.count = function() {
    var count = 0;
    var current = this.head_.next,
      prev = null;
    while (current !== null) {
      if (prev) {
        assert(!prev.annotation.equals(current.annotation));
      }
      prev = current;
      current = current.next;
      count++;
    }
    return count;
  };

  function Node(length, annotation) {
    this.length = length;
    this.annotation = annotation;
    this.attachedObject = null;
    this.next = null;
  }

  Node.prototype.clone = function() {
    var node = new Node(this.spanLength, this.annotation);
    node.next = this.next;
    return node;
  };

  return AnnotationList;
})();

var firepad = firepad || {};
firepad.Cursor = (function() {
  "use strict";

  // A cursor has a `position` and a `selectionEnd`. Both are zero-based indexes
  // into the document. When nothing is selected, `selectionEnd` is equal to
  // `position`. When there is a selection, `position` is always the side of the
  // selection that would move if you pressed an arrow key.
  function Cursor(position, selectionEnd) {
    this.position = position;
    this.selectionEnd = selectionEnd;
  }

  Cursor.fromJSON = function(obj) {
    return new Cursor(obj.position, obj.selectionEnd);
  };

  Cursor.prototype.equals = function(other) {
    return (
      this.position === other.position &&
      this.selectionEnd === other.selectionEnd
    );
  };

  // Return the more current cursor information.
  Cursor.prototype.compose = function(other) {
    return other;
  };

  // Update the cursor with respect to an operation.
  Cursor.prototype.transform = function(other) {
    function transformIndex(index) {
      var newIndex = index;
      var ops = other.ops;
      for (var i = 0, l = other.ops.length; i < l; i++) {
        if (ops[i].isRetain()) {
          index -= ops[i].chars;
        } else if (ops[i].isInsert()) {
          newIndex += ops[i].text.length;
        } else {
          newIndex -= Math.min(index, ops[i].chars);
          index -= ops[i].chars;
        }
        if (index < 0) {
          break;
        }
      }
      return newIndex;
    }

    var newPosition = transformIndex(this.position);
    if (this.position === this.selectionEnd) {
      return new Cursor(newPosition, newPosition);
    }
    return new Cursor(newPosition, transformIndex(this.selectionEnd));
  };

  return Cursor;
})();

var firepad = firepad || {};

firepad.FirebaseAdapter = (function() {
  if (
    typeof firebase === "undefined" &&
    typeof require === "function" &&
    typeof Firebase !== "function"
  ) {
    firebase = require("firebase");
  }

  var TextOperation = firepad.TextOperation;
  var utils = firepad.utils;

  // Save a checkpoint every 100 edits.
  var CHECKPOINT_FREQUENCY = 100;

  function FirebaseAdapter(ref, deviceId, userId, userColor, userName) {
    this.ref_ = ref;
    this.ready_ = false;
    this.firebaseCallbacks_ = [];
    this.zombie_ = false;
    this.deviceId_ = deviceId || ref.push().key;
    this.color_ = userColor || null;
    this.name_ = userName || null;

    // We store the current document state as a TextOperation so we can write checkpoints to Firebase occasionally.
    // TODO: Consider more efficient ways to do this. (composing text operations is ~linear in the length of the document).
    this.document_ = new TextOperation();

    // The next expected revision.
    this.revision_ = 0;

    // This is used for two purposes:
    // 1) On initialization, we fill this with the latest checkpoint and any subsequent operations and then
    //      process them all together.
    // 2) If we ever receive revisions out-of-order (e.g. rev 5 before rev 4), we queue them here until it's time
    //    for them to be handled. [this should never happen with well-behaved clients; but if it /does/ happen we want
    //    to handle it gracefully.]
    this.pendingReceivedRevisions_ = {};

    if (!userId) {
      userId = ref.push().key;
    }

    this.setUserId(userId);

    var connectedRef = ref.root.child(".info/connected");
    var self = this;

    this.firebaseOn_(
      connectedRef,
      "value",
      function(snapshot) {
        if (snapshot.val() === true) {
          self.initializeUserData_();
        }
      },
      this
    );

    // Once we're initialized, start tracking users' cursors.
    this.on("ready", function() {
      self.monitorCursors_();
    });

    // Avoid triggering any events until our callers have had a chance to attach their listeners.
    setTimeout(function() {
      self.monitorHistory_();
    }, 0);
  }

  utils.makeEventEmitter(FirebaseAdapter, [
    "ready",
    "cursor",
    "operation",
    "ack",
    "retry"
  ]);

  FirebaseAdapter.prototype.dispose = function() {
    var self = this;

    if (!this.ready_) {
      // TODO: this completes loading the text even though we're no longer interested in it.
      this.on("ready", function() {
        self.dispose();
      });
      return;
    }

    this.removeFirebaseCallbacks_();

    if (this.userRef_) {
      this.userRef_.child("id").remove();
      this.userRef_.child("cursor").remove();
      this.userRef_.child("color").remove();
      this.userRef_.child("name").remove();
    }

    this.ref_ = null;
    this.document_ = null;
    this.zombie_ = true;
  };

  FirebaseAdapter.prototype.setUserId = function(userId) {
    if (this.userRef_) {
      // Clean up existing data.  Avoid nuking another user's data
      // (if a future user takes our old name).
      this.userRef_.child("id").remove();
      this.userRef_.child("id").onDisconnect().cancel();

      this.userRef_.child("cursor").remove();
      this.userRef_.child("cursor").onDisconnect().cancel();

      this.userRef_.child("color").remove();
      this.userRef_.child("color").onDisconnect().cancel();

      this.userRef_.child("name").remove();
      this.userRef_.child("name").onDisconnect().cancel();
    }

    this.userId_ = userId;
    this.userRef_ = this.ref_.child("users").child(this.deviceId_);

    this.initializeUserData_();
  };

  FirebaseAdapter.prototype.onUsersChange = function(callback) {
    this.onUsersChangeCallback = callback;
  };

  FirebaseAdapter.prototype.isHistoryEmpty = function() {
    assert(this.ready_, "Not ready yet.");
    return this.revision_ === 0;
  };

  /*
   * Send operation, retrying on connection failure. Takes an optional callback with signature:
   * function(error, committed).
   * An exception will be thrown on transaction failure, which should only happen on
   * catastrophic failure like a security rule violation.
   */
  FirebaseAdapter.prototype.sendOperation = function(operation, callback) {
    var self = this;

    // If we're not ready yet, do nothing right now, and trigger a retry when we're ready.
    if (!this.ready_) {
      this.on("ready", function() {
        self.trigger("retry");
      });
      return;
    }

    // Sanity check that this operation is valid.
    assert(
      this.document_.targetLength === operation.baseLength,
      "sendOperation() called with invalid operation."
    );

    // Convert revision into an id that will sort properly lexicographically.
    var revisionId = revisionToId(this.revision_);

    function doTransaction(revisionId, revisionData) {
      self.ref_
        .child("history")
        .child(revisionId)
        .transaction(
          function(current) {
            if (current === null) {
              return revisionData;
            }
          },
          function(error, committed, snapshot) {
            if (error) {
              if (error.message === "disconnect") {
                if (self.sent_ && self.sent_.id === revisionId) {
                  // We haven't seen our transaction succeed or fail.  Send it again.
                  setTimeout(function() {
                    doTransaction(revisionId, revisionData);
                  }, 0);
                } else if (callback) {
                  callback(error, false);
                }
              } else {
                utils.log("Transaction failure!", error);
                throw error;
              }
            } else {
              if (callback) callback(null, committed);
            }
          },
          /*applyLocally=*/ false
        );
    }

    this.sent_ = { id: revisionId, op: operation };
    doTransaction(revisionId, {
      a: self.userId_,
      o: operation.toJSON(),
      t: firebase.database.ServerValue.TIMESTAMP
    });
  };

  FirebaseAdapter.prototype.setId = function(userId) {
    this.userRef_.child("id").set(userId);
    this.userId_ = userId;
  };

  FirebaseAdapter.prototype.sendCursor = function(obj) {
    this.userRef_.child("cursor").set(obj);
    this.cursor_ = obj;
  };

  FirebaseAdapter.prototype.setColor = function(color) {
    this.userRef_.child("color").set(color);
    this.color_ = color;
  };

  FirebaseAdapter.prototype.setName = function(name) {
    this.userRef_.child("name").set(name);
    this.name_ = name;
  };

  FirebaseAdapter.prototype.getDocument = function() {
    return this.document_;
  };

  FirebaseAdapter.prototype.registerCallbacks = function(callbacks) {
    for (var eventType in callbacks) {
      this.on(eventType, callbacks[eventType]);
    }
  };

  FirebaseAdapter.prototype.getLastRevision = function() {
    return revisionToId(this.revision_ - 1);
  }


  FirebaseAdapter.prototype.getRevisionsFromRevision = function(
    revId,
    callback
  ) {
    var self = this;
    var result = [];

    if (!revId) revId = "A0";

    self.ref_
      .child("history")
      .startAt(null, revId)
      .once("value", function(s) {
        if (self.zombie_) {
          return;
        } // just in case we were cleaned up before we got the data.

        // loop through children and add them to the result
        s.forEach(function(rs) {
          var rev = rs.val();

          result.push({
            id: rs.key,
            author: rev.a,
            timestamp: parseInt(rev.t, 10)
          });
        });

        callback(result);
      });
  };

  FirebaseAdapter.prototype.getDocumentAtRevision = function(
    revisionId,
    callback
  ) {
    var self = this;
    var doc = new TextOperation();
    var pendingRevisions = [];
    var checkpointRevision = 0;

    if (!revisionId) revisionId = revisionToId(0);

    function getDocumentForRevisionsRange(revisionIdFrom, revisionIdTo, cb) {
      var historyRef = self.ref_
        .child("history")
        .startAt(null, revisionIdFrom)
        .endAt(null, revisionIdTo);

      historyRef.once("value", function(s) {
        if (self.zombie_) {
          return;
        } // just in case we were cleaned up before we got the data.

        // loop through children and add them as pending revisions
        s.forEach(function(rs) {
          pendingRevisions[rs.key] = rs.val();
        });

        // Compose the checkpoint and all subsequent revisions into a single operation to apply at once.
        var rev = checkpointRevision;
        var revId = revisionToId(rev);

        while (pendingRevisions[revId] != null) {
          var revision = pendingRevisions[revId];
          var op = null;

          try {
            op = TextOperation.fromJSON(revision.o);
          } catch (e) {
            console.log(e);
            return cb(null);
          }

          if (op) doc = doc.compose(op);
          delete pendingRevisions[revId];

          rev++;
          revId = revisionToId(rev);
        }

        cb(doc);
      });
    }

    // Get the latest checkpoint as a starting point so we don't have to re-play entire history.
    self.ref_.child("checkpoint").once("value", function(s) {
      if (self.zombie_) {
        return;
      } // just in case we were cleaned up before we got the checkpoint data.

      var chRevisionId = s.child("id").val();
      var chOp = s.child("o").val();
      var chAuthor = s.child("a").val();

      if (
        chOp != null &&
        chRevisionId != null &&
        chAuthor !== null &&
        chRevisionId < revisionId
      ) {
        // process the document from the last checkpoint
        pendingRevisions[chRevisionId] = { o: chOp, a: chAuthor };
        checkpointRevision = revisionFromId(chRevisionId);
        return getDocumentForRevisionsRange(
          revisionToId(checkpointRevision + 1),
          revisionId,
          callback
        );
      } else {
        // process the document from the beggining of the history
        return getDocumentForRevisionsRange(
          revisionToId(0),
          revisionId,
          callback
        );
      }
    });
  };

  FirebaseAdapter.prototype.saveOmittedScene = function(sceneCode, scene) {
    this.ref_
      .child("omittedScenes")
      .child(sceneCode)
      .set(scene);
  };

  FirebaseAdapter.prototype.getOmittedScene = function(sceneCode, callback) {
    this.ref_
      .child("omittedScenes")
      .child(sceneCode)
      .once(
        "value",
        function(scene) {
          callback(scene.val());
        },
        function(err) {
          callback(null);
        }
      );
  };

  FirebaseAdapter.prototype.deleteOmittedScene = function(sceneCode) {
    this.ref_.child("omittedScenes").child(sceneCode).remove();
  };

  FirebaseAdapter.prototype.initializeUserData_ = function() {
    this.userRef_.child("id").onDisconnect().remove();
    this.userRef_.child("cursor").onDisconnect().remove();
    this.userRef_.child("color").onDisconnect().remove();
    this.userRef_.child("name").onDisconnect().remove();

    this.userRef_.set({
      id: this.userId_ || null,
      cursor: this.cursor_ || null,
      color: this.color_ || null,
      name: this.name_ || null
    });
  };

  FirebaseAdapter.prototype.monitorCursors_ = function() {
    var usersRef = this.ref_.child("users");
    var self = this;

    function usersChanged() {
      if (self.onUsersChangeCallback) {
        usersRef.once("value").then(function(snapshot) {
          var snap = snapshot.val();
          var users = {};

          for (var deviceId in snap) {
            if (snap.hasOwnProperty(deviceId)) {
              if (deviceId !== "backend") {
                var id = snap[deviceId].id;

                if (id && !users[id]) {
                  users[id] = {
                    name: snap[deviceId].name,
                    color: snap[deviceId].color
                  };
                }
              }
            }
          }

          self.users = users;
          self.onUsersChangeCallback(users);
        });
      }
    }

    this.firebaseOn_(usersRef, "child_added", function(childSnap) {
      var deviceId = childSnap.key;
      var userData = childSnap.val();
      self.trigger(
        "cursor",
        deviceId,
        userData.id,
        userData.cursor,
        userData.color,
        userData.name
      );
      usersChanged();
    });

    this.firebaseOn_(usersRef, "child_changed", function(childSnap) {
      var deviceId = childSnap.key;
      var userData = childSnap.val();
      self.trigger(
        "cursor",
        deviceId,
        userData.id,
        userData.cursor,
        userData.color,
        userData.name
      );
      if (userData.id && (!self.users || !self.users[userData.id] ||
        self.users[userData.id].name !== userData.name ||
        self.users[userData.id].color !== userData.color)) {
        usersChanged();
      }
    });

    this.firebaseOn_(usersRef, "child_removed", function(childSnap) {
      var deviceId = childSnap.key;
      self.trigger("cursor", deviceId);
      usersChanged();
    });
  };

  FirebaseAdapter.prototype.monitorHistory_ = function() {
    var self = this;

    // Get the latest checkpoint as a starting point so we don't have to re-play entire history.
    this.ref_.child("checkpoint").once("value", function(s) {
      if (self.zombie_) {
        return;
      } // just in case we were cleaned up before we got the checkpoint data.

      var revisionId = s.child("id").val();
      var op = s.child("o").val();
      var author = s.child("a").val();

      if (op != null && revisionId != null && author !== null) {
        self.pendingReceivedRevisions_[revisionId] = { o: op, a: author };
        self.checkpointRevision_ = revisionFromId(revisionId);
        self.monitorHistoryStartingAt_(self.checkpointRevision_ + 1);
      } else {
        self.checkpointRevision_ = 0;
        self.monitorHistoryStartingAt_(self.checkpointRevision_);
      }
    });
  };

  FirebaseAdapter.prototype.monitorHistoryStartingAt_ = function(revision) {
    var historyRef = this.ref_
      .child("history")
      .startAt(null, revisionToId(revision));

    var self = this;

    setTimeout(function() {
      self.firebaseOn_(historyRef, "child_added", function(revisionSnapshot) {
        var revisionId = revisionSnapshot.key;
        self.pendingReceivedRevisions_[revisionId] = revisionSnapshot.val();
        if (self.ready_) {
          self.handlePendingReceivedRevisions_();
        }
      });

      historyRef.once("value", function() {
        self.handleInitialRevisions_();
      });
    }, 0);
  };

  FirebaseAdapter.prototype.handleInitialRevisions_ = function() {
    assert(!this.ready_, "Should not be called multiple times.");

    // Compose the checkpoint and all subsequent revisions into a single operation to apply at once.
    this.revision_ = this.checkpointRevision_;

    var revisionId = revisionToId(this.revision_);
    var pending = this.pendingReceivedRevisions_;

    while (pending[revisionId] != null) {
      var revision = this.parseRevision_(pending[revisionId]);

      if (!revision) {
        // If a misbehaved client adds a bad operation, just ignore it.
        utils.log(
          "Invalid operation.",
          this.ref_.toString(),
          revisionId,
          pending[revisionId]
        );
      } else {
        this.document_ = this.document_.compose(revision.operation);
      }

      delete pending[revisionId];
      this.revision_++;
      revisionId = revisionToId(this.revision_);
    }

    this.trigger("operation", this.document_);

    this.ready_ = true;
    
    var self = this;
    setTimeout(function() {
      self.trigger("ready");
    }, 0);
  };

  FirebaseAdapter.prototype.handlePendingReceivedRevisions_ = function() {
    var pending = this.pendingReceivedRevisions_;
    var revisionId = revisionToId(this.revision_);
    var triggerRetry = false;

    while (pending[revisionId] != null) {
      this.revision_++;

      var revision = this.parseRevision_(pending[revisionId]);

      if (!revision) {
        // If a misbehaved client adds a bad operation, just ignore it.
        utils.log(
          "Invalid operation.",
          this.ref_.toString(),
          revisionId,
          pending[revisionId]
        );
      } else {
        this.document_ = this.document_.compose(revision.operation);

        if (this.sent_ && revisionId === this.sent_.id) {
          // We have an outstanding change at this revision id.
          if (
            this.sent_.op.equals(revision.operation) &&
            revision.author === this.userId_
          ) {
            // This is our change; it succeeded.
            if (this.revision_ % CHECKPOINT_FREQUENCY === 0) {
              this.saveCheckpoint_();
            }

            this.sent_ = null;
            this.trigger("ack");
          } else {
            // our op failed.  Trigger a retry after we're done catching up on any incoming ops.
            triggerRetry = true;
            this.trigger("operation", revision.operation);
          }
        } else {
          this.trigger("operation", revision.operation);
        }
      }

      delete pending[revisionId];

      revisionId = revisionToId(this.revision_);
    }

    if (triggerRetry) {
      this.sent_ = null;
      this.trigger("retry");
    }
  };

  FirebaseAdapter.prototype.parseRevision_ = function(data) {
    // We could do some of this validation via security rules.  But it's nice to be robust, just in case.
    if (typeof data !== "object") {
      return null;
    }
    if (typeof data.a !== "string" || typeof data.o !== "object") {
      return null;
    }
    var op = null;
    try {
      op = TextOperation.fromJSON(data.o);
    } catch (e) {
      return null;
    }

    if (op.baseLength !== this.document_.targetLength) {
      return null;
    }
    return { author: data.a, operation: op };
  };

  FirebaseAdapter.prototype.saveCheckpoint_ = function() {
    this.ref_.child("checkpoint").set({
      a: this.userId_,
      o: this.document_.toJSON(),
      id: revisionToId(this.revision_ - 1) // use the id for the revision we just wrote.
    });
  };

  FirebaseAdapter.prototype.firebaseOn_ = function(
    ref,
    eventType,
    callback,
    context
  ) {
    this.firebaseCallbacks_.push({
      ref: ref,
      eventType: eventType,
      callback: callback,
      context: context
    });
    ref.on(eventType, callback, context);
    return callback;
  };

  FirebaseAdapter.prototype.firebaseOff_ = function(
    ref,
    eventType,
    callback,
    context
  ) {
    ref.off(eventType, callback, context);
    for (var i = 0; i < this.firebaseCallbacks_.length; i++) {
      var l = this.firebaseCallbacks_[i];
      if (
        l.ref === ref &&
        l.eventType === eventType &&
        l.callback === callback &&
        l.context === context
      ) {
        this.firebaseCallbacks_.splice(i, 1);
        break;
      }
    }
  };

  FirebaseAdapter.prototype.removeFirebaseCallbacks_ = function() {
    for (var i = 0; i < this.firebaseCallbacks_.length; i++) {
      var l = this.firebaseCallbacks_[i];
      l.ref.off(l.eventType, l.callback, l.context);
    }

    this.firebaseCallbacks_ = [];
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert(b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Based off ideas from http://www.zanopha.com/docs/elen.pdf
  var characters =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  function revisionToId(revision) {
    if (revision < 0) {
      return "";
    }

    if (revision === 0) {
      return "A0";
    }

    var str = "";
    while (revision > 0) {
      var digit = revision % characters.length;
      str = characters[digit] + str;
      revision -= digit;
      revision /= characters.length;
    }

    // Prefix with length (starting at 'A' for length 1) to ensure the id's sort lexicographically.
    var prefix = characters[str.length + 9];
    return prefix + str;
  }

  function revisionFromId(revisionId) {
    assert(
      revisionId.length > 0 &&
        revisionId[0] === characters[revisionId.length + 8]
    );

    var revision = 0;

    for (var i = 1; i < revisionId.length; i++) {
      revision *= characters.length;
      revision += characters.indexOf(revisionId[i]);
    }

    return revision;
  }

  return FirebaseAdapter;
})();

var firepad = firepad || {};

firepad.RichTextToolbar = (function() {
  var utils = firepad.utils;

  function RichTextToolbar(imageInsertionUI) {
    this.imageInsertionUI = imageInsertionUI;
    this.element_ = this.makeElement_();
  }

  utils.makeEventEmitter(RichTextToolbar, [
    "bold",
    "italic",
    "underline",
    "strike",
    "font",
    "font-size",
    "color",
    "left",
    "center",
    "right",
    "unordered-list",
    "ordered-list",
    "todo-list",
    "indent-increase",
    "indent-decrease",
    "undo",
    "redo",
    "insert-image"
  ]);

  RichTextToolbar.prototype.element = function() {
    return this.element_;
  };

  RichTextToolbar.prototype.makeButton_ = function(eventName, iconName) {
    var self = this;
    iconName = iconName || eventName;
    var btn = utils.elt(
      "a",
      [utils.elt("span", "", { class: "firepad-tb-" + iconName })],
      { class: "firepad-btn" }
    );
    utils.on(
      btn,
      "click",
      utils.stopEventAnd(function() {
        self.trigger(eventName);
      })
    );
    return btn;
  };

  RichTextToolbar.prototype.makeElement_ = function() {
    var self = this;

    var font = this.makeFontDropdown_();
    var fontSize = this.makeFontSizeDropdown_();
    var color = this.makeColorDropdown_();

    var toolbarOptions = [
      utils.elt("div", [font], { class: "firepad-btn-group" }),
      utils.elt("div", [fontSize], { class: "firepad-btn-group" }),
      utils.elt("div", [color], { class: "firepad-btn-group" }),
      utils.elt(
        "div",
        [
          self.makeButton_("bold"),
          self.makeButton_("italic"),
          self.makeButton_("underline"),
          self.makeButton_("strike", "strikethrough")
        ],
        { class: "firepad-btn-group" }
      ),
      utils.elt(
        "div",
        [
          self.makeButton_("unordered-list", "list-2"),
          self.makeButton_("ordered-list", "numbered-list"),
          self.makeButton_("todo-list", "list")
        ],
        { class: "firepad-btn-group" }
      ),
      utils.elt(
        "div",
        [
          self.makeButton_("indent-decrease"),
          self.makeButton_("indent-increase")
        ],
        { class: "firepad-btn-group" }
      ),
      utils.elt(
        "div",
        [
          self.makeButton_("left", "paragraph-left"),
          self.makeButton_("center", "paragraph-center"),
          self.makeButton_("right", "paragraph-right")
        ],
        { class: "firepad-btn-group" }
      ),
      utils.elt("div", [self.makeButton_("undo"), self.makeButton_("redo")], {
        class: "firepad-btn-group"
      })
    ];

    if (self.imageInsertionUI) {
      toolbarOptions.push(
        utils.elt("div", [self.makeButton_("insert-image")], {
          class: "firepad-btn-group"
        })
      );
    }

    var toolbarWrapper = utils.elt("div", toolbarOptions, {
      class: "firepad-toolbar-wrapper"
    });
    var toolbar = utils.elt("div", null, { class: "firepad-toolbar" });
    toolbar.appendChild(toolbarWrapper);

    return toolbar;
  };

  RichTextToolbar.prototype.makeFontDropdown_ = function() {
    // NOTE: There must be matching .css styles in firepad.css.
    var fonts = [
      "Arial",
      "Comic Sans MS",
      "Courier New",
      "Impact",
      "Times New Roman",
      "Verdana"
    ];

    var items = [];
    for (var i = 0; i < fonts.length; i++) {
      var content = utils.elt("span", fonts[i]);
      content.setAttribute("style", "font-family:" + fonts[i]);
      items.push({ content: content, value: fonts[i] });
    }
    return this.makeDropdown_("Font", "font", items);
  };

  RichTextToolbar.prototype.makeFontSizeDropdown_ = function() {
    // NOTE: There must be matching .css styles in firepad.css.
    var sizes = [9, 10, 12, 14, 18, 24, 32, 42];

    var items = [];
    for (var i = 0; i < sizes.length; i++) {
      var content = utils.elt("span", sizes[i].toString());
      content.setAttribute(
        "style",
        "font-size:" + sizes[i] + "px; line-height:" + (sizes[i] - 6) + "px;"
      );
      items.push({ content: content, value: sizes[i] });
    }
    return this.makeDropdown_("Size", "font-size", items, "px");
  };

  RichTextToolbar.prototype.makeColorDropdown_ = function() {
    var colors = [
      "black",
      "red",
      "green",
      "blue",
      "yellow",
      "cyan",
      "magenta",
      "grey"
    ];

    var items = [];
    for (var i = 0; i < colors.length; i++) {
      var content = utils.elt("div");
      content.className = "firepad-color-dropdown-item";
      content.setAttribute("style", "background-color:" + colors[i]);
      items.push({ content: content, value: colors[i] });
    }
    return this.makeDropdown_("Color", "color", items);
  };

  RichTextToolbar.prototype.makeDropdown_ = function(
    title,
    eventName,
    items,
    value_suffix
  ) {
    value_suffix = value_suffix || "";
    var self = this;
    var button = utils.elt("a", title + " \u25be", {
      class: "firepad-btn firepad-dropdown"
    });
    var list = utils.elt("ul", [], { class: "firepad-dropdown-menu" });
    button.appendChild(list);

    var isShown = false;
    function showDropdown() {
      if (!isShown) {
        list.style.display = "block";
        utils.on(document, "click", hideDropdown, /*capture=*/ true);
        isShown = true;
      }
    }

    var justDismissed = false;
    function hideDropdown() {
      if (isShown) {
        list.style.display = "";
        utils.off(document, "click", hideDropdown, /*capture=*/ true);
        isShown = false;
      }
      // HACK so we can avoid re-showing the dropdown if you click on the dropdown header to dismiss it.
      justDismissed = true;
      setTimeout(function() {
        justDismissed = false;
      }, 0);
    }

    function addItem(content, value) {
      if (typeof content !== "object") {
        content = document.createTextNode(String(content));
      }
      var element = utils.elt("a", [content]);

      utils.on(
        element,
        "click",
        utils.stopEventAnd(function() {
          hideDropdown();
          self.trigger(eventName, value + value_suffix);
        })
      );

      list.appendChild(element);
    }

    for (var i = 0; i < items.length; i++) {
      var content = items[i].content,
        value = items[i].value;
      addItem(content, value);
    }

    utils.on(
      button,
      "click",
      utils.stopEventAnd(function() {
        if (!justDismissed) {
          showDropdown();
        }
      })
    );

    return button;
  };

  return RichTextToolbar;
})();

var firepad = firepad || {};

firepad.ScreenplayToolbar = (function() {
  var utils = firepad.utils;

  function ScreenplayToolbar() {
    this.element_ = this.makeElement_();
  }

  utils.makeEventEmitter(ScreenplayToolbar, [
    "screenplay-scene",
    "screenplay-action",
    "screenplay-character",
    "screenplay-dialogue",
    "screenplay-parenthetical",
    "screenplay-transition",
    "screenplay-act-start",
    "screenplay-act-end",
    "screenplay-auto-format",
    "screenplay-centered"
  ]);

  ScreenplayToolbar.prototype.element = function() {
    return this.element_;
  };

  ScreenplayToolbar.prototype.makeButton_ = function(eventName, iconName) {
    var self = this;
    iconName = iconName || eventName;
    var btn = utils.elt(
      "a",
      [utils.elt("span", "", { class: "firepad-tb-" + iconName })],
      { class: "firepad-btn" }
    );
    utils.on(
      btn,
      "click",
      utils.stopEventAnd(function() {
        self.trigger(eventName);
      })
    );
    return btn;
  };

  ScreenplayToolbar.prototype.makeElement_ = function() {
    var self = this;

    var toolbarOptions = [
      utils.elt(
        "div",
        [
          self.makeButton_("screenplay-scene", "pc-scene"),
          self.makeButton_("screenplay-action", "pc-action"),
          self.makeButton_("screenplay-character", "pc-character"),
          self.makeButton_("screenplay-dialogue", "pc-dialogue"),
          self.makeButton_("screenplay-parenthetical", "pc-parenthetical"),
          self.makeButton_("screenplay-transition", "pc-transition"),
          self.makeButton_("screenplay-act-start", "pc-act-start"),
          self.makeButton_("screenplay-act-end", "pc-act-end")
        ],
        { class: "firepad-btn-group" }
      ),

      utils.elt(
        "div",
        [self.makeButton_("screenplay-centered", "pc-centered")],
        {
          class: "firepad-btn-group"
        }
      ),

      utils.elt(
        "div",
        [self.makeButton_("screenplay-auto-format", "pc-auto-format")],
        { class: "firepad-btn-group" }
      )
    ];

    var toolbarWrapper = utils.elt("div", toolbarOptions, {
      class: "firepad-toolbar-wrapper"
    });
    var toolbar = utils.elt("div", null, { class: "firepad-toolbar" });
    toolbar.appendChild(toolbarWrapper);

    return toolbar;
  };

  return ScreenplayToolbar;
})();

var firepad = firepad || {};

firepad.WrappedOperation = (function() {
  "use strict";

  // A WrappedOperation contains an operation and corresponing metadata.
  function WrappedOperation(operation, meta) {
    this.wrapped = operation;
    this.meta = meta;
  }

  WrappedOperation.prototype.apply = function() {
    return this.wrapped.apply.apply(this.wrapped, arguments);
  };

  WrappedOperation.prototype.invert = function() {
    var meta = this.meta;
    return new WrappedOperation(
      this.wrapped.invert.apply(this.wrapped, arguments),
      meta && typeof meta === "object" && typeof meta.invert === "function"
        ? meta.invert.apply(meta, arguments)
        : meta
    );
  };

  // Copy all properties from source to target.
  function copy(source, target) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
  }

  function composeMeta(a, b) {
    if (a && typeof a === "object") {
      if (typeof a.compose === "function") {
        return a.compose(b);
      }
      var meta = {};
      copy(a, meta);
      copy(b, meta);
      return meta;
    }
    return b;
  }

  WrappedOperation.prototype.compose = function(other) {
    return new WrappedOperation(
      this.wrapped.compose(other.wrapped),
      composeMeta(this.meta, other.meta)
    );
  };

  function transformMeta(meta, operation) {
    if (meta && typeof meta === "object") {
      if (typeof meta.transform === "function") {
        return meta.transform(operation);
      }
    }
    return meta;
  }

  WrappedOperation.transform = function(a, b) {
    var pair = a.wrapped.transform(b.wrapped);
    return [
      new WrappedOperation(pair[0], transformMeta(a.meta, b.wrapped)),
      new WrappedOperation(pair[1], transformMeta(b.meta, a.wrapped))
    ];
  };

  // convenience method to write transform(a, b) as a.transform(b)
  WrappedOperation.prototype.transform = function(other) {
    return WrappedOperation.transform(this, other);
  };

  return WrappedOperation;
})();

var firepad = firepad || {};

firepad.UndoManager = (function() {
  "use strict";

  var NORMAL_STATE = "normal";
  var UNDOING_STATE = "undoing";
  var REDOING_STATE = "redoing";

  // Create a new UndoManager with an optional maximum history size.
  function UndoManager(maxItems) {
    this.maxItems = maxItems || 50;
    this.state = NORMAL_STATE;
    this.dontCompose = false;
    this.undoStack = [];
    this.redoStack = [];
  }

  // Add an operation to the undo or redo stack, depending on the current state
  // of the UndoManager. The operation added must be the inverse of the last
  // edit. When `compose` is true, compose the operation with the last operation
  // unless the last operation was alread pushed on the redo stack or was hidden
  // by a newer operation on the undo stack.
  UndoManager.prototype.add = function(operation, compose) {
    if (this.state === UNDOING_STATE) {
      this.redoStack.push(operation);
      this.dontCompose = true;
    } else if (this.state === REDOING_STATE) {
      this.undoStack.push(operation);
      this.dontCompose = true;
    } else {
      var undoStack = this.undoStack;
      if (!this.dontCompose && compose && undoStack.length > 0) {
        undoStack.push(operation.compose(undoStack.pop()));
      } else {
        undoStack.push(operation);
        if (undoStack.length > this.maxItems) {
          undoStack.shift();
        }
      }
      this.dontCompose = false;
      this.redoStack = [];
    }
  };

  function transformStack(stack, operation) {
    var newStack = [];
    var Operation = operation.constructor;
    for (var i = stack.length - 1; i >= 0; i--) {
      var pair = Operation.transform(stack[i], operation);
      if (typeof pair[0].isNoop !== "function" || !pair[0].isNoop()) {
        newStack.push(pair[0]);
      }
      operation = pair[1];
    }
    return newStack.reverse();
  }

  // Transform the undo and redo stacks against a operation by another client.
  UndoManager.prototype.transform = function(operation) {
    this.undoStack = transformStack(this.undoStack, operation);
    this.redoStack = transformStack(this.redoStack, operation);
  };

  // Perform an undo by calling a function with the latest operation on the undo
  // stack. The function is expected to call the `add` method with the inverse
  // of the operation, which pushes the inverse on the redo stack.
  UndoManager.prototype.performUndo = function(fn) {
    this.state = UNDOING_STATE;
    if (this.undoStack.length === 0) {
      throw new Error("undo not possible");
    }
    fn(this.undoStack.pop());
    this.state = NORMAL_STATE;
  };

  // The inverse of `performUndo`.
  UndoManager.prototype.performRedo = function(fn) {
    this.state = REDOING_STATE;
    if (this.redoStack.length === 0) {
      throw new Error("redo not possible");
    }
    fn(this.redoStack.pop());
    this.state = NORMAL_STATE;
  };

  // Is the undo stack not empty?
  UndoManager.prototype.canUndo = function() {
    return this.undoStack.length !== 0;
  };

  // Is the redo stack not empty?
  UndoManager.prototype.canRedo = function() {
    return this.redoStack.length !== 0;
  };

  // Whether the UndoManager is currently performing an undo.
  UndoManager.prototype.isUndoing = function() {
    return this.state === UNDOING_STATE;
  };

  // Whether the UndoManager is currently performing a redo.
  UndoManager.prototype.isRedoing = function() {
    return this.state === REDOING_STATE;
  };

  return UndoManager;
})();

var firepad = firepad || {};
firepad.Client = (function() {
  "use strict";

  // Client constructor
  function Client() {
    this.state = synchronized_; // start state
  }

  Client.prototype.setState = function(state) {
    this.state = state;
  };

  // Call this method when the user changes the document.
  Client.prototype.applyClient = function(operation) {
    this.setState(this.state.applyClient(this, operation));
  };

  // Call this method with a new operation from the server
  Client.prototype.applyServer = function(operation) {
    this.setState(this.state.applyServer(this, operation));
  };

  Client.prototype.serverAck = function() {
    this.setState(this.state.serverAck(this));
  };

  Client.prototype.serverRetry = function() {
    this.setState(this.state.serverRetry(this));
  };

  // Override this method.
  Client.prototype.sendOperation = function(operation) {
    throw new Error("sendOperation must be defined in child class");
  };

  // Override this method.
  Client.prototype.applyOperation = function(operation) {
    throw new Error("applyOperation must be defined in child class");
  };

  // In the 'Synchronized' state, there is no pending operation that the client
  // has sent to the server.
  function Synchronized() {}
  Client.Synchronized = Synchronized;

  Synchronized.prototype.applyClient = function(client, operation) {
    // When the user makes an edit, send the operation to the server and
    // switch to the 'AwaitingConfirm' state
    client.sendOperation(operation);
    return new AwaitingConfirm(operation);
  };

  Synchronized.prototype.applyServer = function(client, operation) {
    // When we receive a new operation from the server, the operation can be
    // simply applied to the current document
    client.applyOperation(operation);
    return this;
  };

  Synchronized.prototype.serverAck = function(client) {
    throw new Error("There is no pending operation.");
  };

  Synchronized.prototype.serverRetry = function(client) {
    throw new Error("There is no pending operation.");
  };

  // Singleton
  var synchronized_ = new Synchronized();

  // In the 'AwaitingConfirm' state, there's one operation the client has sent
  // to the server and is still waiting for an acknowledgement.
  function AwaitingConfirm(outstanding) {
    // Save the pending operation
    this.outstanding = outstanding;
  }
  Client.AwaitingConfirm = AwaitingConfirm;

  AwaitingConfirm.prototype.applyClient = function(client, operation) {
    // When the user makes an edit, don't send the operation immediately,
    // instead switch to 'AwaitingWithBuffer' state
    return new AwaitingWithBuffer(this.outstanding, operation);
  };

  AwaitingConfirm.prototype.applyServer = function(client, operation) {
    // This is another client's operation. Visualization:
    //
    //                   /\
    // this.outstanding /  \ operation
    //                 /    \
    //                 \    /
    //  pair[1]         \  / pair[0] (new outstanding)
    //  (can be applied  \/
    //  to the client's
    //  current document)
    var pair = this.outstanding.transform(operation);
    client.applyOperation(pair[1]);
    return new AwaitingConfirm(pair[0]);
  };

  AwaitingConfirm.prototype.serverAck = function(client) {
    // The client's operation has been acknowledged
    // => switch to synchronized state
    return synchronized_;
  };

  AwaitingConfirm.prototype.serverRetry = function(client) {
    client.sendOperation(this.outstanding);
    return this;
  };

  // In the 'AwaitingWithBuffer' state, the client is waiting for an operation
  // to be acknowledged by the server while buffering the edits the user makes
  function AwaitingWithBuffer(outstanding, buffer) {
    // Save the pending operation and the user's edits since then
    this.outstanding = outstanding;
    this.buffer = buffer;
  }
  Client.AwaitingWithBuffer = AwaitingWithBuffer;

  AwaitingWithBuffer.prototype.applyClient = function(client, operation) {
    // Compose the user's changes onto the buffer
    var newBuffer = this.buffer.compose(operation);
    return new AwaitingWithBuffer(this.outstanding, newBuffer);
  };

  AwaitingWithBuffer.prototype.applyServer = function(client, operation) {
    // Operation comes from another client
    //
    //                       /\
    //     this.outstanding /  \ operation
    //                     /    \
    //                    /\    /
    //       this.buffer /  \* / pair1[0] (new outstanding)
    //                  /    \/
    //                  \    /
    //          pair2[1] \  / pair2[0] (new buffer)
    // the transformed    \/
    // operation -- can
    // be applied to the
    // client's current
    // document
    //
    // * pair1[1]
    var pair1 = this.outstanding.transform(operation);
    var pair2 = this.buffer.transform(pair1[1]);
    client.applyOperation(pair2[1]);
    return new AwaitingWithBuffer(pair1[0], pair2[0]);
  };

  AwaitingWithBuffer.prototype.serverRetry = function(client) {
    // Merge with our buffer and resend.
    var outstanding = this.outstanding.compose(this.buffer);
    client.sendOperation(outstanding);
    return new AwaitingConfirm(outstanding);
  };

  AwaitingWithBuffer.prototype.serverAck = function(client) {
    // The pending operation has been acknowledged
    // => send buffer
    client.sendOperation(this.buffer);
    return new AwaitingConfirm(this.buffer);
  };

  return Client;
})();

var firepad = firepad || {};

firepad.EditorClient = (function() {
  "use strict";

  var Client = firepad.Client;
  var Cursor = firepad.Cursor;
  var UndoManager = firepad.UndoManager;
  var WrappedOperation = firepad.WrappedOperation;

  function SelfMeta(cursorBefore, cursorAfter) {
    this.cursorBefore = cursorBefore;
    this.cursorAfter = cursorAfter;
  }

  SelfMeta.prototype.invert = function() {
    return new SelfMeta(this.cursorAfter, this.cursorBefore);
  };

  SelfMeta.prototype.compose = function(other) {
    return new SelfMeta(this.cursorBefore, other.cursorAfter);
  };

  SelfMeta.prototype.transform = function(operation) {
    return new SelfMeta(
      this.cursorBefore ? this.cursorBefore.transform(operation) : null,
      this.cursorAfter ? this.cursorAfter.transform(operation) : null
    );
  };

  function OtherClient(id, editorAdapter) {
    this.id = id;
    this.editorAdapter = editorAdapter;
  }

  OtherClient.prototype.setUserId = function(userId) {
    this.userId = userId;
  };

  OtherClient.prototype.setColor = function(color) {
    this.color = color;
  };

  OtherClient.prototype.setName = function(name) {
    this.name = name;
  };

  OtherClient.prototype.updateCursor = function(cursor) {
    this.removeCursor();
    this.cursor = cursor;

    this.marks = this.editorAdapter.setOtherCursor(
      this.id,
      this.cursor,
      this.color,
      this.userId,
      this.name
    );
  };

  OtherClient.prototype.removeCursor = function() {
    if (this.marks) {
      for (var i = 0; i < this.marks.length; i++) {
        this.marks[i].clear();
      }
    }
  };

  function EditorClient(serverAdapter, editorAdapter) {
    Client.call(this);
    this.serverAdapter = serverAdapter;
    this.editorAdapter = editorAdapter;
    this.undoManager = new UndoManager();

    this.clients = {};

    var self = this;

    this.editorAdapter.registerCallbacks({
      change: function(operation, inverse) {
        self.onChange(operation, inverse);
      },
      cursorActivity: function() {
        self.onCursorActivity();
      },
      blur: function() {
        self.onBlur();
      },
      focus: function() {
        self.onFocus();
      }
    });
    this.editorAdapter.registerUndo(function() {
      self.undo();
    });
    this.editorAdapter.registerRedo(function() {
      self.redo();
    });

    this.serverAdapter.registerCallbacks({
      ack: function() {
        self.serverAck();
        if (self.focused && self.state instanceof Client.Synchronized) {
          self.updateCursor();
          self.sendCursor(self.cursor);
        }
        self.emitStatus();
      },
      retry: function() {
        self.serverRetry();
      },
      operation: function(operation) {
        self.applyServer(operation);
      },
      cursor: function(deviceId, id, cursor, color, name) {
        if (
          self.serverAdapter.deviceId_ === deviceId ||
          !(self.state instanceof Client.Synchronized)
        ) {
          return;
        }

        var client = self.getClientObject(deviceId);
        if (id) {
          client.setUserId(id);
        }
        if (color) {
          client.setColor(color);
        }
        if (name) {
          client.setName(name);
        }
        if (cursor) {
          client.updateCursor(Cursor.fromJSON(cursor));
        } else {
          client.removeCursor();
        }
      }
    });
  }

  inherit(EditorClient, Client);

  EditorClient.prototype.getClientObject = function(clientId) {
    var client = this.clients[clientId];
    if (client) {
      return client;
    }
    return (this.clients[clientId] = new OtherClient(
      clientId,
      this.editorAdapter
    ));
  };

  EditorClient.prototype.applyUnredo = function(operation) {
    this.undoManager.add(this.editorAdapter.invertOperation(operation));
    this.editorAdapter.applyOperation(operation.wrapped);
    this.cursor = operation.meta.cursorAfter;
    if (this.cursor) this.editorAdapter.setCursor(this.cursor);
    this.applyClient(operation.wrapped);
  };

  EditorClient.prototype.undo = function() {
    var self = this;
    if (!this.undoManager.canUndo()) {
      return;
    }
    this.undoManager.performUndo(function(o) {
      self.applyUnredo(o);
    });
  };

  EditorClient.prototype.redo = function() {
    var self = this;
    if (!this.undoManager.canRedo()) {
      return;
    }
    this.undoManager.performRedo(function(o) {
      self.applyUnredo(o);
    });
  };

  EditorClient.prototype.onChange = function(textOperation, inverse) {
    var cursorBefore = this.cursor;
    this.updateCursor();

    var compose =
      this.undoManager.undoStack.length > 0 &&
      inverse.shouldBeComposedWithInverted(
        last(this.undoManager.undoStack).wrapped
      );
    var inverseMeta = new SelfMeta(this.cursor, cursorBefore);
    this.undoManager.add(new WrappedOperation(inverse, inverseMeta), compose);
    this.applyClient(textOperation);
  };

  EditorClient.prototype.updateCursor = function() {
    this.cursor = this.editorAdapter.getCursor();
  };

  EditorClient.prototype.onCursorActivity = function() {
    var oldCursor = this.cursor;
    this.updateCursor();
    if (!this.focused || (oldCursor && this.cursor.equals(oldCursor))) {
      return;
    }
    this.sendCursor(this.cursor);
  };

  EditorClient.prototype.onBlur = function() {
    this.cursor = null;
    this.sendCursor(null);
    this.focused = false;
  };

  EditorClient.prototype.onFocus = function() {
    this.focused = true;
    this.onCursorActivity();
  };

  EditorClient.prototype.sendCursor = function(cursor) {
    if (this.state instanceof Client.AwaitingWithBuffer) {
      return;
    }
    this.serverAdapter.sendCursor(cursor);
  };

  EditorClient.prototype.sendOperation = function(operation) {
    this.serverAdapter.sendOperation(operation);
    this.emitStatus();
  };

  EditorClient.prototype.applyOperation = function(operation) {
    this.editorAdapter.applyOperation(operation);
    this.updateCursor();
    this.undoManager.transform(new WrappedOperation(operation, null));
  };

  EditorClient.prototype.emitStatus = function() {
    var self = this;
    setTimeout(function() {
      self.trigger("synced", self.state instanceof Client.Synchronized);
    }, 0);
  };

  // Set Const.prototype.__proto__ to Super.prototype
  function inherit(Const, Super) {
    function F() {}
    F.prototype = Super.prototype;
    Const.prototype = new F();
    Const.prototype.constructor = Const;
  }

  function last(arr) {
    return arr[arr.length - 1];
  }

  return EditorClient;
})();

firepad.utils.makeEventEmitter(firepad.EditorClient, ["synced"]);

var firepad = firepad || {};

firepad.AttributeConstants = {
  //
  // Text Attributes
  //

  // richtext:
  BOLD: "b",
  ITALIC: "i",
  UNDERLINE: "u",
  STRIKE: "s",
  FONT: "f",
  FONT_SIZE: "fs",
  COLOR: "c",
  BACKGROUND_COLOR: "bc",
  ENTITY_SENTINEL: "ent",

  // screenplay:
  ELEMENT: "e",
  ELEMENT_COLOR: "ec",
  THREAD: "t",
  DIFF: "d",

  //
  // Line Attributes
  //

  // richtext:
  LINE_SENTINEL: "l",
  LINE_INDENT: "li",
  LINE_ALIGN: "la",
  LIST_TYPE: "lt",

  // screenplay:
  LINE_CLASS: "lc",
  LINE_CLASS_TYPE: "lct",
  SCENE_CODE: "sc",
  SCENE_ID: "si",
  SCENE_OMITTED: "so"
};

firepad.sentinelConstants = {
  // A special character we insert at the beginning of lines so we can attach attributes to it to represent
  // "line attributes."  E000 is from the unicode "private use" range.
  LINE_SENTINEL_CHARACTER: "\uE000",

  // A special character used to represent any "entity" inserted into the document (e.g. an image).
  ENTITY_SENTINEL_CHARACTER: "\uE001",

  // A special character used to trigger an autoformat action when a screenplay is accessed for the first time
  TRIGGER_AUTOFORMAT_SENTINEL_CHARACTER: "\uE002"
};

var firepad = firepad || {};

firepad.EntityManager = (function() {
  var utils = firepad.utils;

  function EntityManager() {
    this.entities_ = {};

    var attrs = ["src", "alt", "width", "height", "style", "class"];
    this.register("img", {
      render: function(info) {
        utils.assert(info.src, "image entity should have 'src'!");
        var attrs = ["src", "alt", "width", "height", "style", "class"];
        var html = "<img ";
        for (var i = 0; i < attrs.length; i++) {
          var attr = attrs[i];
          if (attr in info) {
            html += " " + attr + '="' + info[attr] + '"';
          }
        }
        html += ">";
        return html;
      },
      fromElement: function(element) {
        var info = {};
        for (var i = 0; i < attrs.length; i++) {
          var attr = attrs[i];
          if (element.hasAttribute(attr)) {
            info[attr] = element.getAttribute(attr);
          }
        }
        return info;
      }
    });
  }

  EntityManager.prototype.register = function(type, options) {
    firepad.utils.assert(
      options.render,
      "Entity options should include a 'render' function!"
    );
    firepad.utils.assert(
      options.fromElement,
      "Entity options should include a 'fromElement' function!"
    );
    this.entities_[type] = options;
  };

  EntityManager.prototype.renderToElement = function(entity, entityHandle) {
    return this.tryRenderToElement_(entity, "render", entityHandle);
  };

  EntityManager.prototype.exportToElement = function(entity) {
    // Turns out 'export' is a reserved keyword, so 'getHtml' is preferable.
    var elt =
      this.tryRenderToElement_(entity, "export") ||
      this.tryRenderToElement_(entity, "getHtml") ||
      this.tryRenderToElement_(entity, "render");
    elt.setAttribute("data-firepad-entity", entity.type);
    return elt;
  };

  /* Updates a DOM element to reflect the given entity.
     If the entity doesn't support the update method, it is fully
     re-rendered.
  */
  EntityManager.prototype.updateElement = function(entity, element) {
    var type = entity.type;
    var info = entity.info;
    if (
      this.entities_[type] &&
      typeof this.entities_[type].update != "undefined"
    ) {
      this.entities_[type].update(info, element);
    }
  };

  EntityManager.prototype.fromElement = function(element) {
    var type = element.getAttribute("data-firepad-entity");

    // HACK.  This should be configurable through entity registration.
    if (!type) type = element.nodeName.toLowerCase();

    if (type && this.entities_[type]) {
      var info = this.entities_[type].fromElement(element);
      return new firepad.Entity(type, info);
    }
  };

  EntityManager.prototype.tryRenderToElement_ = function(
    entity,
    renderFn,
    entityHandle
  ) {
    var type = entity.type,
      info = entity.info;
    if (this.entities_[type] && this.entities_[type][renderFn]) {
      var windowDocument = firepad.document || (window && window.document);
      var res = this.entities_[type][renderFn](
        info,
        entityHandle,
        windowDocument
      );
      if (res) {
        if (typeof res === "string") {
          var div = (firepad.document || document).createElement("div");
          div.innerHTML = res;
          return div.childNodes[0];
        } else if (typeof res === "object") {
          firepad.utils.assert(
            typeof res.nodeType !== "undefined",
            "Error rendering " +
              type +
              " entity.  render() function" +
              " must return an html string or a DOM element."
          );
          return res;
        }
      }
    }
  };

  EntityManager.prototype.entitySupportsUpdate = function(entityType) {
    return this.entities_[entityType] && this.entities_[entityType]["update"];
  };

  return EntityManager;
})();

var firepad = firepad || {};

/**
 * Object to represent an Entity.
 */
firepad.Entity = (function() {
  var ATTR = firepad.AttributeConstants;
  var SENTINEL = ATTR.ENTITY_SENTINEL;
  var PREFIX = SENTINEL + "_";

  function Entity(type, info) {
    // Allow calling without new.
    if (!(this instanceof Entity)) {
      return new Entity(type, info);
    }

    this.type = type;
    this.info = info || {};
  }

  Entity.prototype.toAttributes = function() {
    var attrs = {};
    attrs[SENTINEL] = this.type;

    for (var attr in this.info) {
      attrs[PREFIX + attr] = this.info[attr];
    }

    return attrs;
  };

  Entity.fromAttributes = function(attributes) {
    var type = attributes[SENTINEL];
    var info = {};
    for (var attr in attributes) {
      if (attr.indexOf(PREFIX) === 0) {
        info[attr.substr(PREFIX.length)] = attributes[attr];
      }
    }

    return new Entity(type, info);
  };

  return Entity;
})();

var firepad = firepad || {};

if (
  typeof CodeMirror === "undefined" &&
  typeof require === "function"
) {
  try {
    CodeMirror = require("codemirror");
  } catch(ex) {
    console.log("CodeMirror not found");
  }
}

if (typeof CodeMirror !== "undefined") {
  // extend CodeMirror.TextMarker in order to enable getting the assigned class for the markers
  CodeMirror.TextMarker.prototype.getClassName = function() {
    return this.className || "";
  };
}

firepad.RichTextCodeMirror = (function() {
  var AnnotationList = firepad.AnnotationList;
  var Span = firepad.Span;
  var utils = firepad.utils;
  var ATTR = firepad.AttributeConstants;
  var RichTextClassPrefixDefault = "cmrt-";
  var RichTextOriginPrefix = "cmrt-";
  var DynamicStyleAttributes = {}; // These attributes will have styles generated dynamically in the page.
  var StyleCache_ = {}; // A cache of dynamically-created styles so we can re-use them.
  var LineSentinelCharacter = firepad.sentinelConstants.LINE_SENTINEL_CHARACTER;
  var EntitySentinelCharacter = firepad.sentinelConstants.ENTITY_SENTINEL_CHARACTER;
  var TriggerAutoformatSentinelCharacter = firepad.sentinelConstants.TRIGGER_AUTOFORMAT_SENTINEL_CHARACTER;

  function RichTextCodeMirror(
    codeMirror,
    entityManager,
    firebaseAdapter,
    options
  ) {
    this.ready_ = false;
    this.codeMirror = codeMirror;
    this.options_ = options || {};
    this.entityManager_ = entityManager;
    this.firebaseAdapter_ = firebaseAdapter;
    this.currentAttributes_ = null;
    this.styleElements = [];
    this.shootingEvent = this.options_["shootingEvent"] || null;
    this.scenesFilterElements = [];
    this.showComments = this.options_["showComments"] || false;
    this.showDiffAdditions = this.options_["showDiffAdditions"] || false;

    this.setupDynamicStyles();
    this.setupAnnotations();

    bind(this, "onCodeMirrorBeforeChange_");
    bind(this, "onCodeMirrorChange_");
    bind(this, "onCursorActivity_");
    bind(this, "onCopyOrCut_");
    bind(this, "onPaste_");
    bind(this, "onScroll_");

    if (parseInt(CodeMirror.version) >= 4) {
      this.codeMirror.on("changes", this.onCodeMirrorChange_);
    } else {
      this.codeMirror.on("change", this.onCodeMirrorChange_);
    }
    this.codeMirror.on("beforeChange", this.onCodeMirrorBeforeChange_);
    this.codeMirror.on("cursorActivity", this.onCursorActivity_);
    this.codeMirror.on("copy", this.onCopyOrCut_);
    this.codeMirror.on("cut", this.onCopyOrCut_);
    this.codeMirror.on("paste", this.onPaste_);
    this.codeMirror.on("scroll", this.onScroll_);

    this.changeId_ = 0;
    this.outstandingChanges_ = {};
    this.dirtyLines_ = [];

    var self = this;
    setTimeout(function() {
      self.reportScenesStatus();
    }, 1000);
  }

  utils.makeEventEmitter(RichTextCodeMirror, [
    "change",
    "attributesChange",
    "newLine"
  ]);

  RichTextCodeMirror.prototype.setReady = function() {
    var self = this;
    var cm = self.codeMirror;
    var lineText = cm.getLine(0);

    if (lineText && lineText.length > 0 && lineText[0] === TriggerAutoformatSentinelCharacter) {
      cm.replaceRange(
        "",
        { line: 0, ch: 0 },
        { line: 0, ch: 1 },
        "+input"
      );

      setTimeout(function() {
        self.screenplayAutoFormat(true);
      }, 100);
    }

    self.ready_ = true;

    setTimeout(function() {
      self.reportVisibleThreads();
    }, 0);
  };

  RichTextCodeMirror.prototype.detach = function() {
    if (this.onScenesChangeCallback) {
      this.onScenesChangeCallback = null;
    }

    this.codeMirror.off("beforeChange", this.onCodeMirrorBeforeChange_);
    this.codeMirror.off("change", this.onCodeMirrorChange_);
    this.codeMirror.off("changes", this.onCodeMirrorChange_);
    this.codeMirror.off("cursorActivity", this.onCursorActivity_);
    this.codeMirror.off("copy", this.onCopyOrCut_);
    this.codeMirror.off("cut", this.onCopyOrCut_);
    this.codeMirror.off("paste", this.onPaste_);
    this.codeMirror.off("scroll", this.onScroll_);

    this.clearAnnotations();
    this.clearDynamicStyles();
    this.clearScenesFilterElements();
  };

  RichTextCodeMirror.prototype.clearAnnotations = function() {
    this.annotationList_.updateSpan(new Span(0, this.end()), function(
      annotation,
      length
    ) {
      return new RichTextAnnotation({});
    });
  };

  RichTextCodeMirror.prototype.setupAnnotations = function() {
    var self = this;
    this.annotationList_ = new AnnotationList(function(oldNodes, newNodes) {
      self.onAnnotationsChanged_(oldNodes, newNodes);
    });

    // Ensure annotationList is in sync with any existing codemirror contents.
    this.initAnnotationList_();
  };

  RichTextCodeMirror.prototype.clearDynamicStyles = function() {
    for (var i = 0; i < this.styleElements.length; i++) {
      const element = this.styleElements[i];
      element.parentNode.removeChild(element);
    }

    this.styleElements = [];

    DynamicStyleAttributes = {};
    StyleCache_ = {};
  };

  RichTextCodeMirror.prototype.setupDynamicStyles = function() {
    DynamicStyleAttributes[ATTR.COLOR] = "color";
    DynamicStyleAttributes[ATTR.BACKGROUND_COLOR] = "background-color";
    DynamicStyleAttributes[ATTR.FONT_SIZE] = "font-size";

    DynamicStyleAttributes[ATTR.LINE_INDENT] = function(indent) {
      return "padding-left: " + indent * 40 + "px";
    };

    DynamicStyleAttributes[ATTR.SCENE_CODE] = function(code) {
      return (
        'margin-left: 0; position: absolute; left: -60px; content: "' +
        code +
        '";'
      );
    };

    var shootingEvent = this.shootingEvent;
    var scenes = {};

    if (shootingEvent) {
      try {
        for (var i = 0; i < shootingEvent.scenes.length; i++) {
          scenes[shootingEvent.scenes[i].sceneId] =
            shootingEvent.scenes[i].sceneType;
        }
      } catch (ex) {
        console.log(
          "Firepad: invalid scenes array for the given shooting event"
        );
      }

      var elemColorAttrName = ATTR.ELEMENT_COLOR + "-" + this.shootingEvent.id;

      DynamicStyleAttributes[elemColorAttrName] = function(color) {
        return (
          "color: " + color + "; text-decoration: underline; font-weight: bold;"
        );
      };

      if (this.showDiffAdditions) {
        DynamicStyleAttributes[ATTR.DIFF] = function(val) {
          if (val === "added") {
            return 'background-color: #CAFA94;';
          }
        };
      }
    } else {
      if (this.showComments) {
        DynamicStyleAttributes[ATTR.THREAD] = function() {
          return 'background-color: #e3e3e3; position: relative;';
        };
      }
    }

    DynamicStyleAttributes[ATTR.SCENE_ID] = function(id) {
      if (shootingEvent) {
        // show a different icon for primary and secondary scenes
        if (scenes[id] && scenes[id] === "PRIMARY") {
          return "font-family: 'firepad'; speak: none; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; -webkit-font-smoothing: antialiased; content: \"\\e00c\"; margin-left: 0; position: absolute; right: -20px;";
        } else {
          return "font-family: 'verdana'; speak: none; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; -webkit-font-smoothing: antialiased; content: \"||\"; margin-left: 0; position: absolute; right: -20px;";
        }
      } else {
        return "font-family: 'firepad'; speak: none; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; -webkit-font-smoothing: antialiased; content: \"\\e98f\"; margin-left: 0; position: absolute; right: -20px;";
      }
    };
  };

  RichTextCodeMirror.prototype.setShootingEvent = function(shootingEvent) {
    this.shootingEvent = shootingEvent;
    this.options_["shootingEvent"] = shootingEvent;

    this.clearDynamicStyles();
    this.setupDynamicStyles();

    this.clearScenesFilterElements();
    this.filterScenes();

    // re-generate the dynamic styles
    var spans = this.getAttributeSpans(0, this.end());

    for (var i = 0; i < spans.length; i++) {
      var attrs = spans[i].attributes;
      this.getClassNameForAttributes_(attrs);
    }
  };

  RichTextCodeMirror.prototype.toggleAttribute = function(attribute, value) {
    var trueValue = value || true;
    if (this.emptySelection_()) {
      var attrs = this.getCurrentAttributes_();
      if (attrs[attribute] === trueValue) {
        delete attrs[attribute];
      } else {
        attrs[attribute] = trueValue;
      }
      this.currentAttributes_ = attrs;
    } else {
      var attributes = this.getCurrentAttributes_();
      var newValue = attributes[attribute] !== trueValue ? trueValue : false;
      this.setAttribute(attribute, newValue);
    }
  };

  RichTextCodeMirror.prototype.setAttribute = function(attribute, value) {
    var cm = this.codeMirror;
    if (this.emptySelection_()) {
      var attrs = this.getCurrentAttributes_();
      if (value === false) {
        delete attrs[attribute];
      } else {
        attrs[attribute] = value;
      }
      this.currentAttributes_ = attrs;
    } else {
      this.updateTextAttributes(
        cm.indexFromPos(cm.getCursor("start")),
        cm.indexFromPos(cm.getCursor("end")),
        function(attributes) {
          if (value === false) {
            delete attributes[attribute];
          } else {
            attributes[attribute] = value;
          }
        }
      );

      this.updateCurrentAttributes_();
    }
  };

  RichTextCodeMirror.prototype.updateTextAttributes = function(
    start,
    end,
    updateFn,
    origin,
    doLineAttributes
  ) {
    var newChanges = [];
    var pos = start;
    var self = this;

    this.annotationList_.updateSpan(new Span(start, end - start), function(
      annotation,
      length
    ) {
      var attributes = {};
      for (var attr in annotation.attributes) {
        attributes[attr] = annotation.attributes[attr];
      }

      // Don't modify if this is a line sentinel.
      if (!attributes[ATTR.LINE_SENTINEL] || doLineAttributes) {
        updateFn(attributes);
      }

      // changedAttributes will be the attributes we changed, with their new values.
      // changedAttributesInverse will be the attributes we changed, with their old values.
      var changedAttributes = {};
      var changedAttributesInverse = {};

      self.computeChangedAttributes_(
        annotation.attributes,
        attributes,
        changedAttributes,
        changedAttributesInverse
      );

      if (!emptyAttributes(changedAttributes)) {
        newChanges.push({
          start: pos,
          end: pos + length,
          attributes: changedAttributes,
          attributesInverse: changedAttributesInverse,
          origin: origin
        });
      }

      pos += length;
      return new RichTextAnnotation(attributes);
    });

    if (newChanges.length > 0) {
      this.trigger("attributesChange", this, newChanges);
    }
  };

  RichTextCodeMirror.prototype.computeChangedAttributes_ = function(
    oldAttrs,
    newAttrs,
    changed,
    inverseChanged
  ) {
    var attrs = {},
      attr;
    for (attr in oldAttrs) {
      attrs[attr] = true;
    }
    for (attr in newAttrs) {
      attrs[attr] = true;
    }

    for (attr in attrs) {
      if (!(attr in newAttrs)) {
        // it was removed.
        changed[attr] = false;
        inverseChanged[attr] = oldAttrs[attr];
      } else if (!(attr in oldAttrs)) {
        // it was added.
        changed[attr] = newAttrs[attr];
        inverseChanged[attr] = false;
      } else if (oldAttrs[attr] !== newAttrs[attr]) {
        // it was changed.
        changed[attr] = newAttrs[attr];
        inverseChanged[attr] = oldAttrs[attr];
      }
    }
  };

  RichTextCodeMirror.prototype.scrollToLine = function(lineNum, isScene) {
    var self = this;
    self.codeMirror.setCursor({
      line: lineNum + (isScene ? 1 : 0),
      ch: 1
    });

    setTimeout(function() {
      var offset = self.codeMirror.charCoords({ line: lineNum, ch: 0 }, "local")
        .top;
      self.codeMirror.scrollTo(null, offset);
    }, 100);
  };

  RichTextCodeMirror.prototype.scrollToScene = function(sceneCode) {
    var scenes = this.getScenes();

    var scene = scenes.find(function(s) {
      return s.sceneCode === sceneCode;
    });

    if (scene) {
      this.codeMirror.focus();
      this.scrollToLine(scene.lineNum, true);
    }
  };

  RichTextCodeMirror.prototype.screenplayAutoFormat = function(
    allLines,
    origin,
    fromLine,
    toLine
  ) {
    var self = this;
    var cursorLine = self.codeMirror.getCursor("head").line;

    setTimeout(function() {
      var lines = [];
      var linesWithoutFormat = [];
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var pLine = cursorLine - 1;

      if (!allLines) {
        // look for nearer action lines around the current line
        var end = false;
        var endTop = false;
        var endBottom = false;
        var indTop = firstLine;
        var indBottom = lastLine;

        if (typeof fromLine === "number") {
          indTop = fromLine;
        } else if (pLine > firstLine) {
          indTop = pLine - 1;
        }

        if (typeof toLine === "number") {
          indBottom = toLine;
        } else if (pLine < lastLine) {
          indBottom = pLine + 1;
        }

        while (!end) {
          if (!endTop) {
            if (indTop > firstLine) {
              var lineAttrs = self.getLineAttributes_(indTop);

              if (!lineAttrs[ATTR.LINE_CLASS] || lineAttrs[ATTR.LINE_CLASS] === "pc-action") {
                endTop = true;
              } else {
                indTop--;
              }
            } else {
              endTop = true;
            }
          }

          if (!endBottom) {
            if (indBottom < lastLine) {
              var lineAttrs = self.getLineAttributes_(indBottom);

              if (!lineAttrs[ATTR.LINE_CLASS] || lineAttrs[ATTR.LINE_CLASS] === "pc-action") {
                endBottom = true;
              } else {
                indBottom++;
              }
            } else {
              endBottom = true;
            }
          }

          end = endTop && endBottom;
        }

        firstLine = indTop;
        lastLine = indBottom;
      }

      // apply auto format between firstLine and lastLine
      for (var i = firstLine; i <= lastLine; i++) {
        var originalLineText = self.codeMirror.getLine(i);

        if (originalLineText) {
          originalLineText = removeSentinels(originalLineText).trim();

          var lineText = originalLineText;
          var lineAttrs = self.getLineAttributes_(i);

          var currLineIsScene = lineText.match(FOUNTAIN_SECTIONS.scene_heading);
          var currLineIsCharacter = lineText.match(FOUNTAIN_SECTIONS.character);
          var currLineIsParenthetical = lineText.match(FOUNTAIN_SECTIONS.parenthetical);
          var nextLineIsCharacter = false;
          var nextLineIsParenthetical = false;

          if (i < lastLine) {
            var nextLineText = removeSentinels(self.codeMirror.getLine(i + 1));

            nextLineIsCharacter = nextLineText.match(FOUNTAIN_SECTIONS.character);
            nextLineIsParenthetical = nextLineText.match(FOUNTAIN_SECTIONS.parenthetical);
          }

          if (
            currLineIsScene ||
            (
              !currLineIsCharacter &&
              !currLineIsParenthetical &&
              !nextLineIsParenthetical
            ) ||
            (
              currLineIsCharacter &&
              nextLineIsCharacter
            )
          ) {
            // adding an extra line separator for these cases because
            // that's what the fountain parser is expecting
            lineText += "\n";
          }

          lines.push({ line: i, text: lineText });

          if (!lineAttrs[ATTR.SCENE_ID]) {
            // line without a sceneId (unlocked)
            if (originalLineText !== "") {
              if (
                !lineAttrs[ATTR.LINE_CLASS] ||
                lineAttrs[ATTR.LINE_CLASS_TYPE] === "auto"
              ) {
                // this is a line with text and without a manual format
                linesWithoutFormat.push(i);
              }
            }
          }
        }
      }

      var output = FOUNTAIN.parse(lines, { tokens: true });

      for (var i = 0; i < linesWithoutFormat.length; i++) {
        var lineNum = linesWithoutFormat[i];
        var token = output.tokens[lineNum];

        if (token) {
          var clazz = null;
          var clazzType = "auto";

          if (token.type === "scene_heading") clazz = "pc-scene";
          if (token.type === "transition") clazz = "pc-transition";
          if (token.type === "parenthetical") clazz = "pc-parenthetical";
          if (token.type === "dialogue") clazz = "pc-dialogue";
          if (token.type === "action") clazz = "pc-action";

          if (token.type === "character") {
            clazz = "pc-character";
            clazzType = "user";
          }

          if (token.type === "centered") {
            clazz = "pc-centered";

            if (token.text) {
              // clean formatting characters
              var centeredLine = self.codeMirror.getLine(lineNum);

              self.codeMirror.replaceRange(
                token.text.trim(),
                { line: lineNum, ch: 0 },
                { line: lineNum, ch: centeredLine.length },
                RichTextOriginPrefix
              );

              clazzType = "user";
            }
          }

          if (clazz) {
            self.updateLineAttributes(lineNum, lineNum, function(attributes) {
              attributes[ATTR.LINE_CLASS] = clazz;
              attributes[ATTR.LINE_CLASS_TYPE] = clazzType;
              delete attributes[ATTR.SCENE_CODE];
            });
          }
        }
      }

      if (!allLines && origin === "newline") {
        // do some predictive formatting for the next line
        var pLineAttrs = self.getLineAttributes_(pLine);

        if (pLineAttrs[ATTR.LINE_CLASS]) {
          if (pLineAttrs[ATTR.LINE_CLASS] === "pc-character") {
            // after character => dialogue (but can potentially change to parenthetical)
            self.updateLineAttributes(cursorLine, cursorLine, function(attributes) {
              attributes[ATTR.LINE_CLASS] = "pc-dialogue";
              attributes[ATTR.LINE_CLASS_TYPE] = "auto";
            });
          } else if (pLineAttrs[ATTR.LINE_CLASS] === "pc-parenthetical") {
            // after parenthetical => dialogue
            self.updateLineAttributes(cursorLine, cursorLine, function(attributes) {
              attributes[ATTR.LINE_CLASS] = "pc-dialogue";
              attributes[ATTR.LINE_CLASS_TYPE] = "user";
            });
          } else if (pLineAttrs[ATTR.LINE_CLASS] === "pc-dialogue") {
            // after dialogue => character
            self.updateLineAttributes(cursorLine, cursorLine, function(attributes) {
              attributes[ATTR.LINE_CLASS] = "pc-character";
              attributes[ATTR.LINE_CLASS_TYPE] = "user";
            });
          } else {
            // set as action otherwise
            self.updateLineAttributes(cursorLine, cursorLine, function(attributes) {
              attributes[ATTR.LINE_CLASS] = "pc-action";
              attributes[ATTR.LINE_CLASS_TYPE] = "auto";
            });
          }
        }

        self.onCursorActivity_();
      }
    }, 0);
  };

  RichTextCodeMirror.prototype.lockScene = function(
    sceneIdGenerator,
    sceneCode
  ) {
    if (sceneCode && typeof sceneIdGenerator === "function") {
      var self = this;
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();

      // loop from fistLine to lastLine looking for scenes without a sceneId
      for (var i = firstLine; i <= lastLine; i++) {
        var lineAttrs = self.getLineAttributes_(i);

        if (
          lineAttrs[ATTR.LINE_CLASS] === "pc-scene" &&
          lineAttrs[ATTR.SCENE_CODE] === sceneCode &&
          !lineAttrs[ATTR.SCENE_ID]
        ) {
          // scene line without a sceneId (unlocked)
          var lineText = self.codeMirror.getLine(i);
          lineText = removeSentinels(lineText).trim();

          if (lineText !== "") {
            // generate new sceneId
            var sceneId = sceneIdGenerator();

            // assign id to the scene
            self.updateLineAttributes(i, i, function(attributes) {
              attributes[ATTR.SCENE_ID] = sceneId;
            });
          } else {
            return "Invalid scene title";
          }

          return null;
        }
      }
    }
  };

  RichTextCodeMirror.prototype.lockScenes = function(
    sceneIdGenerator,
    sceneCodes
  ) {
    if (typeof sceneIdGenerator === "function") {
      var self = this;
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var errors = [];

      self.recodeScenes();

      // loop from fistLine to lastLine looking for scenes without a sceneId
      for (var i = firstLine; i <= lastLine; i++) {
        var lineAttrs = self.getLineAttributes_(i);

        if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
          // line with scene format
          var sceneCode = lineAttrs[ATTR.SCENE_CODE];

          if (
            sceneCode &&
            !lineAttrs[ATTR.SCENE_ID] &&
            (!sceneCodes ||
              !sceneCodes.length ||
              sceneCodes.includes(sceneCode))
          ) {
            // scene line without a sceneId (unlocked)
            var lineText = self.codeMirror.getLine(i);
            lineText = removeSentinels(lineText).trim();

            if (lineText !== "") {
              // generate new sceneId
              var sceneId = sceneIdGenerator();

              // assign id to the scene
              self.updateLineAttributes(i, i, function(attributes) {
                attributes[ATTR.SCENE_ID] = sceneId;
              });
            } else {
              errors.push({
                sceneCode: sceneCode,
                error: "Invalid scene title"
              });
            }
          }
        }
      }

      return errors;
    }
  };

  RichTextCodeMirror.prototype.deleteScene = function(sceneCode) {
    var self = this;
    var firstLine = self.codeMirror.firstLine();
    var lastLine = self.codeMirror.lastLine();
    var found = false;
    var omitted = false;
    var deleteStart = null;
    var deleteEnd = null;

    var scene = {
      title: "",
      attributes: {},
      content: []
    };

    // loop from firstLine to lastLine looking for the scene with the given code
    for (var i = firstLine; i <= lastLine; i++) {
      var lineAttrs = self.getLineAttributes_(i);
      var lineText = self.codeMirror.getLine(i);

      if (
        lineAttrs[ATTR.LINE_CLASS] === "pc-scene" &&
        lineAttrs[ATTR.SCENE_CODE]
      ) {
        // line with scene format
        if (found) {
          // found the next scene => exit loop
          break;
        }

        if (
          lineAttrs[ATTR.SCENE_CODE] === sceneCode &&
          !lineAttrs[ATTR.SCENE_OMITTED]
        ) {
          found = true;

          // save scene title and its attributes
          scene.title = lineText;
          scene.attributes = lineAttrs;

          if (lineAttrs[ATTR.SCENE_ID]) {
            // line with a sceneId (locked) => omit scene
            omitted = true;

            self.updateLineAttributes(i, i, function(attributes) {
              attributes[ATTR.SCENE_OMITTED] = true;
            });

            // replace scene title with "OMIT"
            var startCh = 0;
            var endCh = lineText.length;

            if (lineText[0] === LineSentinelCharacter) {
              startCh++;
            }

            self.codeMirror.replaceRange(
              "OMIT",
              { line: i, ch: startCh },
              { line: i, ch: endCh },
              RichTextOriginPrefix
            );
          } else {
            // line without a sceneId (unlocked) => delete scene title
            deleteStart = i;
            deleteEnd = i;
          }
        }
      } else if (found) {
        // save line and its attributes
        scene.content.push({
          text: lineText,
          attributes: lineAttrs
        });

        // delete line
        if (deleteStart === null) {
          deleteStart = i;
        }

        deleteEnd = i;
      }
    }

    if (found) {
      if (omitted) {
        // save omitted scene in firebase
        self.firebaseAdapter_.saveOmittedScene(sceneCode, scene);
      }

      // delete scene content
      self.codeMirror.replaceRange(
        "",
        { line: deleteStart, ch: 0 },
        { line: deleteEnd + 1, ch: 0 },
        RichTextOriginPrefix
      );
    }
  };

  RichTextCodeMirror.prototype.restoreScene = function(sceneCode) {
    var self = this;
    var firstLine = self.codeMirror.firstLine();
    var lastLine = self.codeMirror.lastLine();
    var found = false;

    // loop from fistLine to lastLine looking for the scene with the given code
    for (var i = firstLine; i <= lastLine; i++) {
      var lineAttrs = self.getLineAttributes_(i);
      var lineText = self.codeMirror.getLine(i);

      if (
        lineAttrs[ATTR.LINE_CLASS] === "pc-scene" &&
        lineAttrs[ATTR.SCENE_CODE] === sceneCode &&
        lineAttrs[ATTR.SCENE_OMITTED]
      ) {
        // get scene from firebase
        self.firebaseAdapter_.getOmittedScene(sceneCode, function(scene) {
          if (scene) {
            // replace "OMIT" with the scene title
            var endCh = lineText.length;

            self.codeMirror.replaceRange(
              scene.title,
              { line: i, ch: 0 },
              { line: i, ch: endCh },
              RichTextOriginPrefix
            );

            // restore scene attributes
            self.updateLineAttributes(i, i, function(attributes) {
              for (var attr in scene.attributes) {
                if (scene.attributes.hasOwnProperty(attr)) {
                  attributes[attr] = scene.attributes[attr];
                }
              }

              delete attributes[ATTR.SCENE_OMITTED];
            });

            // place scene content again in the editor
            var firstLine = true;

            for (var j = 0; j < scene.content.length; j++) {
              var lineNum = i + j + 1;
              var end = null;

              if (firstLine) {
                var firstLineText = self.codeMirror.getLine(lineNum);

                if (
                  firstLineText.length === 0 ||
                  self.areLineSentinelCharacters_(firstLineText)
                ) {
                  end = { line: lineNum + 1, ch: 0 };
                }

                firstLine = false;
              }

              self.codeMirror.replaceRange(
                scene.content[j].text + "\n",
                { line: lineNum, ch: 0 },
                end,
                RichTextOriginPrefix
              );

              // restore line attributes
              self.updateLineAttributes(lineNum, lineNum, function(attributes) {
                for (var attr in scene.content[j].attributes) {
                  if (scene.content[j].attributes.hasOwnProperty(attr)) {
                    attributes[attr] = scene.content[j].attributes[attr];
                  }
                }
              });
            }

            // remove omitted scene from firebase
            self.firebaseAdapter_.deleteOmittedScene(sceneCode);
          } else {
            console.log("Firepad: could not get omitted scene from firebase");
          }
        });

        return;
      }
    }
  };

  RichTextCodeMirror.prototype.recodeScenes = function() {
    var self = this;
    var firstLine = self.codeMirror.firstLine();
    var lastLine = self.codeMirror.lastLine();
    var scenes = [];
    var lockedScenesFound = false;

    // loop from fistLine to lastLine looking for scenes
    for (var i = firstLine; i <= lastLine; i++) {
      var lineAttrs = self.getLineAttributes_(i);

      if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
        // line with scene format
        var id = lineAttrs[ATTR.SCENE_ID];
        var code = "";
        var lineText = self.codeMirror.getLine(i);

        lineText = removeSentinels(lineText).trim();

        if (id) {
          // line with a sceneId (locked)
          lockedScenesFound = true;

          // only keep the assigned codes for the locked scenes
          code = lineAttrs[ATTR.SCENE_CODE];
        }

        // only code scenes with a title for the unlocked ones
        if (id || lineText) {
          scenes.push({
            lineNum: i,
            sceneId: id,
            sceneCode: code,
            sceneTitle: lineText
          });
        }
      }
    }

    // loop through the scenes generating the pending codes
    var lastSceneCode = "0";

    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].sceneCode === "") {
        var sceneCode = "";

        if (lockedScenesFound) {
          // loop until we find the suitable code for the scene
          var nextCode = getNextSceneCode(lastSceneCode);
          var end = false;

          while (!end) {
            // check if the code is used by another scene
            var found = false;
            var j = 0;

            while (!found && j < scenes.length) {
              if (scenes[j].sceneCode === nextCode) {
                found = true;
              } else {
                j++;
              }
            }

            if (!found) {
              // code is available => use it
              sceneCode = nextCode;
              end = true;
            } else if (j <= i) {
              // code used before the current scene => try the next code
              nextCode = getNextSceneCode(nextCode);
            } else {
              // code used after the current scene => jump to the next code level
              nextCode = getNextSceneCodeLevel(lastSceneCode);
              lastSceneCode = nextCode;
            }
          }
        } else {
          // there are no locked scenes yet => use the sequence numbers as the scenes codes
          sceneCode = (i + 1).toString();
        }

        // assign code to the scene
        scenes[i].sceneCode = sceneCode;

        self.updateLineAttributes(
          scenes[i].lineNum,
          scenes[i].lineNum,
          function(attributes) {
            attributes[ATTR.SCENE_CODE] = sceneCode;
          }
        );
      }

      lastSceneCode = scenes[i].sceneCode;
    }
  };

  RichTextCodeMirror.prototype.anchorThread = function(threadId) {
    if (this.emptySelection_()) {
      return "threads must be anchored to a text selection";
    }

    var attrs = this.getCurrentAttributes_();

    if (attrs[ATTR.THREAD]) {
      return "the selected text is already attached to another thread";
    }

    // check if the thread is already anchored to the screenplay
    var annotations = this.annotationList_.getAllAnnotations();

    for (var i = 0; i < annotations.length; i++) {
      if (annotations[i].attributes[ATTR.THREAD] === threadId) {
        return "thread already anchored to the sceenplay";
      }
    }

    // anchor the thread to the selected text
    this.setAttribute(ATTR.THREAD, threadId);
    this.onCursorActivity_();

    var self = this;

    setTimeout(function() {
      self.reportVisibleThreads();
    }, 0);
  };

  RichTextCodeMirror.prototype.deleteThread = function(threadId) {
    var self = this;

    setTimeout(function() {
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var indexes = [];

      for (var i = firstLine; i <= lastLine; i++) {
        var lineText = self.codeMirror.getLine(i);

        for (var j = 0; j < lineText.length; j++) {
          var index = self.codeMirror.indexFromPos({
            line: i,
            ch: j
          });

          var spans = self.annotationList_.getAnnotatedSpansForSpan(
            new Span(index, 1)
          );

          if (
            spans.length > 0 &&
            spans[0].annotation.attributes[ATTR.THREAD] === threadId
          ) {
            indexes.push(index);
          }
        }
      }

      for (var i = 0; i < indexes.length; i++) {
        self.updateTextAttributes(indexes[i], indexes[i] + 1, function(
          attributes
        ) {
          delete attributes[ATTR.THREAD];
        });
      }

      self.reportVisibleThreads();
    }, 0);
  };

  RichTextCodeMirror.prototype.scrollToThread = function(threadId) {
    var self = this;

    setTimeout(function() {
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();

      for (var i = firstLine; i <= lastLine; i++) {
        var lineText = self.codeMirror.getLine(i);

        for (var j = 0; j < lineText.length; j++) {
          var index = self.codeMirror.indexFromPos({
            line: i,
            ch: j
          });

          var spans = self.annotationList_.getAnnotatedSpansForSpan(
            new Span(index, 1)
          );

          if (
            spans.length > 0 &&
            spans[0].annotation.attributes[ATTR.THREAD] === threadId
          ) {
            self.codeMirror.focus();
            self.scrollToLine(i, true);
            return;
          }
        }
      }
    }, 0);
  };

  RichTextCodeMirror.prototype.setSelectedThread = function(threadId) {
    this.clearSelectedThread()

    var self = this;

    setTimeout(function() {
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var currentLine = firstLine;
      var foundThread = false;
      var thread = {};
      var inThread = false;

      while (!foundThread && currentLine <= lastLine ) {
        var lineText = self.codeMirror.getLine(currentLine);
        var currentChar = 0;

        while (!foundThread && currentChar < lineText.length) {
          var index = self.codeMirror.indexFromPos({
            line: currentLine,
            ch: currentChar
          });

          var spans = self.annotationList_.getAnnotatedSpansForSpan(
            new Span(index, 1)
          );

          if (
            spans.length > 0 &&
            spans[0].annotation.attributes[ATTR.THREAD] === threadId
          ) {
            if(!inThread){
              thread.from = {
                line: currentLine,
                ch: currentChar
              }
              inThread = true;
            }
          } else if(inThread) {
            thread.to = {
              line: currentLine,
              ch: currentChar,
            }
            foundThread = true;
          }
          currentChar++;
        }
        currentLine++
      }

      self.codeMirror.markText(thread.from, thread.to, { className: "firepad-thread-selected" })

    },0);
  };

  RichTextCodeMirror.prototype.clearSelectedThread = function() {
    var self = this;

    setTimeout(function() {
      var markers = self.codeMirror.getAllMarks();
      markers.forEach(function(m) {
        if(m.className === "firepad-thread-selected"){
          m.clear()
        }
      });
    }, 0);
  };

  RichTextCodeMirror.prototype.getAddedDiffScenes = function(callback) {
    var self = this;

    setTimeout(function() {
      var scenesMap = {};
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var currentSceneId = null;

      for (var i = firstLine; i <= lastLine; i++) {
        var lineAttrs = self.getLineAttributes_(i);

        if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
          currentSceneId = lineAttrs[ATTR.SCENE_ID];
        }

        if (currentSceneId && !scenesMap[currentSceneId]) {
          var lineText = self.codeMirror.getLine(i);

          for (var j = 0; j < lineText.length; j++) {
            var index = self.codeMirror.indexFromPos({
              line: i,
              ch: j
            });

            var spans = self.annotationList_.getAnnotatedSpansForSpan(
              new Span(index, 1)
            );

            if (
              spans.length > 0 &&
              spans[0].annotation.attributes[ATTR.DIFF]
            ) {
              scenesMap[currentSceneId] = true;
              break;
            }
          }
        }
      }

      var scenes = [];

      for (var sceneId in scenesMap) {
        if (scenesMap.hasOwnProperty(sceneId)) {
          scenes.push(sceneId);
        }
      }

      callback(scenes);
    }, 0);
  };

  RichTextCodeMirror.prototype.getAddedDiffLines = function(callback) {
    var self = this;

    if (!self.shootingEvent) {
      return callback([]);
    }

    setTimeout(function() {
      var lines = [];
      var scenes = self.shootingEvent.scenes || [];
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var sceneIncluded = false;

      for (var i = firstLine; i <= lastLine; i++) {
        var lineAttrs = self.getLineAttributes_(i);

        if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
          // search for the scene in the given array
          var id = lineAttrs[ATTR.SCENE_ID];
          var j = 0;

          sceneIncluded = false;

          while (j < scenes.length && !sceneIncluded) {
            if (scenes[j].sceneId === id) {
              sceneIncluded = true;
            }

            j++;
          }
        }

        if (sceneIncluded) {
          var lineText = self.codeMirror.getLine(i);

          for (var j = 0; j < lineText.length; j++) {
            var index = self.codeMirror.indexFromPos({
              line: i,
              ch: j
            });

            var spans = self.annotationList_.getAnnotatedSpansForSpan(
              new Span(index, 1)
            );

            if (
              spans.length > 0 &&
              spans[0].annotation.attributes[ATTR.DIFF]
            ) {
              lines.push(i);
              break;
            }
          }
        }
      }

      callback(lines);
    }, 0);
  };

  RichTextCodeMirror.prototype.deleteAddedDiffs = function(callback) {
    var self = this;

    if (!self.shootingEvent) {
      return callback();
    }

    setTimeout(function() {
      var indexes = [];
      var scenes = self.shootingEvent.scenes || [];
      var firstLine = self.codeMirror.firstLine();
      var lastLine = self.codeMirror.lastLine();
      var sceneIncluded = false;

      for (var i = firstLine; i <= lastLine; i++) {
        var lineAttrs = self.getLineAttributes_(i);

        if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
          // search for the scene in the given array
          var id = lineAttrs[ATTR.SCENE_ID];
          var j = 0;

          sceneIncluded = false;

          while (j < scenes.length && !sceneIncluded) {
            if (scenes[j].sceneId === id) {
              sceneIncluded = true;
            }

            j++;
          }
        }

        if (sceneIncluded) {
          var lineText = self.codeMirror.getLine(i);

          for (var j = 0; j < lineText.length; j++) {
            var index = self.codeMirror.indexFromPos({
              line: i,
              ch: j
            });
  
            var spans = self.annotationList_.getAnnotatedSpansForSpan(
              new Span(index, 1)
            );
  
            if (
              spans.length > 0 &&
              spans[0].annotation.attributes[ATTR.DIFF]
            ) {
              indexes.push(index);
            }
          }
        }
      }

      for (var i = 0; i < indexes.length; i++) {
        self.updateTextAttributes(indexes[i], indexes[i] + 1, function(
          attributes
        ) {
          delete attributes[ATTR.DIFF];
        });
      }

      callback();
    }, 0);
  };

  RichTextCodeMirror.prototype.toggleElement = function(
    elementId,
    elementColor
  ) {
    if (this.shootingEvent && this.shootingEvent.id === "") {
      console.log("no shootingEvent option found");
    } else {
      // look for the scene of the current cursor position
      var currentLine = this.codeMirror.getCursor("head").line;
      var firstLine = this.codeMirror.firstLine();
      var sceneId = null;

      while (currentLine >= firstLine && !sceneId) {
        var lineAttrs = this.getLineAttributes_(currentLine);

        if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
          sceneId = lineAttrs[ATTR.SCENE_ID];
        }

        currentLine--;
      }

      if (sceneId) {
        var attrs = this.getCurrentAttributes_();
        var elemAttrName = ATTR.ELEMENT + "-" + this.shootingEvent.id;
        var elemColorAttrName = ATTR.ELEMENT_COLOR + "-" + this.shootingEvent.id;
        var added = true;

        if (attrs[elemAttrName] === elementId) {
          if (this.emptySelection_()) {
            this.selectElement(elementId);
          }

          this.setAttribute(elemAttrName, false);
          this.setAttribute(elemColorAttrName, false);
          added = false;
        } else {
          if (this.emptySelection_()) {
            this.selectWord();
          }

          this.setAttribute(elemAttrName, elementId);
          this.setAttribute(elemColorAttrName, elementColor);
        }

        this.onCursorActivity_();

        return {
          sceneId: sceneId,
          elementAdded: added
        };
      } else {
        console.log("Firepad: cursor not inside a scene");
      }
    }

    return null;
  };

  RichTextCodeMirror.prototype.deleteElements = function(elementId) {
    var self = this;

    if (this.shootingEvent && this.shootingEvent.id === "") {
      console.log("no shootingEvent option found");
    } else {
      var elemAttrName = ATTR.ELEMENT + "-" + this.shootingEvent.id;
      var elemColorAttrName = ATTR.ELEMENT_COLOR + "-" + this.shootingEvent.id;

      setTimeout(function() {
        var firstLine = self.codeMirror.firstLine();
        var lastLine = self.codeMirror.lastLine();
        var indexes = [];

        for (var i = firstLine; i <= lastLine; i++) {
          var lineText = self.codeMirror.getLine(i);

          for (var j = 0; j < lineText.length; j++) {
            var index = self.codeMirror.indexFromPos({
              line: i,
              ch: j
            });

            var spans = self.annotationList_.getAnnotatedSpansForSpan(
              new Span(index, 1)
            );

            if (
              spans.length > 0 &&
              ((!elementId && spans[0].annotation.attributes[elemAttrName]) ||
                spans[0].annotation.attributes[elemAttrName] === elementId)
            ) {
              indexes.push(index);
            }
          }
        }

        for (var i = 0; i < indexes.length; i++) {
          self.updateTextAttributes(indexes[i], indexes[i] + 1, function(
            attributes
          ) {
            delete attributes[elemAttrName];
            delete attributes[elemColorAttrName];
          });
        }
      }, 0);
    }
  };

  RichTextCodeMirror.prototype.getElements = function() {
    var elements = {};

    if (this.shootingEvent && this.shootingEvent.id === "") {
      console.log("no shootingEvent option found");
    } else {
      var elemAttrName = ATTR.ELEMENT + "-" + this.shootingEvent.id;
      var annotations = this.annotationList_.getAllAnnotations();

      for (var i = 0; i < annotations.length; i++) {
        var elementId = annotations[i].attributes[elemAttrName];

        if (elementId) {
          elements[elementId] = true;
        }
      }
    }

    return elements;
  };

  RichTextCodeMirror.prototype.toggleLineAttribute = function(
    attribute,
    value
  ) {
    var currentAttributes = this.getCurrentLineAttributes_();
    var newValue;
    if (
      !(attribute in currentAttributes) ||
      currentAttributes[attribute] !== value
    ) {
      newValue = value;
    } else {
      newValue = false;
    }
    this.setLineAttribute(attribute, newValue);
  };

  RichTextCodeMirror.prototype.setLineAttribute = function(attribute, value) {
    this.updateLineAttributesForSelection(function(attributes) {
      if (value === false) {
        delete attributes[attribute];
      } else {
        attributes[attribute] = value;
      }
    });
  };

  RichTextCodeMirror.prototype.updateLineAttributesForSelection = function(
    updateFn
  ) {
    var cm = this.codeMirror;
    var start = cm.getCursor("start"),
      end = cm.getCursor("end");
    var startLine = start.line,
      endLine = end.line;
    var endLineText = cm.getLine(endLine);
    var endsAtBeginningOfLine = this.areLineSentinelCharacters_(
      endLineText.substr(0, end.ch)
    );
    if (endLine > startLine && endsAtBeginningOfLine) {
      // If the selection ends at the beginning of a line, don't include that line.
      endLine--;
    }

    this.updateLineAttributes(startLine, endLine, updateFn);
  };

  RichTextCodeMirror.prototype.updateLineAttributes = function(
    startLine,
    endLine,
    updateFn
  ) {
    // TODO: Batch this into a single operation somehow.
    for (var line = startLine; line <= endLine; line++) {
      var text = this.codeMirror.getLine(line);
      var lineStartIndex = this.codeMirror.indexFromPos({ line: line, ch: 0 });
      // Create line sentinel character if necessary.
      if (text[0] !== LineSentinelCharacter) {
        var attributes = {};
        attributes[ATTR.LINE_SENTINEL] = true;
        updateFn(attributes);
        this.insertText(lineStartIndex, LineSentinelCharacter, attributes);
      } else {
        this.updateTextAttributes(
          lineStartIndex,
          lineStartIndex + 1,
          updateFn,
          /*origin=*/ null,
          /*doLineAttributes=*/ true
        );
      }
    }
  };

  RichTextCodeMirror.prototype.replaceText = function(
    start,
    end,
    text,
    attributes,
    origin
  ) {
    this.changeId_++;
    var newOrigin = RichTextOriginPrefix + this.changeId_;
    this.outstandingChanges_[newOrigin] = {
      origOrigin: origin,
      attributes: attributes
    };

    var cm = this.codeMirror;
    var from = cm.posFromIndex(start);
    var to = typeof end === "number" ? cm.posFromIndex(end) : null;
    cm.replaceRange(text, from, to, newOrigin);
  };

  RichTextCodeMirror.prototype.insertText = function(
    index,
    text,
    attributes,
    origin
  ) {
    var cm = this.codeMirror;
    var cursor = cm.getCursor();
    var resetCursor =
      origin == "RTCMADAPTER" &&
      !cm.somethingSelected() &&
      index == cm.indexFromPos(cursor);
    this.replaceText(index, null, text, attributes, origin);
    if (resetCursor) cm.setCursor(cursor);
  };

  RichTextCodeMirror.prototype.removeText = function(start, end, origin) {
    var cm = this.codeMirror;
    cm.replaceRange("", cm.posFromIndex(start), cm.posFromIndex(end), origin);
  };

  RichTextCodeMirror.prototype.insertEntityAtCursor = function(
    type,
    info,
    origin
  ) {
    var cm = this.codeMirror;
    var index = cm.indexFromPos(cm.getCursor("head"));
    this.insertEntityAt(index, type, info, origin);
  };

  RichTextCodeMirror.prototype.insertEntityAt = function(
    index,
    type,
    info,
    origin
  ) {
    var cm = this.codeMirror;
    this.insertEntity_(index, new firepad.Entity(type, info), origin);
  };

  RichTextCodeMirror.prototype.insertEntity_ = function(index, entity, origin) {
    this.replaceText(
      index,
      null,
      EntitySentinelCharacter,
      entity.toAttributes(),
      origin
    );
  };

  RichTextCodeMirror.prototype.getAttributeSpans = function(start, end) {
    var spans = [];
    var annotatedSpans = this.annotationList_.getAnnotatedSpansForSpan(
      new Span(start, end - start)
    );
    for (var i = 0; i < annotatedSpans.length; i++) {
      spans.push({
        length: annotatedSpans[i].length,
        attributes: annotatedSpans[i].annotation.attributes
      });
    }

    return spans;
  };

  RichTextCodeMirror.prototype.end = function() {
    var lastLine = this.codeMirror.lineCount() - 1;
    return this.codeMirror.indexFromPos({
      line: lastLine,
      ch: this.codeMirror.getLine(lastLine).length
    });
  };

  RichTextCodeMirror.prototype.getRange = function(start, end) {
    var from = this.codeMirror.posFromIndex(start),
      to = this.codeMirror.posFromIndex(end);
    return this.codeMirror.getRange(from, to);
  };

  RichTextCodeMirror.prototype.initAnnotationList_ = function() {
    // Insert empty annotation span for existing content.
    var end = this.end();
    if (end !== 0) {
      this.annotationList_.insertAnnotatedSpan(
        new Span(0, end),
        new RichTextAnnotation()
      );
    }
  };

  /**
   * Updates the nodes of an Annotation.
   * @param {Array.<OldAnnotatedSpan>} oldNodes The list of nodes to replace.
   * @param {Array.<NewAnnotatedSpan>} newNodes The new list of nodes.
   */
  RichTextCodeMirror.prototype.onAnnotationsChanged_ = function(
    oldNodes,
    newNodes
  ) {
    var marker;
    var linesToReMark = {};

    // Update any entities in-place that we can.  This will remove them from the oldNodes/newNodes lists
    // so we don't remove and recreate them below.
    this.tryToUpdateEntitiesInPlace(oldNodes, newNodes);

    for (var i = 0; i < oldNodes.length; i++) {
      var attributes = oldNodes[i].annotation.attributes;

      if (ATTR.LINE_SENTINEL in attributes) {
        linesToReMark[
          this.codeMirror.posFromIndex(oldNodes[i].pos).line
        ] = true;
      }

      marker = oldNodes[i].getAttachedObject();
      if (marker) {
        marker.clear();
      }
    }

    for (i = 0; i < newNodes.length; i++) {
      var annotation = newNodes[i].annotation;
      var attributes = annotation.attributes;
      var forLine = ATTR.LINE_SENTINEL in attributes;
      var entity = ATTR.ENTITY_SENTINEL in attributes;
      var from = this.codeMirror.posFromIndex(newNodes[i].pos);

      if (forLine) {
        linesToReMark[from.line] = true;
      } else if (entity) {
        this.markEntity_(newNodes[i]);
      } else {
        var className = this.getClassNameForAttributes_(attributes);
        if (className !== "") {
          var to = this.codeMirror.posFromIndex(
            newNodes[i].pos + newNodes[i].length
          );
          marker = this.codeMirror.markText(from, to, { className: className });
          newNodes[i].attachObject(marker);
        }
      }
    }

    for (var line in linesToReMark) {
      this.dirtyLines_.push(this.codeMirror.getLineHandle(Number(line)));
      this.queueLineMarking_();
    }
  };

  RichTextCodeMirror.prototype.tryToUpdateEntitiesInPlace = function(
    oldNodes,
    newNodes
  ) {
    // Loop over nodes in reverse order so we can easily splice them out as necessary.
    var oldNodesLen = oldNodes.length;
    while (oldNodesLen--) {
      var oldNode = oldNodes[oldNodesLen];
      var newNodesLen = newNodes.length;
      while (newNodesLen--) {
        var newNode = newNodes[newNodesLen];
        if (
          oldNode.pos == newNode.pos &&
          oldNode.length == newNode.length &&
          oldNode.annotation.attributes["ent"] &&
          oldNode.annotation.attributes["ent"] ==
            newNode.annotation.attributes["ent"]
        ) {
          var entityType = newNode.annotation.attributes["ent"];
          if (this.entityManager_.entitySupportsUpdate(entityType)) {
            // Update it in place and remove the change from oldNodes / newNodes so we don't process it below.
            oldNodes.splice(oldNodesLen, 1);
            newNodes.splice(newNodesLen, 1);
            var marker = oldNode.getAttachedObject();
            marker.update(newNode.annotation.attributes);
            newNode.attachObject(marker);
          }
        }
      }
    }
  };

  RichTextCodeMirror.prototype.queueLineMarking_ = function() {
    if (this.lineMarkTimeout_ != null) return;
    var self = this;

    this.lineMarkTimeout_ = setTimeout(function() {
      self.lineMarkTimeout_ = null;
      var dirtyLineNumbers = [];
      for (var i = 0; i < self.dirtyLines_.length; i++) {
        var lineNum = self.codeMirror.getLineNumber(self.dirtyLines_[i]);
        dirtyLineNumbers.push(Number(lineNum));
      }
      self.dirtyLines_ = [];

      dirtyLineNumbers.sort(function(a, b) {
        return a - b;
      });
      var lastLineMarked = -1;
      for (i = 0; i < dirtyLineNumbers.length; i++) {
        var lineNumber = dirtyLineNumbers[i];
        if (lineNumber > lastLineMarked) {
          lastLineMarked = self.markLineSentinelCharactersForChangedLines_(
            lineNumber,
            lineNumber
          );
        }
      }
    }, 0);
  };

  RichTextCodeMirror.prototype.addStyleWithCSS_ = function(css) {
    const head = document.getElementsByTagName("head")[0];
    const style = document.createElement("style");

    style.type = "text/css";
    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }

    head.appendChild(style);
    this.styleElements.push(style);
  };

  RichTextCodeMirror.prototype.getClassNameForAttributes_ = function(
    attributes
  ) {
    var globalClassName = "";

    for (var attr in attributes) {
      var val = attributes[attr];

      if (attr === ATTR.LINE_SENTINEL) {
        firepad.utils.assert(
          val === true,
          "LINE_SENTINEL attribute should be true if it exists."
        );
      } else {
        var className =
          (this.options_["cssPrefix"] || RichTextClassPrefixDefault) + attr;

        if (val !== true) {
          // Append "px" to font size if it's missing.
          // Probably could be removed now as parseHtml automatically adds px when required
          if (attr === ATTR.FONT_SIZE && typeof val !== "string") {
            val = val + "px";
          }

          var classVal = val.toString().replace(/[^A-Za-z0-9-_]/g, "-");
          className += "-" + classVal;

          if (DynamicStyleAttributes[attr]) {
            if (!StyleCache_[attr]) StyleCache_[attr] = {};

            if (!StyleCache_[attr][classVal]) {
              var dynStyle = DynamicStyleAttributes[attr];

              var css =
                typeof dynStyle === "function"
                  ? dynStyle(val)
                  : dynStyle + ": " + val;

              var selector = "";

              if (attr == ATTR.LINE_INDENT) {
                selector = "pre." + className;
              } else if (attr == ATTR.SCENE_CODE) {
                if (attributes[ATTR.SCENE_ID]) {
                  selector = "." + className + "::before";
                }
              } else if (attr == ATTR.SCENE_ID) {
                selector = "." + className + "::after";
              } else {
                selector = "." + className;
              }

              if (selector) {
                this.addStyleWithCSS_(selector + " { " + css + " }");
                StyleCache_[attr][classVal] = true;
              }
            }
          }
        }

        globalClassName = globalClassName + " " + className;
      }
    }

    return globalClassName;
  };

  RichTextCodeMirror.prototype.markEntity_ = function(annotationNode) {
    var attributes = annotationNode.annotation.attributes;
    var entity = firepad.Entity.fromAttributes(attributes);
    var cm = this.codeMirror;
    var self = this;

    var markers = [];
    for (var i = 0; i < annotationNode.length; i++) {
      var from = cm.posFromIndex(annotationNode.pos + i);
      var to = cm.posFromIndex(annotationNode.pos + i + 1);

      var options = {
        collapsed: true,
        atomic: true,
        inclusiveLeft: false,
        inclusiveRight: false
      };

      var entityHandle = this.createEntityHandle_(entity, annotationNode.pos);

      var element = this.entityManager_.renderToElement(entity, entityHandle);
      if (element) {
        options.replacedWith = element;
      }
      var marker = cm.markText(from, to, options);
      markers.push(marker);
      entityHandle.setMarker(marker);
    }

    annotationNode.attachObject({
      clear: function() {
        for (var i = 0; i < markers.length; i++) {
          markers[i].clear();
        }
      },

      /**
       * Updates the attributes of all the AnnotationNode entities.
       * @param {Object.<string, string>} info The full list of new
       *     attributes to apply.
       */
      update: function(info) {
        var entity = firepad.Entity.fromAttributes(info);
        for (var i = 0; i < markers.length; i++) {
          self.entityManager_.updateElement(entity, markers[i].replacedWith);
        }
      }
    });

    // This probably shouldn't be necessary.  There must be a lurking CodeMirror bug.
    this.queueRefresh_();
  };

  RichTextCodeMirror.prototype.queueRefresh_ = function() {
    var self = this;
    if (!this.refreshTimer_) {
      this.refreshTimer_ = setTimeout(function() {
        self.codeMirror.refresh();
        self.refreshTimer_ = null;
      }, 0);
    }
  };

  RichTextCodeMirror.prototype.createEntityHandle_ = function(
    entity,
    location
  ) {
    var marker = null;
    var self = this;

    function find() {
      if (marker) {
        var where = marker.find();
        return where ? self.codeMirror.indexFromPos(where.from) : null;
      } else {
        return location;
      }
    }

    function remove() {
      var at = find();
      if (at != null) {
        self.codeMirror.focus();
        self.removeText(at, at + 1);
      }
    }

    /**
     * Updates the attributes of an Entity.  Will call .update() if the entity supports it,
     * else it'll just remove / re-create the entity.
     * @param {Object.<string, string>} info The full list of new
     *     attributes to apply.
     */
    function replace(info) {
      var ATTR = firepad.AttributeConstants;
      var SENTINEL = ATTR.ENTITY_SENTINEL;
      var PREFIX = SENTINEL + "_";

      var at = find();

      self.updateTextAttributes(at, at + 1, function(attrs) {
        for (var member in attrs) {
          delete attrs[member];
        }
        attrs[SENTINEL] = entity.type;

        for (var attr in info) {
          attrs[PREFIX + attr] = info[attr];
        }
      });
    }

    function setMarker(m) {
      marker = m;
    }

    return {
      find: find,
      remove: remove,
      replace: replace,
      setMarker: setMarker
    };
  };

  RichTextCodeMirror.prototype.lineClassRemover_ = function(lineNum) {
    var cm = this.codeMirror;
    var lineHandle = cm.getLineHandle(lineNum);
    return {
      clear: function() {
        // HACK to remove all classes (since CodeMirror treats this as a regex internally).
        cm.removeLineClass(lineHandle, "text", ".*");
      }
    };
  };

  RichTextCodeMirror.prototype.emptySelection_ = function() {
    var start = this.codeMirror.getCursor("start");
    var end = this.codeMirror.getCursor("end");

    return start.line === end.line && start.ch === end.ch;
  };

  RichTextCodeMirror.prototype.onLockedScenesDeleteIntent = function(callback) {
    this.onLockedScenesDeleteIntentCallback = callback;
  };

  RichTextCodeMirror.prototype.onLockedSceneTitleEdited = function(callback) {
    this.onLockedSceneTitleEditedCallback = callback;
  };

  RichTextCodeMirror.prototype.onCodeMirrorBeforeChange_ = function(
    cm,
    change
  ) {
    if (this.ready_ &&
      change.origin &&
      change.origin.indexOf(RichTextOriginPrefix) !== 0 &&
      change.origin !== "RTCMADAPTER") {
      var self = this;

      // check if there are locked scenes affected
      var lockedScenes = self.getScenes(change.from.line, change.to.line, true);

      for (var i = 0; i < lockedScenes.length; i++) {
        if (lockedScenes[i].sceneOmitted) {
          // there is an omitted scene affected => cancel change
          change.cancel();
          return;
        }
      }

      if (lockedScenes.length === 1) {
        var lockedScene = lockedScenes[0];
        var changeType = "edit";

        // determine change type
        var changeBeginsBeforeSentinel =
          change.from.line < lockedScene.lineNum ||
          (change.from.line === lockedScene.lineNum && change.from.ch <= 0);

        var changeEndsAfterSentinel =
          change.to.line > lockedScene.lineNum ||
          (change.to.line === lockedScene.lineNum && change.to.ch >= 1);

        var deleteOnFirstLine =
          change.origin === "+delete" &&
          change.from.line === lockedScene.lineNum &&
          change.to.line === lockedScene.lineNum &&
          change.from.ch === 1 &&
          change.to.ch === 1;

        var changeDeletesTitleLine = 
          change.from.line === lockedScene.lineNum &&
          change.from.ch === 1 &&
          change.to.line > lockedScene.lineNum;

        if (
          (changeBeginsBeforeSentinel && changeEndsAfterSentinel) ||
          deleteOnFirstLine ||
          changeDeletesTitleLine
        ) {
          changeType = "delete";
        }

        // take the appropriate action based on change type
        if (changeType === "edit") {
          if (self.onLockedSceneTitleEditedCallback) {
            setTimeout(function() {
              self.onLockedSceneTitleEditedCallback(lockedScene);
            }, 0);
          }

          // allow change
          change.update(change.from, change.to, change.text);
        } else if (changeType === "delete") {
          if (self.onLockedScenesDeleteIntentCallback) {
            setTimeout(function() {
              self.onLockedScenesDeleteIntentCallback(lockedScenes);
            }, 0);
          }

          // cancel change
          change.cancel();
          return;
        }
      } else if (lockedScenes.length > 1) {
        if (change.origin === "+delete" || change.origin === "cut") {
          if (self.onLockedScenesDeleteIntentCallback) {
            setTimeout(function() {
              self.onLockedScenesDeleteIntentCallback(lockedScenes);
            }, 0);
          }
        } else {
          console.log("Firepad: Intent of deleting a locked scene blocked");
        }

        // cancel change
        change.cancel();
        return;
      }
    }
  };

  RichTextCodeMirror.prototype.onCodeMirrorChange_ = function(cm, cmChanges) {
    // Handle single change objects and linked lists of change objects.
    if (typeof cmChanges.from === "object") {
      var changeArray = [];

      while (cmChanges) {
        changeArray.push(cmChanges);
        cmChanges = cmChanges.next;
      }

      cmChanges = changeArray;
    }

    var changes = this.convertCoordinateSystemForChanges_(cmChanges);
    var newChanges = [];

    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var start = change.start;
      var end = change.end;
      var text = change.text;
      var removed = change.removed;
      var origin = change.origin;

      // When text with multiple sets of attributes on it is removed, we need to split it into separate remove changes.
      if (removed.length > 0) {
        var oldAnnotationSpans = this.annotationList_.getAnnotatedSpansForSpan(
          new Span(start, removed.length)
        );

        var removedPos = 0;

        for (var j = 0; j < oldAnnotationSpans.length; j++) {
          var span = oldAnnotationSpans[j];

          newChanges.push({
            start: start,
            end: start + span.length,
            removedAttributes: span.annotation.attributes,
            removed: removed.substr(removedPos, span.length),
            attributes: {},
            text: "",
            origin: change.origin
          });

          removedPos += span.length;
        }

        this.annotationList_.removeSpan(new Span(start, removed.length));
      }

      if (text.length > 0) {
        var attributes;

        if (change.origin === "+input" || change.origin === "paste") {
          attributes = this.currentAttributes_ || {};
          attributes[ATTR.DIFF] = "added";

          if (change.origin === "paste") {
            var self = this;
            var fromPos = cm.posFromIndex(start);
            var toPos = cm.posFromIndex(start + text.length);

            setTimeout(function() {
              self.screenplayAutoFormat(false, "paste", fromPos.line, toPos.line);
            }, 100);
          }
        } else if (origin in this.outstandingChanges_) {
          attributes = this.outstandingChanges_[origin].attributes;
          origin = this.outstandingChanges_[origin].origOrigin;
          delete this.outstandingChanges_[origin];
        } else {
          attributes = {};
        }

        this.annotationList_.insertAnnotatedSpan(
          new Span(start, text.length),
          new RichTextAnnotation(attributes)
        );

        newChanges.push({
          start: start,
          end: start,
          removedAttributes: {},
          removed: "",
          text: text,
          attributes: attributes,
          origin: origin
        });
      }
    }

    this.markLineSentinelCharactersForChanges_(cmChanges);

    if (newChanges.length > 0) {
      this.trigger("change", this, newChanges);
    }
  };

  RichTextCodeMirror.prototype.onCopyOrCut_ = function(cm, e) {
    if (this.options_.screenplayMode === "tag" && e.type === "cut") {
      e.preventDefault();
      return;
    }

    if (
      e.clipboardData &&
      e.clipboardData.clearData &&
      e.clipboardData.setData
    ) {
      var selection = cm.getSelection("\n");
      var text = removeSentinels(selection);

      if (!text) return;

      var start = cm.getCursor("start");
      var end = cm.getCursor("end");
      var procliqJson = [];

      for (var i = start.line; i <= end.line; i++) {
        var lineText = cm.getLine(i);
        var lineAttrs = this.getLineAttributes_(i);
        var attrs = {};

        attrs[ATTR.LINE_SENTINEL] = true;

        if (lineAttrs[ATTR.LINE_CLASS]) {
          attrs[ATTR.LINE_CLASS] = lineAttrs[ATTR.LINE_CLASS];
        }

        if (lineAttrs[ATTR.LINE_CLASS_TYPE]) {
          attrs[ATTR.LINE_CLASS_TYPE] = lineAttrs[ATTR.LINE_CLASS_TYPE];
        }

        if (i === start.line && start.ch > 1) {
          // only use the selected part of the first line
          lineText = cm.getRange(start, {
            line: i,
            ch: lineText.length
          });

          // only save attributes of the first line if the selection starts on the first character
          attrs = null;
        }

        if (i === end.line && end.ch < lineText.length) {
          // only use the selected part of the last line
          lineText = cm.getRange({
            line: i,
            ch: 0
          }, end);
        }

        procliqJson.push({
          text: removeSentinels(lineText),
          attrs: attrs
        });
      }

      var procliqText = JSON.stringify(procliqJson);

      if (e.type === "cut") {
        cm.replaceSelection("", null, "cut");
      }

      e.clipboardData.clearData();
      e.clipboardData.setData("text", text);
      e.clipboardData.setData("procliq", procliqText);

      e.preventDefault();
    }
  };

  RichTextCodeMirror.prototype.onPaste_ = function(cm, e) {
    if (this.options_.screenplayMode === "tag") {
      e.preventDefault();
      return;
    }

    if (e.clipboardData && e.clipboardData.getData) {
      var procliqText = e.clipboardData.getData("procliq");

      if (procliqText !== "") {
        try {
          var procliqJson = JSON.parse(procliqText);

          if (procliqJson.length > 1) {
            e.preventDefault();

            var start = cm.getCursor("start");
            var end = cm.getCursor("end");
            var line = start.line;
            var endLineText = cm.getLine(end.line);

            if (end.ch < endLineText.length) {
              var endText = endLineText.substring(end.ch);

              procliqJson[procliqJson.length - 1].text += endText;

              cm.extendSelection(start, {
                line: end.line,
                ch: endLineText.length
              });
            }

            cm.replaceSelection("", null, "cut");

            for (var i = 0; i < procliqJson.length; i++) {
              var text = procliqJson[i].text;
              var attrs = procliqJson[i].attrs;
              var ch = 1;

              if (line === start.line && start.ch > 1) {
                // only save attributes of the first line if the selection starts on the first character
                attrs = null;
                ch = start.ch;
              }

              if (i < (procliqJson.length - 1)) {
                text += "\n";
              }

              if (attrs) {
                var index = cm.indexFromPos({ line: line, ch: 0 });
                this.insertText(index, LineSentinelCharacter, attrs);
              }

              var index = cm.indexFromPos({ line: line, ch: ch });
              this.insertText(index, text, {});

              line++;
            }
          }
        }
        catch(ex){
          console.log(ex);
        }
      }
    }
  };

  RichTextCodeMirror.prototype.onScroll_ = function(cm) {
    if (this.options_.screenplayMode === "edit") {
      var self = this;

      setTimeout(function() {
        self.reportVisibleThreads();
      }, 0);
    }
  };

  RichTextCodeMirror.prototype.reportVisibleThreads = function() {
    if (this.onVisibleThreadsChangeCallback) {
      var cm = this.codeMirror;
      var rect = cm.getWrapperElement().getBoundingClientRect();
      var from = cm.lineAtHeight(rect.top, "window");
      var to = cm.lineAtHeight(rect.bottom, "window");

      if (from === this.visibleThreadsFrom && to === this.visibleThreadsTo) return;

      this.visibleThreadsFrom = from;
      this.visibleThreadsTo = to;

      var threads = {};
      var serializedThreads = "";

      for (var i = this.visibleThreadsFrom; i <= this.visibleThreadsTo; i++) {
        var lineText = this.codeMirror.getLine(i);

        if (lineText) {
          for (var j = 0; j < lineText.length; j++) {
            var pos = {
              line: i,
              ch: j
            };

            var index = this.codeMirror.indexFromPos(pos);

            var spans = this.annotationList_.getAnnotatedSpansForSpan(
              new Span(index, 1)
            );

            if (spans.length > 0 && spans[0].annotation.attributes[ATTR.THREAD]) {
              var threadId = spans[0].annotation.attributes[ATTR.THREAD];

              if (!threads[threadId]) {
                threads[threadId] = pos;

                serializedThreads += threadId + "|";
                serializedThreads += i + "|";
                serializedThreads += j + "|";
              }
            }
          }
        }
      }

      if (serializedThreads !== this.serializedThreads) {
        this.serializedThreads = serializedThreads;
        this.onVisibleThreadsChangeCallback(threads);
      }
    }
  };

  RichTextCodeMirror.prototype.convertCoordinateSystemForChanges_ = function(
    changes
  ) {
    // We have to convert the positions in the pre-change coordinate system to indexes.
    // CodeMirror's `indexFromPos` method does this for the current state of the editor.
    // We can use the information of a single change object to convert a post-change
    // coordinate system to a pre-change coordinate system. We can now proceed inductively
    // to get a pre-change coordinate system for all changes in the linked list.  A
    // disadvantage of this approach is its complexity `O(n^2)` in the length of the
    // linked list of changes.

    var self = this;
    var indexFromPos = function(pos) {
      return self.codeMirror.indexFromPos(pos);
    };

    function updateIndexFromPos(indexFromPos, change) {
      return function(pos) {
        if (posLe(pos, change.from)) {
          return indexFromPos(pos);
        }
        if (posLe(change.to, pos)) {
          return (
            indexFromPos({
              line:
                pos.line +
                change.text.length -
                1 -
                (change.to.line - change.from.line),
              ch:
                change.to.line < pos.line
                  ? pos.ch
                  : change.text.length <= 1
                    ? pos.ch -
                      (change.to.ch - change.from.ch) +
                      sumLengths(change.text)
                    : pos.ch - change.to.ch + last(change.text).length
            }) +
            sumLengths(change.removed) -
            sumLengths(change.text)
          );
        }
        if (change.from.line === pos.line) {
          return indexFromPos(change.from) + pos.ch - change.from.ch;
        }
        return (
          indexFromPos(change.from) +
          sumLengths(change.removed.slice(0, pos.line - change.from.line)) +
          1 +
          pos.ch
        );
      };
    }

    var newChanges = [];
    for (var i = changes.length - 1; i >= 0; i--) {
      var change = changes[i];
      indexFromPos = updateIndexFromPos(indexFromPos, change);

      var start = indexFromPos(change.from);

      var removedText = change.removed.join("\n");
      var text = change.text.join("\n");
      newChanges.unshift({
        start: start,
        end: start + removedText.length,
        removed: removedText,
        text: text,
        origin: change.origin
      });
    }
    return newChanges;
  };

  /**
   * Detects whether any line sentinel characters were added or removed by the change and if so,
   * re-marks line sentinel characters on the affected range of lines.
   * @param changes
   * @private
   */
  RichTextCodeMirror.prototype.markLineSentinelCharactersForChanges_ = function(
    changes
  ) {
    // TODO: This doesn't handle multiple changes correctly (overlapping, out-of-oder, etc.).
    // But In practice, people using firepad for rich-text editing don't batch multiple changes
    // together, so this isn't quite as bad as it seems.
    var startLine = Number.MAX_VALUE,
      endLine = -1;

    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var line = change.from.line,
        ch = change.from.ch;

      if (
        change.removed.length > 1 ||
        change.removed[0].indexOf(LineSentinelCharacter) >= 0
      ) {
        // We removed 1+ newlines or line sentinel characters.
        startLine = Math.min(startLine, line);
        endLine = Math.max(endLine, line);
      }

      if (change.text.length > 1) {
        // 1+ newlines
        startLine = Math.min(startLine, line);
        endLine = Math.max(endLine, line + change.text.length - 1);
      } else if (change.text[0].indexOf(LineSentinelCharacter) >= 0) {
        startLine = Math.min(startLine, line);
        endLine = Math.max(endLine, line);
      }
    }

    // HACK: Because the above code doesn't handle multiple changes correctly, endLine might be invalid.  To
    // avoid crashing, we just cap it at the line count.
    endLine = Math.min(endLine, this.codeMirror.lineCount() - 1);

    this.markLineSentinelCharactersForChangedLines_(startLine, endLine);
  };

  RichTextCodeMirror.prototype.markLineSentinelCharactersForChangedLines_ = function(
    startLine,
    endLine
  ) {
    // Back up to first list item.
    if (startLine < Number.MAX_VALUE) {
      while (startLine > 0 && this.lineIsListItemOrIndented_(startLine - 1)) {
        startLine--;
      }
    }

    // Advance to last list item.
    if (endLine > -1) {
      var lineCount = this.codeMirror.lineCount();
      while (
        endLine + 1 < lineCount &&
        this.lineIsListItemOrIndented_(endLine + 1)
      ) {
        endLine++;
      }
    }

    // keeps track of the list number at each indent level.
    var listNumber = [];

    var cm = this.codeMirror;
    for (var line = startLine; line <= endLine; line++) {
      var text = cm.getLine(line);

      // Remove any existing line classes.
      var lineHandle = cm.getLineHandle(line);
      cm.removeLineClass(lineHandle, "text", ".*");

      if (text.length > 0) {
        var markIndex = text.indexOf(LineSentinelCharacter);
        while (markIndex >= 0) {
          var markStartIndex = markIndex;

          // Find the end of this series of sentinel characters, and remove any existing markers.
          while (
            markIndex < text.length &&
            text[markIndex] === LineSentinelCharacter
          ) {
            var marks = cm.findMarksAt({ line: line, ch: markIndex });
            for (var i = 0; i < marks.length; i++) {
              if (marks[i].isForLineSentinel) {
                marks[i].clear();
              }
            }

            markIndex++;
          }

          this.markLineSentinelCharacters_(
            line,
            markStartIndex,
            markIndex,
            listNumber
          );
          markIndex = text.indexOf(LineSentinelCharacter, markIndex);
        }
      } else {
        // Reset all indents.
        listNumber = [];
      }
    }

    return endLine;
  };

  RichTextCodeMirror.prototype.markLineSentinelCharacters_ = function(
    line,
    startIndex,
    endIndex,
    listNumber
  ) {
    var cm = this.codeMirror;
    // If the mark is at the beginning of the line and it represents a list element, we need to replace it with
    // the appropriate html element for the list heading.
    var element = null;
    var marker = null;
    var getMarkerLine = function() {
      var span = marker.find();
      return span ? span.from.line : null;
    };

    if (startIndex === 0) {
      var attributes = this.getLineAttributes_(line);
      var listType = attributes[ATTR.LIST_TYPE];
      var indent = attributes[ATTR.LINE_INDENT] || 0;
      if (listType && indent === 0) {
        indent = 1;
      }
      while (indent >= listNumber.length) {
        listNumber.push(1);
      }
      if (listType === "o") {
        element = this.makeOrderedListElement_(listNumber[indent]);
        listNumber[indent]++;
      } else if (listType === "u") {
        element = this.makeUnorderedListElement_();
        listNumber[indent] = 1;
      } else if (listType === "t") {
        element = this.makeTodoListElement_(false, getMarkerLine);
        listNumber[indent] = 1;
      } else if (listType === "tc") {
        element = this.makeTodoListElement_(true, getMarkerLine);
        listNumber[indent] = 1;
      }

      var className = this.getClassNameForAttributes_(attributes);
      if (className !== "") {
        this.codeMirror.addLineClass(line, "text", className);
      }

      // Reset deeper indents back to 1.
      listNumber = listNumber.slice(0, indent + 1);
    }

    // Create a marker to cover this series of sentinel characters.
    // NOTE: The reason we treat them as a group (one marker for all subsequent sentinel characters instead of
    // one marker for each sentinel character) is that CodeMirror seems to get angry if we don't.
    var markerOptions = { inclusiveLeft: true, collapsed: true };
    if (element) {
      markerOptions.replacedWith = element;
    }
    var marker = cm.markText(
      { line: line, ch: startIndex },
      { line: line, ch: endIndex },
      markerOptions
    );
    // track that it's a line-sentinel character so we can identify it later.
    marker.isForLineSentinel = true;
  };

  RichTextCodeMirror.prototype.makeOrderedListElement_ = function(number) {
    return utils.elt("div", number + ".", {
      class: "firepad-list-left"
    });
  };

  RichTextCodeMirror.prototype.makeUnorderedListElement_ = function() {
    return utils.elt("div", "\u2022", {
      class: "firepad-list-left"
    });
  };

  RichTextCodeMirror.prototype.toggleTodo = function(noRemove) {
    var attribute = ATTR.LIST_TYPE;
    var currentAttributes = this.getCurrentLineAttributes_();
    var newValue;
    if (
      !(attribute in currentAttributes) ||
      (currentAttributes[attribute] !== "t" &&
        currentAttributes[attribute] !== "tc")
    ) {
      newValue = "t";
    } else if (currentAttributes[attribute] === "t") {
      newValue = "tc";
    } else if (currentAttributes[attribute] === "tc") {
      newValue = noRemove ? "t" : false;
    }
    this.setLineAttribute(attribute, newValue);
  };

  RichTextCodeMirror.prototype.makeTodoListElement_ = function(
    checked,
    getMarkerLine
  ) {
    var params = {
      type: "checkbox",
      class: "firepad-todo-left"
    };
    if (checked) params["checked"] = true;
    var el = utils.elt("input", false, params);
    var self = this;
    utils.on(
      el,
      "click",
      utils.stopEventAnd(function(e) {
        self.codeMirror.setCursor({ line: getMarkerLine(), ch: 1 });
        self.toggleTodo(true);
      })
    );
    return el;
  };

  RichTextCodeMirror.prototype.lineIsListItemOrIndented_ = function(lineNum) {
    var attrs = this.getLineAttributes_(lineNum);
    return (
      (attrs[ATTR.LIST_TYPE] || false) !== false ||
      (attrs[ATTR.LINE_INDENT] || 0) !== 0
    );
  };

  RichTextCodeMirror.prototype.onCursorChange = function(callback) {
    this.onCursorChangeCallback = callback;
  };

  RichTextCodeMirror.prototype.filterScenes = function() {
    if (this.shootingEvent) {
      var scenes = this.shootingEvent.scenes || [];
      var hideMarks = [];
      var hideStart = 0;
      var showingScene = false;
      var showingSecondaryScene = false;
      var firstScene = true;
      var firstLine = this.codeMirror.firstLine();
      var lastLine = this.codeMirror.lastLine();

      for (var i = firstLine; i <= lastLine; i++) {
        var lineAttrs = this.getLineAttributes_(i);

        if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
          // search for the scene in the given array
          var id = lineAttrs[ATTR.SCENE_ID];
          var found = false;
          var isSecondary = false;
          var j = 0;

          while (j < scenes.length && !found) {
            if (scenes[j].sceneId === id) {
              found = true;

              if (scenes[j].sceneType !== "PRIMARY") {
                isSecondary = true;
              }
            }

            j++;
          }

          if (found) {
            if (i === firstLine) {
              showingScene = true;
            }

            if (firstScene) {
              firstScene = false;
            } else {
              // add widget element to display a separation between the scenes
              var wElem = document.createElement("div");

              wElem.className = showingSecondaryScene
                ? "firepad-scene-end-secondary"
                : "firepad-scene-end";

              var widget = this.codeMirror.addLineWidget(i, wElem, { above: true });

              this.scenesFilterElements.push({
                type: "widget",
                widget: widget
              });
            }
          }

          if (found && !showingScene) {
            hideMarks.push({
              startLine: hideStart,
              endLine: i
            });

            showingScene = true;
          } else if (!found && showingScene) {
            hideStart = i;
            showingScene = false;
          }

          if (found && isSecondary && !showingSecondaryScene) {
            showingSecondaryScene = true;
          } else if (found && !isSecondary && showingSecondaryScene) {
            showingSecondaryScene = false;
          }
        }

        if (showingScene && showingSecondaryScene) {
          var where = "wrap";
          var clazz = "firepad-secondary-scene";
          var handle = this.codeMirror.addLineClass(i, where, clazz);

          this.scenesFilterElements.push({
            type: "lineClass",
            handle: handle,
            where: where,
            class: clazz
          });
        }
      }

      var endElem = document.createElement("div");

      endElem.className = showingSecondaryScene
        ? "firepad-scene-end-secondary"
        : "firepad-scene-end";

      var widget = this.codeMirror.addLineWidget(lastLine, endElem, {});

      this.scenesFilterElements.push({
        type: "widget",
        widget: widget
      });

      if (!showingScene) {
        hideMarks.push({
          startLine: hideStart,
          endLine: lastLine + 1
        });
      }

      // setup marks to hide the scenes that are not included in the shooting event
      for (var i = 0; i < hideMarks.length; i++) {
        var startLine = hideMarks[i].startLine;
        var endLine = hideMarks[i].endLine;

        if (endLine > hideMarks[i].startLine) {
          endLine--;
        }

        var endCh = this.codeMirror.getLine(endLine).length;

        var mark = this.codeMirror.markText(
          { line: startLine, ch: 0 },
          { line: endLine, ch: endCh },
          { inclusiveLeft: true, inclusiveRight: true, collapsed: true }
        );

        this.scenesFilterElements.push({
          type: "mark",
          mark: mark
        });
      }
    }
  };

  RichTextCodeMirror.prototype.clearScenesFilterElements = function() {
    for (var i = 0; i < this.scenesFilterElements.length; i++) {
      if (this.scenesFilterElements[i].type === "lineClass") {
        this.codeMirror.removeLineClass(
          this.scenesFilterElements[i].handle,
          this.scenesFilterElements[i].where,
          this.scenesFilterElements[i].class
        );
      } else if (this.scenesFilterElements[i].type === "widget") {
        this.scenesFilterElements[i].widget.clear();
      } else if (this.scenesFilterElements[i].type === "mark") {
        this.scenesFilterElements[i].mark.clear();
      }
    }

    this.scenesFilterElements = [];
  };

  RichTextCodeMirror.prototype.getCurrentScene = function() {
    var cm = this.codeMirror;
    var head = cm.getCursor("head");

    if (!head) return null;

    var firstLine = cm.firstLine();
    var lastLine = head.line;

    for (var i = lastLine; i >= firstLine; i--) {
      var lineAttrs = this.getLineAttributes_(i);

      if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
        // line with scene format
        var sceneId = lineAttrs[ATTR.SCENE_ID];
        var sceneCode = lineAttrs[ATTR.SCENE_CODE];
        var isSceneOmitted = lineAttrs[ATTR.SCENE_OMITTED];

        // only return scenes with a code
        if (sceneCode) {
          var lineText = this.codeMirror.getLine(i);
          lineText = removeSentinels(lineText).trim();

          return {
            lineNum: i,
            sceneId: sceneId,
            sceneCode: sceneCode,
            sceneTitle: lineText,
            sceneOmitted: !!isSceneOmitted,
            sceneLocked: !!sceneId
          };
        }
      }
    }

    return null;
  };

  RichTextCodeMirror.prototype.getNextScene = function() {
    var cm = this.codeMirror;
    var head = cm.getCursor("head");
    var scenes = this.getScenes();

    if (!head) return scenes[scenes.length - 1];

    return scenes.find(function(s) {
      return s.lineNum > head.line;
    });
  };

  RichTextCodeMirror.prototype.prepareForNewScene = function() {
    // get line of next scene
    var nextScene = this.getNextScene();
    var line = nextScene ? nextScene.lineNum : this.codeMirror.lastLine();

    // move down next scene
    if (nextScene) {
      var lineStartIndex = this.codeMirror.indexFromPos({ line: line, ch: 0 });
      this.insertText(lineStartIndex, "\n", {});
      this.insertText(lineStartIndex, "\n", {});
    }

    // update cursor
    this.scrollToLine(line);
    this.setLineAttribute(ATTR.LINE_CLASS, "pc-scene");
    this.codeMirror.focus();
  };

  RichTextCodeMirror.prototype.getScenes = function(
    firstLine,
    lastLine,
    onlyLocked
  ) {
    var self = this;

    // loop from fistLine to lastLine looking for scenes
    var firstLine =
      typeof firstLine === "number" ? firstLine : self.codeMirror.firstLine();

    var lastLine =
      typeof lastLine === "number" ? lastLine : self.codeMirror.lastLine();

    var scenes = [];

    for (var i = firstLine; i <= lastLine; i++) {
      var lineAttrs = self.getLineAttributes_(i);

      if (lineAttrs[ATTR.LINE_CLASS] === "pc-scene") {
        // line with scene format
        var sceneId = lineAttrs[ATTR.SCENE_ID];
        var sceneCode = lineAttrs[ATTR.SCENE_CODE];
        var isSceneOmitted = lineAttrs[ATTR.SCENE_OMITTED];

        // only return scenes with a code
        if (sceneCode && (!onlyLocked || (onlyLocked && sceneId))) {
          var lineText = self.codeMirror.getLine(i);
          lineText = removeSentinels(lineText).trim();

          scenes.push({
            lineNum: i,
            sceneId: sceneId,
            sceneCode: sceneCode,
            sceneTitle: lineText,
            sceneOmitted: !!isSceneOmitted,
            sceneLocked: !!sceneId
          });
        }
      }
    }

    return scenes;
  };

  RichTextCodeMirror.prototype.onScenesChange = function(callback) {
    this.onScenesChangeCallback = callback;
  };

  RichTextCodeMirror.prototype.reportScenesStatus = function() {
    var self = this;

    if (self.ready_) {
      self.recodeScenes();

      if (
        self.onScenesChangeCallback &&
        typeof self.onScenesChangeCallback === "function"
      ) {
        var scenes = self.getScenes();
        var serializedScenes = "";

        for (var i = 0; i < scenes.length; i++) {
          serializedScenes += scenes[i].sceneId + "|";
          serializedScenes += scenes[i].sceneCode + "|";
          serializedScenes += scenes[i].sceneTitle + "|";
          serializedScenes += scenes[i].sceneOmitted + "|";
          serializedScenes += scenes[i].sceneLocked + "|";
        }

        if (serializedScenes !== self.serializedScenes) {
          self.serializedScenes = serializedScenes;
          self.onScenesChangeCallback(scenes);
        }
      }
    }

    setTimeout(function() {
      self.reportScenesStatus();
    }, 5000);
  };

  RichTextCodeMirror.prototype.onVisibleThreadsChange = function(callback) {
    this.onVisibleThreadsChangeCallback = callback;
  };

  RichTextCodeMirror.prototype.onCursorActivity_ = function() {
    var self = this;

    setTimeout(function() {
      self.updateCurrentAttributes_();
      self.updateToolbar();

      if (self.onCursorChangeCallback) {
        const lineAttributes = self.getCurrentLineAttributes_();
        const lineClass = lineAttributes[ATTR.LINE_CLASS] || null;

        var attrs = self.getCurrentAttributes_();
        var elementId = null;
        var threadId = null;

        if (self.shootingEvent && self.shootingEvent.id !== "") {
          var elemAttrName = ATTR.ELEMENT + "-" + self.shootingEvent.id;
          elementId = attrs[elemAttrName] || null;
        } else {
          threadId = attrs[ATTR.THREAD] || null;
        }

        var cursorData = {
          elementId: elementId,
          threadId: threadId,
          lineClass: lineClass,
          currentScene: self.getCurrentScene()
        };

        self.onCursorChangeCallback(cursorData);
      }
    }, 1);
  };

  RichTextCodeMirror.prototype.elementMarkerPos = function(elementId) {
    if (this.shootingEvent) {
      var cursorPos = this.codeMirror.getCursor("head");
      var marks = this.codeMirror.findMarksAt(cursorPos);

      var clazz =
        this.options_["cssPrefix"] +
        ATTR.ELEMENT +
        "-" +
        this.shootingEvent.id +
        "-" +
        elementId;

      for (var i = 0; i < marks.length; i++) {
        var className = marks[i].getClassName();

        if (className.indexOf(clazz) >= 0) {
          return marks[i].find();
        }
      }
    }

    return null;
  };

  RichTextCodeMirror.prototype.selectElement = function(elementId) {
    var markerPos = this.elementMarkerPos(elementId);

    if (markerPos) {
      this.codeMirror.setSelection(markerPos.from, markerPos.to);
    }
  };

  RichTextCodeMirror.prototype.selectWord = function() {
    var word = this.codeMirror.findWordAt(this.codeMirror.getCursor());

    if (word) {
      this.codeMirror.setSelection(word.anchor, word.head);
    }
  };

  RichTextCodeMirror.prototype.updateToolbar = function() {
    if (this.options_["mode"] === "screenplay" && this.options_["toolbar"]) {
      var currentLineAttrs = this.getCurrentLineAttributes_();
      var toolbarBtns = document.getElementsByClassName("firepad-btn");

      if (toolbarBtns && toolbarBtns.length > 0) {
        for (var i = 0; i < toolbarBtns.length; i++) {
          toolbarBtns[i].classList.remove("firepad-btn-selected");
          toolbarBtns[i].classList.remove("firepad-btn-selected-auto");
        }

        if (currentLineAttrs && currentLineAttrs[ATTR.LINE_CLASS]) {
          toolbarBtns = document.getElementsByClassName(
            "firepad-tb-" + currentLineAttrs[ATTR.LINE_CLASS]
          );
          if (toolbarBtns && toolbarBtns.length > 0) {
            var clazz = "firepad-btn-selected";

            if (
              currentLineAttrs[ATTR.LINE_CLASS_TYPE] &&
              currentLineAttrs[ATTR.LINE_CLASS_TYPE] === "auto"
            ) {
              clazz = "firepad-btn-selected-auto";
            }

            toolbarBtns[0].parentElement.classList.add(clazz);
          }
        }
      }
    }
  };

  RichTextCodeMirror.prototype.getCurrentAttributes_ = function() {
    if (!this.currentAttributes_) {
      this.updateCurrentAttributes_();
    }
    return this.currentAttributes_;
  };

  RichTextCodeMirror.prototype.updateCurrentAttributes_ = function() {
    var cm = this.codeMirror;
    var anchor = cm.indexFromPos(cm.getCursor("anchor"));
    var head = cm.indexFromPos(cm.getCursor("head"));
    var pos = head;
    if (anchor > head) {
      // backwards selection
      // Advance past any newlines or line sentinels.
      while (pos < this.end()) {
        var c = this.getRange(pos, pos + 1);
        if (c !== "\n" && c !== LineSentinelCharacter) break;
        pos++;
      }
      if (pos < this.end()) pos++; // since we're going to look at the annotation span to the left to decide what attributes to use.
    } else {
      // Back up before any newlines or line sentinels.
      while (pos > 0) {
        c = this.getRange(pos - 1, pos);
        if (c !== "\n" && c !== LineSentinelCharacter) break;
        pos--;
      }
    }
    var spans = this.annotationList_.getAnnotatedSpansForPos(pos);
    this.currentAttributes_ = {};

    var attributes = {};
    // Use the attributes to the left unless they're line attributes (in which case use the ones to the right.
    if (
      spans.length > 0 &&
      !(ATTR.LINE_SENTINEL in spans[0].annotation.attributes)
    ) {
      attributes = spans[0].annotation.attributes;
    } else if (spans.length > 1) {
      firepad.utils.assert(
        !(ATTR.LINE_SENTINEL in spans[1].annotation.attributes),
        "Cursor can't be between two line sentinel characters."
      );
      attributes = spans[1].annotation.attributes;
    }
    for (var attr in attributes) {
      // Don't copy line or entity attributes.
      if (
        attr !== "l" &&
        attr !== "lt" &&
        attr !== "li" &&
        attr.indexOf(ATTR.ENTITY_SENTINEL) !== 0
      ) {
        this.currentAttributes_[attr] = attributes[attr];
      }
    }
  };

  RichTextCodeMirror.prototype.getCurrentLineAttributes_ = function() {
    var cm = this.codeMirror;
    var anchor = cm.getCursor("anchor");
    var head = cm.getCursor("head");
    var line = head.line;
    // If it's a forward selection and the cursor is at the beginning of a line, use the previous line.
    if (head.ch === 0 && anchor.line < head.line) {
      line--;
    }
    return this.getLineAttributes_(line);
  };

  RichTextCodeMirror.prototype.getLineAttributes_ = function(lineNum) {
    var attributes = {};
    var line = this.codeMirror.getLine(lineNum);
    if (line.length > 0 && line[0] === LineSentinelCharacter) {
      var lineStartIndex = this.codeMirror.indexFromPos({
        line: lineNum,
        ch: 0
      });
      var spans = this.annotationList_.getAnnotatedSpansForSpan(
        new Span(lineStartIndex, 1)
      );
      firepad.utils.assert(spans.length === 1);
      for (var attr in spans[0].annotation.attributes) {
        attributes[attr] = spans[0].annotation.attributes[attr];
      }
    }
    return attributes;
  };

  RichTextCodeMirror.prototype.newline = function() {
    var cm = this.codeMirror;
    var self = this;
    if (!this.emptySelection_()) {
      cm.replaceSelection("\n", "end", "+input");
    } else {
      var cursor = cm.getCursor("head");
      var cursorLine = cursor.line;
      var cursorCh = cursor.ch;
      var lineAttributes = this.getLineAttributes_(cursorLine);
      var listType = lineAttributes[ATTR.LIST_TYPE];
      // var isScene = lineAttributes[ATTR.LINE_CLASS] === "pc-scene";
      // var isLockedScene = isScene && lineAttributes[ATTR.SCENE_ID];

      if (listType && cm.getLine(cursorLine).length === 1) {
        // They hit enter on a line with just a list heading.  Just remove the list heading.
        this.updateLineAttributes(cursorLine, cursorLine, function(attributes) {
          delete attributes[ATTR.LIST_TYPE];
          delete attributes[ATTR.LINE_INDENT];
        });
      // } else if (cursorLine === cm.firstLine() && cursorCh <= 1 && isLockedScene) {
      } else if (cursorCh <= 1) {
        // They hit enter on a line start.  Just move the line forward.
        cm.replaceRange(
          "\n",
          { line: cursorLine, ch: 0 },
          { line: cursorLine, ch: 0 },
          "+input"
        );
      } else {
        cm.replaceSelection("\n", "end", "+input");

        // Copy line attributes forward.
        this.updateLineAttributes(cursorLine + 1, cursorLine + 1, function(
          attributes
        ) {
          for (var attr in lineAttributes) {
            if (
              attr !== ATTR.LINE_CLASS &&
              attr !== ATTR.LINE_CLASS_TYPE &&
              attr !== ATTR.SCENE_CODE &&
              attr !== ATTR.SCENE_ID
            ) {
              attributes[attr] = lineAttributes[attr];
            }
          }

          // Don't mark new todo items as completed.
          if (listType === "tc") attributes[ATTR.LIST_TYPE] = "t";
          self.trigger("newLine", { line: cursorLine + 1, attr: attributes });
        });
      }
    }

    setTimeout(function() {
      self.updateCurrentAttributes_();
      self.updateToolbar();
    }, 100);
  };

  RichTextCodeMirror.prototype.deleteLeft = function() {
    var cm = this.codeMirror;
    var cursorPos = cm.getCursor("head");
    var lineAttributes = this.getLineAttributes_(cursorPos.line);
    var listType = lineAttributes[ATTR.LIST_TYPE];
    var indent = lineAttributes[ATTR.LINE_INDENT];

    var backspaceAtStartOfLine = this.emptySelection_() && cursorPos.ch === 1;
    var prevLineText =
      cursorPos.line > cm.firstLine() ? cm.getLine(cursorPos.line - 1) : "";
    var emptyPrevLine =
      cursorPos.line > cm.firstLine() ? this.areLineSentinelCharacters_(prevLineText) : false;

    if (backspaceAtStartOfLine && listType) {
      // They hit backspace at the beginning of a line with a list heading.  Just remove the list heading.
      this.updateLineAttributes(cursorPos.line, cursorPos.line, function(
        attributes
      ) {
        delete attributes[ATTR.LIST_TYPE];
        delete attributes[ATTR.LINE_INDENT];
      });
    } else if (backspaceAtStartOfLine && indent && indent > 0) {
      this.unindent();
    } else if (emptyPrevLine) {
      // Delete the empty line but not the line sentinel character on the next line.
      cm.replaceRange(
        "",
        { line: cursorPos.line - 1, ch: 0 },
        { line: cursorPos.line, ch: 0 },
        "+input"
      );
    } else {
      cm.deleteH(-1, "char");
    }
  };

  RichTextCodeMirror.prototype.deleteRight = function() {
    var cm = this.codeMirror;
    var cursorPos = cm.getCursor("head");

    var text = cm.getLine(cursorPos.line);
    var emptyLine = this.areLineSentinelCharacters_(text);
    var nextLineText =
      cursorPos.line + 1 < cm.lineCount() ? cm.getLine(cursorPos.line + 1) : "";

    if (
      this.emptySelection_() &&
      emptyLine &&
      nextLineText[0] === LineSentinelCharacter
    ) {
      // Delete the empty line but not the line sentinel character on the next line.
      cm.replaceRange(
        "",
        { line: cursorPos.line, ch: 0 },
        { line: cursorPos.line + 1, ch: 0 },
        "+input"
      );

      // HACK: Once we've deleted this line, the cursor will be between the newline on the previous
      // line and the line sentinel character on the next line, which is an invalid position.
      // CodeMirror tends to therefore move it to the end of the previous line, which is undesired.
      // So we explicitly set it to ch: 0 on the current line, which seems to move it after the line
      // sentinel character(s) as desired.
      // (see https://github.com/firebase/firepad/issues/209).
      cm.setCursor({ line: cursorPos.line, ch: 0 });
    } else {
      cm.deleteH(1, "char");
    }
  };

  RichTextCodeMirror.prototype.indent = function() {
    this.updateLineAttributesForSelection(function(attributes) {
      var indent = attributes[ATTR.LINE_INDENT];
      var listType = attributes[ATTR.LIST_TYPE];

      if (indent) {
        attributes[ATTR.LINE_INDENT]++;
      } else if (listType) {
        // lists are implicitly already indented once.
        attributes[ATTR.LINE_INDENT] = 2;
      } else {
        attributes[ATTR.LINE_INDENT] = 1;
      }
    });
  };

  RichTextCodeMirror.prototype.unindent = function() {
    this.updateLineAttributesForSelection(function(attributes) {
      var indent = attributes[ATTR.LINE_INDENT];

      if (indent && indent > 1) {
        attributes[ATTR.LINE_INDENT] = indent - 1;
      } else {
        delete attributes[ATTR.LIST_TYPE];
        delete attributes[ATTR.LINE_INDENT];
      }
    });
  };

  RichTextCodeMirror.prototype.getText = function() {
    return this.codeMirror
      .getValue()
      .replace(new RegExp(LineSentinelCharacter, "g"), "");
  };

  RichTextCodeMirror.prototype.areLineSentinelCharacters_ = function(text) {
    for (var i = 0; i < text.length; i++) {
      if (text[i] !== LineSentinelCharacter) return false;
    }
    return true;
  };

  /**
   * Used for the annotations we store in our AnnotationList.
   * @param attributes
   * @constructor
   */
  function RichTextAnnotation(attributes) {
    this.attributes = attributes || {};
  }

  RichTextAnnotation.prototype.equals = function(other) {
    if (!(other instanceof RichTextAnnotation)) {
      return false;
    }
    var attr;
    for (attr in this.attributes) {
      if (other.attributes[attr] !== this.attributes[attr]) {
        return false;
      }
    }

    for (attr in other.attributes) {
      if (other.attributes[attr] !== this.attributes[attr]) {
        return false;
      }
    }

    return true;
  };

  function getNextSceneCode(code) {
    var codeInt = parseInt(code);

    if (isNaN(codeInt)) {
      var nextCode = "";
      var end = false;
      var i = 0;

      while (i < code.length - 1 && !end) {
        var firstLetter = code.substring(i, i + 1);

        if (firstLetter !== "Z") {
          var nextLetter = String.fromCharCode(1 + firstLetter.charCodeAt(0));
          nextCode += nextLetter;
          end = true;
        } else {
          nextCode += "A";
        }

        i++;
      }

      if (!end) {
        nextCode += "A";
      }

      nextCode += code.substring(i);

      return nextCode;
    }

    return (codeInt + 1).toString();
  }

  function getNextSceneCodeLevel(code) {
    var codeInt = parseInt(code);

    if (isNaN(codeInt)) {
      var nextCode = "";
      var i = 0;

      while (i < code.length - 1) {
        nextCode += "A";
        i++;
      }

      nextCode += "A" + code.substring(i);

      return nextCode;
    }

    return "A" + code;
  }

  function removeSentinels(text) {
    return text.replace(
      new RegExp(
        "[" + LineSentinelCharacter + EntitySentinelCharacter + "]",
        "g"
      ),
      ""
    );
  }

  function cmpPos(a, b) {
    return a.line - b.line || a.ch - b.ch;
  }

  function posEq(a, b) {
    return cmpPos(a, b) === 0;
  }

  function posLe(a, b) {
    return cmpPos(a, b) <= 0;
  }

  function last(arr) {
    return arr[arr.length - 1];
  }

  function sumLengths(strArr) {
    if (strArr.length === 0) {
      return 0;
    }
    var sum = 0;
    for (var i = 0; i < strArr.length; i++) {
      sum += strArr[i].length;
    }
    return sum + strArr.length - 1;
  }

  function emptyAttributes(attributes) {
    for (var attr in attributes) {
      return false;
    }
    return true;
  }

  // Bind a method to an object, so it doesn't matter whether you call
  // object.method() directly or pass object.method as a reference to another
  // function.
  function bind(obj, method) {
    var fn = obj[method];
    obj[method] = function() {
      fn.apply(obj, arguments);
    };
  }

  return RichTextCodeMirror;
})();

var firepad = firepad || {};

// TODO: Can this derive from CodeMirrorAdapter or similar?
firepad.RichTextCodeMirrorAdapter = (function() {
  "use strict";

  var TextOperation = firepad.TextOperation;
  var WrappedOperation = firepad.WrappedOperation;
  var Cursor = firepad.Cursor;

  function RichTextCodeMirrorAdapter(rtcm) {
    this.rtcm = rtcm;
    this.cm = rtcm.codeMirror;

    bind(this, "onChange");
    bind(this, "onAttributesChange");
    bind(this, "onCursorActivity");
    bind(this, "onFocus");
    bind(this, "onBlur");

    this.rtcm.on("change", this.onChange);
    this.rtcm.on("attributesChange", this.onAttributesChange);
    this.cm.on("cursorActivity", this.onCursorActivity);
    this.cm.on("focus", this.onFocus);
    this.cm.on("blur", this.onBlur);
  }

  // Removes all event listeners from the CodeMirror instance.
  RichTextCodeMirrorAdapter.prototype.detach = function() {
    this.rtcm.off("change", this.onChange);
    this.rtcm.off("attributesChange", this.onAttributesChange);

    this.cm.off("cursorActivity", this.onCursorActivity);
    this.cm.off("focus", this.onFocus);
    this.cm.off("blur", this.onBlur);
  };

  function cmpPos(a, b) {
    if (a.line < b.line) {
      return -1;
    }
    if (a.line > b.line) {
      return 1;
    }
    if (a.ch < b.ch) {
      return -1;
    }
    if (a.ch > b.ch) {
      return 1;
    }
    return 0;
  }
  function posEq(a, b) {
    return cmpPos(a, b) === 0;
  }
  function posLe(a, b) {
    return cmpPos(a, b) <= 0;
  }

  function codemirrorLength(cm) {
    var lastLine = cm.lineCount() - 1;
    return cm.indexFromPos({ line: lastLine, ch: cm.getLine(lastLine).length });
  }

  // Converts a CodeMirror change object into a TextOperation and its inverse
  // and returns them as a two-element array.
  RichTextCodeMirrorAdapter.operationFromCodeMirrorChanges = function(
    changes,
    cm
  ) {
    // Approach: Replay the changes, beginning with the most recent one, and
    // construct the operation and its inverse. We have to convert the position
    // in the pre-change coordinate system to an index. We have a method to
    // convert a position in the coordinate system after all changes to an index,
    // namely CodeMirror's `indexFromPos` method. We can use the information of
    // a single change object to convert a post-change coordinate system to a
    // pre-change coordinate system. We can now proceed inductively to get a
    // pre-change coordinate system for all changes in the linked list.
    // A disadvantage of this approach is its complexity `O(n^2)` in the length
    // of the linked list of changes.

    var docEndLength = codemirrorLength(cm);
    var operation = new TextOperation().retain(docEndLength);
    var inverse = new TextOperation().retain(docEndLength);

    for (var i = changes.length - 1; i >= 0; i--) {
      var change = changes[i];
      var fromIndex = change.start;
      var restLength = docEndLength - fromIndex - change.text.length;

      operation = new TextOperation()
        .retain(fromIndex)
        ["delete"](change.removed.length)
        .insert(change.text, change.attributes)
        .retain(restLength)
        .compose(operation);

      inverse = inverse.compose(
        new TextOperation()
          .retain(fromIndex)
          ["delete"](change.text.length)
          .insert(change.removed, change.removedAttributes)
          .retain(restLength)
      );

      docEndLength += change.removed.length - change.text.length;
    }

    return [operation, inverse];
  };

  // Converts an attributes changed object to an operation and its inverse.
  RichTextCodeMirrorAdapter.operationFromAttributesChanges = function(
    changes,
    cm
  ) {
    var docEndLength = codemirrorLength(cm);

    var operation = new TextOperation(),
      inverse = new TextOperation();
    var pos = 0;

    for (var i = 0; i < changes.length; i++) {
      var change = changes[i];
      var toRetain = change.start - pos;
      assert(toRetain >= 0); // changes should be in order and non-overlapping.
      operation.retain(toRetain);
      inverse.retain(toRetain);

      var length = change.end - change.start;
      operation.retain(length, change.attributes);
      inverse.retain(length, change.attributesInverse);
      pos = change.start + length;
    }

    operation.retain(docEndLength - pos);
    inverse.retain(docEndLength - pos);

    return [operation, inverse];
  };

  RichTextCodeMirrorAdapter.prototype.registerCallbacks = function(cb) {
    this.callbacks = cb;
  };

  RichTextCodeMirrorAdapter.prototype.onChange = function(_, changes) {
    if (changes[0].origin !== "RTCMADAPTER") {
      var pair = RichTextCodeMirrorAdapter.operationFromCodeMirrorChanges(
        changes,
        this.cm
      );
      this.trigger("change", pair[0], pair[1]);
    }
  };

  RichTextCodeMirrorAdapter.prototype.onAttributesChange = function(
    _,
    changes
  ) {
    if (changes[0].origin !== "RTCMADAPTER") {
      var pair = RichTextCodeMirrorAdapter.operationFromAttributesChanges(
        changes,
        this.cm
      );
      this.trigger("change", pair[0], pair[1]);
    }
  };

  RichTextCodeMirrorAdapter.prototype.onCursorActivity = function() {
    // We want to push cursor changes to Firebase AFTER edits to the history,
    // because the cursor coordinates will already be in post-change units.
    // Sleeping for 1ms ensures that sendCursor happens after sendOperation.
    var self = this;
    setTimeout(function() {
      self.trigger("cursorActivity");
    }, 1);
  };

  RichTextCodeMirrorAdapter.prototype.onFocus = function() {
    this.trigger("focus");
  };

  RichTextCodeMirrorAdapter.prototype.onBlur = function() {
    if (!this.cm.somethingSelected()) {
      this.trigger("blur");
    }
  };

  RichTextCodeMirrorAdapter.prototype.getValue = function() {
    return this.cm.getValue();
  };

  RichTextCodeMirrorAdapter.prototype.getCursor = function() {
    var cm = this.cm;
    var cursorPos = cm.getCursor();
    var position = cm.indexFromPos(cursorPos);
    var selectionEnd;
    if (cm.somethingSelected()) {
      var startPos = cm.getCursor(true);
      var selectionEndPos = posEq(cursorPos, startPos)
        ? cm.getCursor(false)
        : startPos;
      selectionEnd = cm.indexFromPos(selectionEndPos);
    } else {
      selectionEnd = position;
    }

    return new Cursor(position, selectionEnd);
  };

  RichTextCodeMirrorAdapter.prototype.setCursor = function(cursor) {
    this.cm.setSelection(
      this.cm.posFromIndex(cursor.position),
      this.cm.posFromIndex(cursor.selectionEnd)
    );
  };

  RichTextCodeMirrorAdapter.prototype.addStyleRule = function(css) {
    if (typeof document === "undefined" || document === null) {
      return;
    }
    if (!this.addedStyleRules) {
      this.addedStyleRules = {};
      var styleElement = document.createElement("style");
      document.documentElement
        .getElementsByTagName("head")[0]
        .appendChild(styleElement);
      this.addedStyleSheet = styleElement.sheet;
    }
    if (this.addedStyleRules[css]) {
      return;
    }
    this.addedStyleRules[css] = true;
    return this.addedStyleSheet.insertRule(css, 0);
  };

  RichTextCodeMirrorAdapter.prototype.setOtherCursor = function(
    deviceId,
    cursor,
    color,
    clientId,
    clientName
  ) {
    var cursorPos = this.cm.posFromIndex(cursor.position);
    var end = this.rtcm.end();

    if (typeof color !== "string" || !color.match(/^#[a-fA-F0-9]{3,6}$/)) {
      return;
    }

    if (
      typeof cursor !== "object" ||
      typeof cursor.position !== "number" ||
      typeof cursor.selectionEnd !== "number"
    ) {
      return;
    }

    if (
      cursor.position < 0 ||
      cursor.position > end ||
      cursor.selectionEnd < 0 ||
      cursor.selectionEnd > end
    ) {
      return;
    }

    var marks = [];

    if (cursor.position !== cursor.selectionEnd) {
      // show selection
      var selectionClassName = "selection-" + color.replace("#", "");
      var transparency = 0.4;

      var rule =
        "." +
        selectionClassName +
        " {" +
        // fallback for browsers w/out rgba (rgb w/ transparency)
        " background: " +
        hex2rgb(color) +
        ";\n" +
        // rule with alpha takes precedence if supported
        " background: " +
        hex2rgb(color, transparency) +
        ";" +
        "}";

      this.addStyleRule(rule);

      var fromPos, toPos;
      if (cursor.selectionEnd > cursor.position) {
        fromPos = cursorPos;
        toPos = this.cm.posFromIndex(cursor.selectionEnd);
      } else {
        fromPos = this.cm.posFromIndex(cursor.selectionEnd);
        toPos = cursorPos;
      }

      marks.push(this.cm.markText(fromPos, toPos, {
        className: selectionClassName
      }));
    }

    // show cursor
    var nameNode = document.createElement("div");
    nameNode.style.color = "white";
    nameNode.style.display = "block";
    nameNode.innerHTML = '<span style="position: absolute; background-color: ' + color + '; top: -18px; left: -2px; padding: 0 4px; font-size: .9rem; white-space: nowrap;">' + clientName + '</span>';

    var cursorEl = document.createElement("span");
    cursorEl.className = "other-client";
    cursorEl.style.width = "2px";
    cursorEl.style.backgroundColor = color;
    cursorEl.style.marginLeft = cursorEl.style.marginRight = "-1px";
    cursorEl.style.height = "20px";
    cursorEl.setAttribute("data-clientid", clientId);
    cursorEl.style.zIndex = 0;
    cursorEl.style.position = "absolute";
    cursorEl.innerHTML = '<div style="position: absolute; height: 20px; top: -4px; margin-left: -2px;"><div style="width: 6px; height: 6px; background:' + color + ' "></div></div>';

    cursorEl.appendChild(nameNode);

    var mouseOver = false;

    var setupHideTimeout = function() {
      setTimeout(function() {
        if (!mouseOver) {
          nameNode.style.display = "none";
        }
      }, 2000);
    };

    cursorEl.addEventListener("mouseover", function() {
      if (cursorEl.parentNode) {
        mouseOver = true;
        nameNode.style.display = "block";
      }
    });

    cursorEl.addEventListener("mouseout", function() {
      mouseOver = false;
      setupHideTimeout();
    });

    marks.push(this.cm.setBookmark(cursorPos, {
      widget: cursorEl,
      insertLeft: true
    }));

    setupHideTimeout();

    return marks;
  };

  RichTextCodeMirrorAdapter.prototype.trigger = function(event) {
    var args = Array.prototype.slice.call(arguments, 1);
    var action = this.callbacks && this.callbacks[event];
    if (action) {
      action.apply(this, args);
    }
  };

  // Apply an operation to a CodeMirror instance.
  RichTextCodeMirrorAdapter.prototype.applyOperation = function(operation) {
    // HACK: If there are a lot of operations; hide CodeMirror so that it doesn't re-render constantly.
    if (operation.ops.length > 10) {
      this.rtcm.codeMirror
        .getWrapperElement()
        .setAttribute("style", "display: none");
    }

    var ops = operation.ops;
    var index = 0; // holds the current index into CodeMirror's content

    for (var i = 0, l = ops.length; i < l; i++) {
      var op = ops[i];
      if (op.isRetain()) {
        if (!emptyAttributes(op.attributes)) {
          this.rtcm.updateTextAttributes(
            index,
            index + op.chars,
            function(attributes) {
              for (var attr in op.attributes) {
                if (op.attributes[attr] === false) {
                  delete attributes[attr];
                } else {
                  attributes[attr] = op.attributes[attr];
                }
              }
            },
            "RTCMADAPTER",
            /*doLineAttributes=*/ true
          );
        }
        index += op.chars;
      } else if (op.isInsert()) {
        this.rtcm.insertText(index, op.text, op.attributes, "RTCMADAPTER");
        index += op.text.length;
      } else if (op.isDelete()) {
        this.rtcm.removeText(index, index + op.chars, "RTCMADAPTER");
      }
    }

    if (operation.ops.length > 10) {
      this.rtcm.codeMirror.getWrapperElement().setAttribute("style", "");
      this.rtcm.codeMirror.refresh();
    }
  };

  RichTextCodeMirrorAdapter.prototype.registerUndo = function(undoFn) {
    this.cm.undo = undoFn;
  };

  RichTextCodeMirrorAdapter.prototype.registerRedo = function(redoFn) {
    this.cm.redo = redoFn;
  };

  RichTextCodeMirrorAdapter.prototype.invertOperation = function(operation) {
    var pos = 0,
      cm = this.rtcm.codeMirror,
      spans,
      i;
    var inverse = new TextOperation();
    for (var opIndex = 0; opIndex < operation.wrapped.ops.length; opIndex++) {
      var op = operation.wrapped.ops[opIndex];
      if (op.isRetain()) {
        if (emptyAttributes(op.attributes)) {
          inverse.retain(op.chars);
          pos += op.chars;
        } else {
          spans = this.rtcm.getAttributeSpans(pos, pos + op.chars);
          for (i = 0; i < spans.length; i++) {
            var inverseAttributes = {};
            for (var attr in op.attributes) {
              var opValue = op.attributes[attr];
              var curValue = spans[i].attributes[attr];

              if (opValue === false) {
                if (curValue) {
                  inverseAttributes[attr] = curValue;
                }
              } else if (opValue !== curValue) {
                inverseAttributes[attr] = curValue || false;
              }
            }

            inverse.retain(spans[i].length, inverseAttributes);
            pos += spans[i].length;
          }
        }
      } else if (op.isInsert()) {
        inverse["delete"](op.text.length);
      } else if (op.isDelete()) {
        var text = cm.getRange(
          cm.posFromIndex(pos),
          cm.posFromIndex(pos + op.chars)
        );

        spans = this.rtcm.getAttributeSpans(pos, pos + op.chars);
        var delTextPos = 0;
        for (i = 0; i < spans.length; i++) {
          inverse.insert(
            text.substr(delTextPos, spans[i].length),
            spans[i].attributes
          );
          delTextPos += spans[i].length;
        }

        pos += op.chars;
      }
    }

    return new WrappedOperation(inverse, operation.meta.invert());
  };

  // Throws an error if the first argument is falsy. Useful for debugging.
  function assert(b, msg) {
    if (!b) {
      throw new Error(msg || "assertion error");
    }
  }

  // Bind a method to an object, so it doesn't matter whether you call
  // object.method() directly or pass object.method as a reference to another
  // function.
  function bind(obj, method) {
    var fn = obj[method];
    obj[method] = function() {
      fn.apply(obj, arguments);
    };
  }

  function emptyAttributes(attrs) {
    for (var attr in attrs) {
      return false;
    }
    return true;
  }

  function hex2rgb(hex, transparency) {
    if (typeof hex !== "string") {
      throw new TypeError("Expected a string");
    }
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    var num = parseInt(hex, 16);
    var rgb = [num >> 16, (num >> 8) & 255, num & 255];
    var type = "rgb";
    if (exists(transparency)) {
      type = "rgba";
      rgb.push(transparency);
    }
    // rgb(r, g, b) or rgba(r, g, b, t)
    return type + "(" + rgb.join(",") + ")";
  }

  function exists(val) {
    return val !== null && val !== undefined;
  }

  return RichTextCodeMirrorAdapter;
})();

var firepad = firepad || {};

/**
 * Immutable object to represent text formatting.  Formatting can be modified by chaining method calls.
 *
 * @constructor
 * @type {Function}
 */
firepad.Formatting = (function() {
  var ATTR = firepad.AttributeConstants;

  function Formatting(attributes) {
    // Allow calling without new.
    if (!(this instanceof Formatting)) {
      return new Formatting(attributes);
    }

    this.attributes = attributes || {};
  }

  Formatting.prototype.cloneWithNewAttribute_ = function(attribute, value) {
    var attributes = {};

    // Copy existing.
    for (var attr in this.attributes) {
      attributes[attr] = this.attributes[attr];
    }

    // Add new one.
    if (value === false) {
      delete attributes[attribute];
    } else {
      attributes[attribute] = value;
    }

    return new Formatting(attributes);
  };

  Formatting.prototype.bold = function(val) {
    return this.cloneWithNewAttribute_(ATTR.BOLD, val);
  };

  Formatting.prototype.italic = function(val) {
    return this.cloneWithNewAttribute_(ATTR.ITALIC, val);
  };

  Formatting.prototype.underline = function(val) {
    return this.cloneWithNewAttribute_(ATTR.UNDERLINE, val);
  };

  Formatting.prototype.strike = function(val) {
    return this.cloneWithNewAttribute_(ATTR.STRIKE, val);
  };

  Formatting.prototype.font = function(font) {
    return this.cloneWithNewAttribute_(ATTR.FONT, font);
  };

  Formatting.prototype.fontSize = function(size) {
    return this.cloneWithNewAttribute_(ATTR.FONT_SIZE, size);
  };

  Formatting.prototype.color = function(color) {
    return this.cloneWithNewAttribute_(ATTR.COLOR, color);
  };

  Formatting.prototype.backgroundColor = function(color) {
    return this.cloneWithNewAttribute_(ATTR.BACKGROUND_COLOR, color);
  };

  return Formatting;
})();

var firepad = firepad || {};

/**
 * Object to represent Formatted text.
 *
 * @type {Function}
 */
firepad.Text = (function() {
  function Text(text, formatting) {
    // Allow calling without new.
    if (!(this instanceof Text)) {
      return new Text(text, formatting);
    }

    this.text = text;
    this.formatting = formatting || firepad.Formatting();
  }

  return Text;
})();

var firepad = firepad || {};

/**
 * Immutable object to represent line formatting.  Formatting can be modified by chaining method calls.
 *
 * @constructor
 * @type {Function}
 */
firepad.LineFormatting = (function() {
  var ATTR = firepad.AttributeConstants;

  function LineFormatting(attributes) {
    // Allow calling without new.
    if (!(this instanceof LineFormatting)) {
      return new LineFormatting(attributes);
    }

    this.attributes = attributes || {};
    this.attributes[ATTR.LINE_SENTINEL] = true;
  }

  LineFormatting.LIST_TYPE = {
    NONE: false,
    ORDERED: "o",
    UNORDERED: "u",
    TODO: "t",
    TODOCHECKED: "tc"
  };

  LineFormatting.prototype.cloneWithNewAttribute_ = function(attribute, value) {
    var attributes = {};

    // Copy existing.
    for (var attr in this.attributes) {
      attributes[attr] = this.attributes[attr];
    }

    // Add new one.
    if (value === false) {
      delete attributes[attribute];
    } else {
      attributes[attribute] = value;
    }

    return new LineFormatting(attributes);
  };

  LineFormatting.prototype.indent = function(indent) {
    return this.cloneWithNewAttribute_(ATTR.LINE_INDENT, indent);
  };

  LineFormatting.prototype.align = function(align) {
    return this.cloneWithNewAttribute_(ATTR.LINE_ALIGN, align);
  };

  LineFormatting.prototype.setClass = function(val) {
    return this.cloneWithNewAttribute_(ATTR.LINE_CLASS, val);
  };

  LineFormatting.prototype.setClassType = function(val) {
    return this.cloneWithNewAttribute_(ATTR.LINE_CLASS_TYPE, val);
  };

  LineFormatting.prototype.listItem = function(val) {
    firepad.utils.assert(
      val === false || val === "u" || val === "o" || val === "t" || val === "tc"
    );
    return this.cloneWithNewAttribute_(ATTR.LIST_TYPE, val);
  };

  LineFormatting.prototype.getIndent = function() {
    return this.attributes[ATTR.LINE_INDENT] || 0;
  };

  LineFormatting.prototype.getAlign = function() {
    return this.attributes[ATTR.LINE_ALIGN] || 0;
  };

  LineFormatting.prototype.getClass = function() {
    return this.attributes[ATTR.LINE_CLASS] || "";
  };

  LineFormatting.prototype.getClassType = function() {
    return this.attributes[ATTR.LINE_CLASS_TYPE] || "";
  };

  LineFormatting.prototype.getListItem = function() {
    return this.attributes[ATTR.LIST_TYPE] || false;
  };

  return LineFormatting;
})();

var firepad = firepad || {};

/**
 * Object to represent Formatted line.
 *
 * @type {Function}
 */
firepad.Line = (function() {
  function Line(textPieces, formatting) {
    // Allow calling without new.
    if (!(this instanceof Line)) {
      return new Line(textPieces, formatting);
    }

    if (Object.prototype.toString.call(textPieces) !== "[object Array]") {
      if (typeof textPieces === "undefined") {
        textPieces = [];
      } else {
        textPieces = [textPieces];
      }
    }

    this.textPieces = textPieces;
    this.formatting = formatting || firepad.LineFormatting();
  }

  return Line;
})();

var firepad = firepad || {};

/**
 * Helper to parse html into Firepad-compatible lines / text.
 * @type {*}
 */
firepad.ParseHtml = (function() {
  var LIST_TYPE = firepad.LineFormatting.LIST_TYPE;

  /**
   * Represents the current parse state as an immutable structure.  To create a new ParseState, use
   * the withXXX methods.
   *
   * @param opt_listType
   * @param opt_lineFormatting
   * @param opt_textFormatting
   * @constructor
   */
  function ParseState(opt_listType, opt_lineFormatting, opt_textFormatting) {
    this.listType = opt_listType || LIST_TYPE.UNORDERED;
    this.lineFormatting = opt_lineFormatting || firepad.LineFormatting();
    this.textFormatting = opt_textFormatting || firepad.Formatting();
  }

  ParseState.prototype.withTextFormatting = function(textFormatting) {
    return new ParseState(this.listType, this.lineFormatting, textFormatting);
  };

  ParseState.prototype.withLineFormatting = function(lineFormatting) {
    return new ParseState(this.listType, lineFormatting, this.textFormatting);
  };

  ParseState.prototype.withListType = function(listType) {
    return new ParseState(listType, this.lineFormatting, this.textFormatting);
  };

  ParseState.prototype.withIncreasedIndent = function() {
    var lineFormatting = this.lineFormatting.indent(
      this.lineFormatting.getIndent() + 1
    );
    return new ParseState(this.listType, lineFormatting, this.textFormatting);
  };

  ParseState.prototype.withAlign = function(align) {
    var lineFormatting = this.lineFormatting.align(align);
    return new ParseState(this.listType, lineFormatting, this.textFormatting);
  };

  /**
   * Mutable structure representing the current parse output.
   * @constructor
   */
  function ParseOutput() {
    this.lines = [];
    this.currentLine = [];
    this.currentLineListItemType = null;
  }

  ParseOutput.prototype.newlineIfNonEmpty = function(state) {
    this.cleanLine_();
    if (this.currentLine.length > 0) {
      this.newline(state);
    }
  };

  ParseOutput.prototype.newlineIfNonEmptyOrListItem = function(state) {
    this.cleanLine_();
    if (this.currentLine.length > 0 || this.currentLineListItemType !== null) {
      this.newline(state);
    }
  };

  ParseOutput.prototype.newline = function(state) {
    this.cleanLine_();
    var lineFormatting = state.lineFormatting;
    if (this.currentLineListItemType !== null) {
      lineFormatting = lineFormatting.listItem(this.currentLineListItemType);
      this.currentLineListItemType = null;
    }

    this.lines.push(firepad.Line(this.currentLine, lineFormatting));
    this.currentLine = [];
  };

  ParseOutput.prototype.makeListItem = function(type) {
    this.currentLineListItemType = type;
  };

  ParseOutput.prototype.cleanLine_ = function() {
    // Kinda' a hack, but we remove leading and trailing spaces (since these aren't significant in html) and
    // replaces nbsp's with normal spaces.
    if (this.currentLine.length > 0) {
      var last = this.currentLine.length - 1;
      this.currentLine[0].text = this.currentLine[0].text.replace(/^ +/, "");
      this.currentLine[last].text = this.currentLine[last].text.replace(
        / +$/g,
        ""
      );
      for (var i = 0; i < this.currentLine.length; i++) {
        this.currentLine[i].text = this.currentLine[i].text.replace(
          /\u00a0/g,
          " "
        );
      }
    }
    // If after stripping trailing whitespace, there's nothing left, clear currentLine out.
    if (this.currentLine.length === 1 && this.currentLine[0].text === "") {
      this.currentLine = [];
    }
  };

  var entityManager_;
  function parseHtml(html, entityManager) {
    // Create DIV with HTML (as a convenient way to parse it).
    var div = (firepad.document || document).createElement("div");
    div.innerHTML = html;

    // HACK until I refactor this.
    entityManager_ = entityManager;

    var output = new ParseOutput();
    var state = new ParseState();
    parseNode(div, state, output);

    return output.lines;
  }

  // Fix IE8.
  var Node = Node || {
    ELEMENT_NODE: 1,
    TEXT_NODE: 3
  };

  function parseNode(node, state, output) {
    // Give entity manager first crack at it.
    if (node.nodeType === Node.ELEMENT_NODE) {
      var entity = entityManager_.fromElement(node);
      if (entity) {
        output.currentLine.push(
          new firepad.Text(
            firepad.sentinelConstants.ENTITY_SENTINEL_CHARACTER,
            new firepad.Formatting(entity.toAttributes())
          )
        );
        return;
      }
    }

    switch (node.nodeType) {
      case Node.TEXT_NODE:
        // This probably isn't exactly right, but mostly works...
        var text = node.nodeValue.replace(/[ \n\t]+/g, " ");
        output.currentLine.push(firepad.Text(text, state.textFormatting));
        break;
      case Node.ELEMENT_NODE:
        var style = node.getAttribute("style") || "";
        state = parseStyle(state, style);

        var clazz = node.getAttribute("class") || "";
        if (clazz) {
          state.lineFormatting.setClass(clazz);
        }

        var clazzType = node.getAttribute("class-type") || "";
        if (clazzType) {
          state.lineFormatting.setClassType(clazzType);
        }

        switch (node.nodeName.toLowerCase()) {
          case "div":
          case "h1":
          case "h2":
          case "h3":
          case "p":
            output.newlineIfNonEmpty(state);
            parseChildren(node, state, output);
            output.newlineIfNonEmpty(state);
            break;
          case "center":
            state = state.withAlign("center");
            output.newlineIfNonEmpty(state);
            parseChildren(node, state.withAlign("center"), output);
            output.newlineIfNonEmpty(state);
            break;
          case "b":
          case "strong":
            parseChildren(
              node,
              state.withTextFormatting(state.textFormatting.bold(true)),
              output
            );
            break;
          case "u":
            parseChildren(
              node,
              state.withTextFormatting(state.textFormatting.underline(true)),
              output
            );
            break;
          case "i":
          case "em":
            parseChildren(
              node,
              state.withTextFormatting(state.textFormatting.italic(true)),
              output
            );
            break;
          case "s":
            parseChildren(
              node,
              state.withTextFormatting(state.textFormatting.strike(true)),
              output
            );
            break;
          case "font":
            var face = node.getAttribute("face");
            var color = node.getAttribute("color");
            var size = parseInt(node.getAttribute("size"));
            if (face) {
              state = state.withTextFormatting(state.textFormatting.font(face));
            }
            if (color) {
              state = state.withTextFormatting(
                state.textFormatting.color(color)
              );
            }
            if (size) {
              state = state.withTextFormatting(
                state.textFormatting.fontSize(size)
              );
            }
            parseChildren(node, state, output);
            break;
          case "br":
            output.newline(state);
            break;
          case "ul":
            output.newlineIfNonEmptyOrListItem(state);
            var listType =
              node.getAttribute("class") === "firepad-todo"
                ? LIST_TYPE.TODO
                : LIST_TYPE.UNORDERED;
            parseChildren(
              node,
              state.withListType(listType).withIncreasedIndent(),
              output
            );
            output.newlineIfNonEmpty(state);
            break;
          case "ol":
            output.newlineIfNonEmptyOrListItem(state);
            parseChildren(
              node,
              state.withListType(LIST_TYPE.ORDERED).withIncreasedIndent(),
              output
            );
            output.newlineIfNonEmpty(state);
            break;
          case "li":
            parseListItem(node, state, output);
            break;
          case "style": // ignore.
            break;
          default:
            parseChildren(node, state, output);
            break;
        }
        break;
      default:
        // Ignore other nodes (comments, etc.)
        break;
    }
  }

  function parseChildren(node, state, output) {
    if (node.hasChildNodes()) {
      for (var i = 0; i < node.childNodes.length; i++) {
        parseNode(node.childNodes[i], state, output);
      }
    }
  }

  function parseListItem(node, state, output) {
    // Note: <li> is weird:
    // * Only the first line in the <li> tag should be a list item (i.e. with a bullet or number next to it).
    // * <li></li> should create an empty list item line; <li><ol><li></li></ol></li> should create two.

    output.newlineIfNonEmptyOrListItem(state);

    var listType =
      node.getAttribute("class") === "firepad-checked"
        ? LIST_TYPE.TODOCHECKED
        : state.listType;
    output.makeListItem(listType);
    var oldLine = output.currentLine;

    parseChildren(node, state, output);

    if (oldLine === output.currentLine || output.currentLine.length > 0) {
      output.newline(state);
    }
  }

  function parseStyle(state, styleString) {
    var textFormatting = state.textFormatting;
    var lineFormatting = state.lineFormatting;
    var styles = styleString.split(";");
    for (var i = 0; i < styles.length; i++) {
      var stylePieces = styles[i].split(":");
      if (stylePieces.length !== 2) continue;
      var prop = firepad.utils.trim(stylePieces[0]).toLowerCase();
      var val = firepad.utils.trim(stylePieces[1]).toLowerCase();
      switch (prop) {
        case "text-decoration":
          var underline = val.indexOf("underline") >= 0;
          var strike = val.indexOf("line-through") >= 0;
          textFormatting = textFormatting.underline(underline).strike(strike);
          break;
        case "font-weight":
          var bold = val === "bold" || parseInt(val) >= 600;
          textFormatting = textFormatting.bold(bold);
          break;
        case "font-style":
          var italic = val === "italic" || val === "oblique";
          textFormatting = textFormatting.italic(italic);
          break;
        case "color":
          textFormatting = textFormatting.color(val);
          break;
        case "background-color":
          textFormatting = textFormatting.backgroundColor(val);
          break;
        case "text-align":
          lineFormatting = lineFormatting.align(val);
          break;
        case "font-size":
          var size = null;
          var allowedValues = [
            "px",
            "pt",
            "%",
            "em",
            "xx-small",
            "x-small",
            "small",
            "medium",
            "large",
            "x-large",
            "xx-large",
            "smaller",
            "larger"
          ];
          if (firepad.utils.stringEndsWith(val, allowedValues)) {
            size = val;
          } else if (parseInt(val)) {
            size = parseInt(val) + "px";
          }
          if (size) {
            textFormatting = textFormatting.fontSize(size);
          }
          break;
        case "font-family":
          var font = firepad.utils.trim(val.split(",")[0]); // get first font.
          font = font.replace(/['"]/g, ""); // remove quotes.
          font = font.replace(/\w\S*/g, function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
          });
          textFormatting = textFormatting.font(font);
          break;
      }
    }
    return state
      .withLineFormatting(lineFormatting)
      .withTextFormatting(textFormatting);
  }

  return parseHtml;
})();

var firepad = firepad || {};
/**
 * Helper to turn Firebase contents into HMTL.
 * Takes a doc and an entity manager
 */
firepad.SerializeHtml = (function() {
  var utils = firepad.utils;
  var ATTR = firepad.AttributeConstants;
  var LIST_TYPE = firepad.LineFormatting.LIST_TYPE;
  var TODO_STYLE =
    '<style>ul.firepad-todo { list-style: none; margin-left: 0; padding-left: 0; } ul.firepad-todo > li { padding-left: 1em; text-indent: -1em; } ul.firepad-todo > li:before { content: "\\2610"; padding-right: 5px; } ul.firepad-todo > li.firepad-checked:before { content: "\\2611"; padding-right: 5px; }</style>\n';

  var SCREENPLAY_STYLE = '<style> @page { size: A4; margin-top: 1in; margin-right: 1in; margin-bottom: 1in; margin-left: 1.5in; } @media print { * { font-size: 12pt !important; } .CodeMirror { width: 8.3in; } } .CodeMirror:after { font-family: monospace; } .b { font-weight: bold; } .i { font-style: italic; } .u { text-decoration: underline; } .s { text-decoration: line-through; } .u.s { text-decoration: underline line-through; } .f-arial { font-family: Arial, Helvetica, sans-serif; } .left { text-align: left; } .center { text-align: center; } .right { text-align: right; }  .pc-scene { text-align: left; text-transform: uppercase; font-weight: bold; } .pc-action { text-align: left; padding: 12pt 0 !important; } .pc-character { padding-left: 2.5in !important; padding-right: 0 !important; text-transform: uppercase; } .pc-dialogue { margin-left: 1.5in !important; width: 3.5in !important; } .pc-parenthetical { padding-left: 2in !important; padding-right: 1.5in !important; } .pc-transition { text-align: right; text-transform: uppercase; } .-pc-act-start { text-align: center; text-transform: uppercase; text-decoration: underline; } .-pc-act-end { text-align: center; text-transform: uppercase; text-decoration: underline; } .-pc-centered { text-align: center; } pre.o, pre.u, pre.t, pre.tc { padding-left: 40px; } .list-left { display: inline-block; margin-left: -40px; width: 40px; padding-right: 5px; text-align: right; } .todo-left { display: inline-block; margin-left: -20px; width: 20px; } .btn-group { margin: 5px 7px 0 0; display: inline-block; } a.btn, a.btn:visited, a.btn:active { font-family: "Arial" sans-serif; cursor: pointer; text-decoration: none; padding: 6px 6px 4px 6px; text-align: center; vertical-align: middle; font-size: 14px; background-color: #fcfcfc; border: 1px solid #c9c9c9; color: grey; } a.btn:hover, a.btn-selected { color: #fff; background-color: dimgrey; text-decoration: none; } a.btn-selected-auto { color: #fff; background-color: dimgrey; text-decoration: none; opacity: 0.5; } a.btn:active { -webkit-box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.05); -moz-box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.05); box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.05); } .btn-group > .btn { -webkit-border-radius: 0; -moz-border-radius: 0; border-radius: 0; margin-left: -1px; } .btn-group > .btn:first-child { border-bottom-left-radius: 6px; border-top-left-radius: 6px; -webkit-border-bottom-left-radius: 6px; -webkit-border-top-left-radius: 6px; -moz-border-radius-bottomleft: 6px; -moz-border-radius-topleft: 6px; margin-left: 0px; } .btn-group > .btn:last-child { border-bottom-right-radius: 6px; border-top-right-radius: 6px; -webkit-border-bottom-right-radius: 6px; -webkit-border-top-right-radius: 6px; -moz-border-radius-bottomright: 6px; -moz-border-radius-topright: 6px; } .dropdown { position: relative; } .dropdown-menu { position: absolute; top: 100%; left: 0; z-index: 1000; display: none; float: left; padding: 4px 0; margin: 4px 0 0; list-style: none; background-color: #ffffff; border: 1px solid #ccc; border: 1px solid rgba(0, 0, 0, 0.2); *border-right-width: 2px; *border-bottom-width: 2px; -webkit-border-radius: 5px; -moz-border-radius: 5px; border-radius: 5px; -webkit-box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2); -moz-box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2); box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2); -webkit-background-clip: padding-box; -moz-background-clip: padding; background-clip: padding-box; } .dropdown-menu a { text-align: left; display: block; padding: 3px 15px; clear: both; font-weight: normal; line-height: 18px; color: #333333; white-space: nowrap; } .dropdown-menu a:hover { color: #fff; text-decoration: none; background-color: #ffbf86; } .color-dropdown-item { height: 25px; width: 25px; } .dialog { position: absolute; left: 0px; top: 0px; width: 100%; height: 100%; z-index: 1000; } .dialog-div { position: relative; width: 400px; height: 100px; margin: 100px auto; background-color: #fff; border: 1px solid #000; padding: 15px; } .dialog-input { width: 80%; display: block; padding: 5px 5px; margin: 10px 10px 10px 5px; clear: both; font-weight: normal; line-height: 25px; color: #333333; white-space: nowrap; } @font-face { font-family: "firepad"; src: url("firepad.woff"); } .bold, .italic, .underline, .strikethrough, .list, .list-2, .numbered-list, .paragraph-left, .paragraph-center, .paragraph-right, .paragraph-justify, .menu, .link, .undo, .redo, .box-add, .box-remove, .print, .indent-decrease, .indent-increase, .insert-image, .bubble { font-family: "firepad"; speak: none; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; -webkit-font-smoothing: antialiased; } .bold:before { content: "\e000"; } .italic:before { content: "\e001"; } .underline:before { content: "\e002"; } .strikethrough:before { content: "\e003"; } .list:before { content: "\e004"; } .list-2:before { content: "\e005"; } .numbered-list:before { content: "\e006"; } .paragraph-left:before { content: "\e007"; } .paragraph-center:before { content: "\e008"; } .paragraph-right:before { content: "\e009"; } .paragraph-justify:before { content: "\e00a"; } .menu:before { content: "\e00b"; } .link:before { content: "\e00c"; } .undo:before { content: "\e00d"; } .redo:before { content: "\e00e"; } .box-add:before { content: "\e010"; } .box-remove:before { content: "\e011"; } .print:before { content: "\e012"; } .indent-decrease:before { content: "\e013"; } .indent-increase:before { content: "\e014"; } .insert-image:before { content: "\e015"; } .bubble:before { content: "\e00f"; } .scene, .action, .character, .dialogue, .parenthetical, .transition, .act-start, .act-end, .centered, .auto-format { font-family: "firepad"; speak: none; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; -webkit-font-smoothing: antialiased; } .scene:before { content: "Scene"; font-family: monospace; } .action:before { content: "Action"; font-family: monospace; } .character:before { content: "Character"; font-family: monospace; } .dialogue:before { content: "Dialogue"; font-family: monospace; } .parenthetical:before { content: "Parenthetical"; font-family: monospace; } .transition:before { content: "Transition"; font-family: monospace; } .act-start:before { content: "Act Start"; font-family: monospace; } .act-end:before { content: "Act End"; font-family: monospace; } .centered:before { content: "\e008"; } .pc-auto-format:before { content: "Auto Format"; font-family: monospace; } .scene-start { height: 25px; border-top: 1px solid lightgrey; } .scene-end { height: 15px; } .scene-end-with-border { height: 15px; border-bottom: 1px solid lightgrey; } .secondary-scene { background-color: #f3f3f3; color: #4c4c4c; } </style>\n'

  function open(listType) {
    return listType === LIST_TYPE.ORDERED
      ? "<ol>"
      : listType === LIST_TYPE.UNORDERED ? "<ul>" : '<ul class="firepad-todo">';
  }

  function close(listType) {
    return listType === LIST_TYPE.ORDERED ? "</ol>" : "</ul>";
  }

  function compatibleListType(l1, l2) {
    return (
      l1 === l2 ||
      (l1 === LIST_TYPE.TODO && l2 === LIST_TYPE.TODOCHECKED) ||
      (l1 === LIST_TYPE.TODOCHECKED && l2 === LIST_TYPE.TODO)
    );
  }

  function textToHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\u00a0/g, "&nbsp;");
  }

  function serializeHtml(doc, entityManager) {
    var html = "";
    var newLine = true;
    var listTypeStack = [];
    var inListItem = false;
    var firstLine = true;
    var emptyLine = true;
    var i = 0;
    var op = doc.ops[i];
    var line = 0;
    var usesTodo = false;

    while (op) {
      utils.assert(op.isInsert());
      var attrs = op.attributes;

      if (newLine) {
        newLine = false;

        var indent = 0,
          listType = null,
          lineAlign = "left",
          lineClass = "",
          lineClassType = "",
          lineSceneCode = "",
          lineSceneId = "";

        if (ATTR.LINE_SENTINEL in attrs) {
          indent = attrs[ATTR.LINE_INDENT] || 0;
          listType = attrs[ATTR.LIST_TYPE] || null;
          lineAlign = attrs[ATTR.LINE_ALIGN] || "left";
          lineClass = attrs[ATTR.LINE_CLASS] || "";
          lineClassType = attrs[ATTR.LINE_CLASS_TYPE] || "";
          lineSceneCode = attrs[ATTR.SCENE_CODE] || "";
          lineSceneId = attrs[ATTR.SCENE_ID] || "";
        }
        if (listType) {
          indent = indent || 1; // lists are automatically indented at least 1.
        }

        if (inListItem) {
          html += "</li>";
          inListItem = false;
        } else if (!firstLine) {
          if (emptyLine) {
            html += "<br/>";
          }
          html += "</div>";
        }
        firstLine = false;

        // Close any extra lists.
        utils.assert(indent >= 0, "Indent must not be negative.");
        while (
          listTypeStack.length > indent ||
          (indent === listTypeStack.length &&
            listType !== null &&
            !compatibleListType(
              listType,
              listTypeStack[listTypeStack.length - 1]
            ))
        ) {
          html += close(listTypeStack.pop());
        }

        // Open any needed lists.
        while (listTypeStack.length < indent) {
          var toOpen = listType || LIST_TYPE.UNORDERED; // default to unordered lists for indenting non-list-item lines.
          usesTodo =
            listType == LIST_TYPE.TODO ||
            listType == LIST_TYPE.TODOCHECKED ||
            usesTodo;
          html += open(toOpen);
          listTypeStack.push(toOpen);
        }

        var style =
          lineAlign !== "left" ? ' style="text-align:' + lineAlign + '"' : "";
        var clazz = "";

        if (listType) {
          switch (listType) {
            case LIST_TYPE.TODOCHECKED:
              clazz = ' class="firepad-checked"';
              break;
            case LIST_TYPE.TODO:
              clazz = ' class="firepad-unchecked"';
              break;
          }
          html += "<li" + clazz + style + ">";
          inListItem = true;
        } else {
          // start line div.
          clazz = lineClass ? ' class="' + lineClass + '"' : "";

          var clazzType = lineClassType
            ? ' class-type="' + lineClassType + '"'
            : "";

          var sceneCode = lineSceneCode
            ? "<span class='scene-code-print' >" + lineSceneCode + "</span>"
            : "";

          var sceneId = lineSceneId ? ' scene-id="' + lineSceneId + '"' : "";
          html +=
          "<div" + clazz + clazzType + sceneId + style + ">" + sceneCode;
        }
        emptyLine = true;
      }

      if (ATTR.LINE_SENTINEL in attrs) {
        op = doc.ops[++i];
        continue;
      }

      if (ATTR.ENTITY_SENTINEL in attrs) {
        for (var j = 0; j < op.text.length; j++) {
          var entity = firepad.Entity.fromAttributes(attrs);
          var element = entityManager.exportToElement(entity);
          html += element.outerHTML;
        }

        op = doc.ops[++i];
        continue;
      }

      var prefix = "", suffix = "";

      for (var attr in attrs) {
        var value = attrs[attr];
        var start, end;
        if (
          attr === ATTR.BOLD ||
          attr === ATTR.ITALIC ||
          attr === ATTR.UNDERLINE ||
          attr === ATTR.STRIKE
        ) {
          utils.assert(value === true);
          start = end = attr;
        } else if (attr === ATTR.FONT_SIZE) {
          start = 'span style="font-size: ' + value;
          start +=
            typeof value !== "string" ||
            value.indexOf("px", value.length - 2) === -1
              ? 'px"'
              : '"';
          end = "span";
        } else if (attr === ATTR.FONT) {
          start = 'span style="font-family: ' + value + '"';
          end = "span";
        } else if (attr === ATTR.COLOR) {
          start = 'span style="color: ' + value + '"';
          end = "span";
        } else if (attr === ATTR.BACKGROUND_COLOR) {
          start = 'span style="background-color: ' + value + '"';
          end = "span";
        }

        if (start) prefix += "<" + start + ">";
        if (end) suffix = "</" + end + ">" + suffix;
      }

      var text = op.text;
      var newLineIndex = text.indexOf("\n");
      if (newLineIndex >= 0) {
        newLine = true;
        if (newLineIndex < text.length - 1) {
          // split op.
          op = new firepad.TextOp(
            "insert",
            text.substr(newLineIndex + 1),
            attrs
          );
        } else {
          op = doc.ops[++i];
        }
        text = text.substr(0, newLineIndex);
      } else {
        op = doc.ops[++i];
      }

      // Replace leading, trailing, and consecutive spaces with nbsp's to make sure they're preserved.
      text = text
        .replace(/  +/g, function(str) {
          return new Array(str.length + 1).join("\u00a0");
        })
        .replace(/^ /, "\u00a0")
        .replace(/ $/, "\u00a0");
      if (text.length > 0) {
        emptyLine = false;
      }

      var pageBreak = "";
      var isAction = !attrs[ATTR.LINE_CLASS] || attrs[ATTR.LINE_CLASS] === "pc-action";

      if(line < 50){
        if(text.length >= 80){
          line += parseInt(text.length / 80) + 1 + (isAction ? 1 : 0);
        } else {
          line += (isAction ? 1 : 0) + 1;
        }
      } else {
        pageBreak = "<span style='display:block; page-break-after:always;'></span>"
        line = 0;
      }

      html += prefix + textToHtml(text) + pageBreak + suffix;
    }

    if (inListItem) {
      html += "</li>";
    } else if (!firstLine) {
      if (emptyLine) {
        html += "&nbsp;";
      }
      html += "</div>";
    }

    // Close any extra lists.
    while (listTypeStack.length > 0) {
      html += close(listTypeStack.pop());
    }

    if (usesTodo) {
      html = TODO_STYLE + html;
    }

    return SCREENPLAY_STYLE + "<div class='CodeMirror'>" + html + "</div>";
  }

  return serializeHtml;
})();

var firepad = firepad || {};

/**
 * Helper to turn Firebase contents into JSON.
 */
firepad.SerializeJson = (function() {
  var utils = firepad.utils;
  var ATTR = firepad.AttributeConstants;

  function serializeJson(doc, shootingEventId) {
    var newLine = true;
    var firstLine = true;
    var i = 0;
    var op = doc.ops[i];

    var output = {
      size: 0,
      lines: []
    };

    var lineClass = "";
    var lineSceneCode = "";
    var lineSceneId = "";
    var lineSize = 0;
    var lineContent = [];

    function addLine(clazz, sceneCode, sceneId, content, size) {
      const line = {
        format: clazz.replace("pc-", ""),
        content: content
      };

      if (sceneCode) line.scene_code = sceneCode;
      if (sceneId) line.scene_id = sceneId;

      output.size += size;
      output.lines.push(line);
    }

    while (op) {
      utils.assert(op.isInsert());
      var attrs = op.attributes;

      if (newLine) {
        newLine = false;

        if (!firstLine) {
          addLine(lineClass, lineSceneCode, lineSceneId, lineContent, lineSize);

          lineClass = "";
          lineSceneCode = "";
          lineSceneId = "";
          lineSize = 0;
          lineContent = [];
        }

        firstLine = false;

        if (ATTR.LINE_SENTINEL in attrs) {
          lineClass = attrs[ATTR.LINE_CLASS] || "";
          lineSceneCode = attrs[ATTR.SCENE_CODE] || "";
          lineSceneId = attrs[ATTR.SCENE_ID] || "";
        }
      }

      if (ATTR.LINE_SENTINEL in attrs || ATTR.ENTITY_SENTINEL in attrs) {
        op = doc.ops[++i];
        continue;
      }

      var text = op.text;
      var newLineIndex = text.indexOf("\n");

      if (newLineIndex >= 0) {
        newLine = true;
        if (newLineIndex < text.length - 1) {
          // split op.
          op = new firepad.TextOp(
            "insert",
            text.substr(newLineIndex + 1),
            attrs
          );
        } else {
          op = doc.ops[++i];
        }
        text = text.substr(0, newLineIndex);
      } else {
        op = doc.ops[++i];
      }

      var textAttrs = {};

      for (var attr in attrs) {
        var value = attrs[attr];

        if (shootingEventId) {
          var elemAttrName = ATTR.ELEMENT + "-" + shootingEventId;

          if (attr === elemAttrName) {
            textAttrs.element_id = value;
          }
        } else if (attr === ATTR.THREAD) {
          textAttrs.thread_id = value;
        }
      }

      lineSize += text.length;

      if (shootingEventId) {
        if (
          lineContent.length > 0 &&
          lineContent[lineContent.length - 1].attrs.element_id === textAttrs.element_id
        ) {
          // join parts of text that correspond to the same element
          lineContent[lineContent.length - 1].text += text;
        } else {
          lineContent.push({
            text: text,
            attrs: textAttrs
          });
        }
      } else {
        if (
          lineContent.length > 0 &&
          lineContent[lineContent.length - 1].attrs.thread_id === textAttrs.thread_id
        ) {
          // join parts of text that correspond to the same thread
          lineContent[lineContent.length - 1].text += text;
        } else {
          lineContent.push({
            text: text,
            attrs: textAttrs
          });
        }
      }
    }

    if (!firstLine) {
      addLine(lineClass, lineSceneCode, lineSceneId, lineContent, lineSize);
    }

    return output;
  }

  return serializeJson;
})();

var firepad = firepad || {};

/**
 * Helper to turn Firebase contents into PDFMake JSON format (https://www.npmjs.com/package/pdfmake).
 */
firepad.SerializePdfMake = (function() {
  var utils = firepad.utils;
  var ATTR = firepad.AttributeConstants;

  function serializePdfMake(doc, fontName) {
    var newLine = true;
    var firstLine = true;
    var i = 0;
    var op = doc.ops[i];

    var defaultStyle = {
      fontSize: 11
    }

    if (fontName) {
      defaultStyle.font = fontName;
    }

    var output = {
      size: 0,
      content: [],
      pageSize: "LETTER",
      pageOrientation: "portrait",
      pageMargins: [108, 92, 72, 72],
      defaultStyle: defaultStyle,
      styles: {
        scene: {
          margin: [0, 24, 0, 0],
          bold: true
        },
        action: {
          margin: [0, 12, 0, 0]
        },
        character: {
          margin: [144, 12, 18, 0]
        },
        dialogue: {
          margin: [72, 0, 108, 0]
        },
        parenthetical: {
          margin: [108, 0, 144, 0]
        },
        transition: {
          margin: [0, 12, 0, 0],
          alignment: "right"
        },
        centered: {
          margin: [0, 12, 0, 0],
          alignment: "center"
        }
      },
      header: function(currentPage, pageCount, pageSize) {
        var page = currentPage.toString() + ".";
        return { text: page, alignment: "right", margin: [0, 72, 72, 0] }
      },
    };

    var lineClass = "";
    var lineSceneCode = "";
    var lineSceneId = "";
    var lineText = "";
    var lineSize = 0;

    function addLine(clazz, sceneCode, sceneId, text, size) {
      var cl = clazz.replace("pc-", "");

      if (cl === "scene" || cl === "character" || cl === "transition") {
        text = text.toUpperCase();
      } else if (cl === "act-start" || cl === "act-end") {
        cl = "centered";
      } else if (cl === "") {
        cl = "action";
      }

      const line = {
        text: text,
        style: cl
      };

      if (sceneCode) {
        line.text = sceneCode + "  " + line.text;
        line.sceneCode = sceneCode;
      }

      if (sceneId) line.sceneId = sceneId;

      output.content.push(line);
      output.size += size;
    }

    while (op) {
      utils.assert(op.isInsert());
      var attrs = op.attributes;

      if (newLine) {
        newLine = false;

        if (!firstLine) {
          addLine(lineClass, lineSceneCode, lineSceneId, lineText, lineSize);

          lineClass = "";
          lineSceneCode = "";
          lineSceneId = "";
          lineText = "";
          lineSize = 0;
        }

        firstLine = false;

        if (ATTR.LINE_SENTINEL in attrs) {
          lineClass = attrs[ATTR.LINE_CLASS] || "";
          lineSceneCode = attrs[ATTR.SCENE_CODE] || "";
          lineSceneId = attrs[ATTR.SCENE_ID] || "";
        }
      }

      if (ATTR.LINE_SENTINEL in attrs || ATTR.ENTITY_SENTINEL in attrs) {
        op = doc.ops[++i];
        continue;
      }

      var text = op.text;
      var newLineIndex = text.indexOf("\n");

      if (newLineIndex >= 0) {
        newLine = true;
        if (newLineIndex < text.length - 1) {
          // split op.
          op = new firepad.TextOp(
            "insert",
            text.substr(newLineIndex + 1),
            attrs
          );
        } else {
          op = doc.ops[++i];
        }
        text = text.substr(0, newLineIndex);
      } else {
        op = doc.ops[++i];
      }

      lineText += text;
      lineSize += text.length;
    }

    if (!firstLine) {
      addLine(lineClass, lineSceneCode, lineSceneId, lineText, lineSize);
    }

    return output;
  }

  return serializePdfMake;
})();

var firepad = firepad || {};

/**
 * Helper to turn Firebase contents into a suitable format for the diff tools.
 */
firepad.SerializeText = (function() {
  var utils = firepad.utils;
  var ATTR = firepad.AttributeConstants;

  function serializeText(doc) {
    var newLine = true;
    var firstLine = true;
    var i = 0;
    var op = doc.ops[i];
    var lines = "";
    var lineClass = "";
    var lineContent = "";

    function addLine(clazz, content) {
      const format = clazz.replace("pc-", "");
      lines += '{line format="' + format + '"}' + content + "\n";
    }

    while (op) {
      utils.assert(op.isInsert());
      var attrs = op.attributes;

      if (newLine) {
        newLine = false;

        if (!firstLine) {
          addLine(lineClass, lineContent);

          lineClass = "";
          lineContent = "";
        }

        firstLine = false;

        if (ATTR.LINE_SENTINEL in attrs) {
          lineClass = attrs[ATTR.LINE_CLASS] || "";
        }
      }

      if (ATTR.LINE_SENTINEL in attrs || ATTR.ENTITY_SENTINEL in attrs) {
        op = doc.ops[++i];
        continue;
      }

      var text = op.text;
      var newLineIndex = text.indexOf("\n");

      if (newLineIndex >= 0) {
        newLine = true;
        if (newLineIndex < text.length - 1) {
          // split op.
          op = new firepad.TextOp("insert", text.substr(newLineIndex + 1), attrs);
        } else {
          op = doc.ops[++i];
        }
        text = text.substr(0, newLineIndex);
      } else {
        op = doc.ops[++i];
      }

      var isElement = false;
      var elementAttrs = {};

      for (var attr in attrs) {
        var value = attrs[attr];

        var elemAttrPrefix = ATTR.ELEMENT + "-";
        var elemColorAttrPrefix = ATTR.ELEMENT_COLOR + "-";

        if (attr.indexOf(elemAttrPrefix) === 0) {
          var shootingEventId = attr.replace(elemAttrPrefix, "");

          if (!elementAttrs[shootingEventId]) {
            elementAttrs[shootingEventId] = {};
          }

          elementAttrs[shootingEventId].id = value;
          isElement = true;
        }

        if (attr.indexOf(elemColorAttrPrefix) === 0) {
          var shootingEventId = attr.replace(elemColorAttrPrefix, "");

          if (!elementAttrs[shootingEventId]) {
            elementAttrs[shootingEventId] = {};
          }

          elementAttrs[shootingEventId].color = value;
        }
      }

      var fullText = "";

      if (isElement) {
        var serializedAttrs = "";

        for (var shootingEventId in elementAttrs) {
          if (elementAttrs.hasOwnProperty(shootingEventId)) {
            if (serializedAttrs !== "") {
              serializedAttrs += "|";
            }

            const id = elementAttrs[shootingEventId].id || "";
            const color = elementAttrs[shootingEventId].color || "";

            serializedAttrs += shootingEventId + "," + id + "," + color;
          }
        }

        fullText = '{elem attrs="' + serializedAttrs + '"}' + text + "{/elem}";
      } else {
        fullText = text;
      }

      lineContent += fullText;
    }

    if (!firstLine) {
      addLine(lineClass, lineContent);
    }

    return lines;
  }

  return serializeText;
})();

var firepad = firepad || {};

/**
 * Helper to turn pieces of text into insertable operations
 */
firepad.textPiecesToInserts = function(atNewLine, textPieces) {
  var inserts = [];

  function insert(string, attributes) {
    if (string instanceof firepad.Text) {
      attributes = string.formatting.attributes;
      string = string.text;
    }

    inserts.push({ string: string, attributes: attributes });
    atNewLine = string[string.length - 1] === "\n";
  }

  function insertLine(line, withNewline) {
    // HACK: We should probably force a newline if there isn't one already.  But due to
    // the way this is used for inserting HTML, we end up inserting a "line" in the middle
    // of text, in which case we don't want to actually insert a newline.
    if (atNewLine) {
      insert(
        firepad.sentinelConstants.LINE_SENTINEL_CHARACTER,
        line.formatting.attributes
      );
    }

    for (var i = 0; i < line.textPieces.length; i++) {
      insert(line.textPieces[i]);
    }

    if (withNewline) insert("\n");
  }

  for (var i = 0; i < textPieces.length; i++) {
    if (textPieces[i] instanceof firepad.Line) {
      insertLine(textPieces[i], i < textPieces.length - 1);
    } else {
      insert(textPieces[i]);
    }
  }

  return inserts;
};

var firepad = firepad || {};

/**
 * Instance of headless Firepad for use in NodeJS. Supports get/set on text/html.
 */
firepad.Headless = (function() {
  var TextOperation = firepad.TextOperation;
  var FirebaseAdapter = firepad.FirebaseAdapter;
  var EntityManager = firepad.EntityManager;
  var ParseHtml = firepad.ParseHtml;
  var TriggerAutoformatSentinelCharacter = firepad.sentinelConstants.TRIGGER_AUTOFORMAT_SENTINEL_CHARACTER;
  var ATTR = firepad.AttributeConstants;

  function Headless(refOrPath) {
    // Allow calling without new.
    if (!(this instanceof Headless)) {
      return new Headless(refOrPath);
    }

    var firebase, ref;
    if (typeof refOrPath === "string") {
      if (global.firebase === undefined && typeof firebase !== "object") {
        console.log("REQUIRING");
        firebase = require("firebase");
      } else {
        firebase = global.firebase;
      }

      ref = firebase.database().refFromURL(refOrPath);
    } else {
      ref = refOrPath;
    }

    this.deviceId_ = "backend";
    this.ready_ = false;
    this.zombie_ = false;
    this.entityManager_ = new EntityManager();
    this.firebaseAdapter_ = new FirebaseAdapter(ref, this.deviceId_);

    var self = this;
    self.firebaseAdapter_.on("ready", function() {
      self.ready_ = true;
    });
  }

  Headless.prototype.getDocument = function(callback) {
    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    if (this.ready_) {
      return callback(this.firebaseAdapter_.getDocument());
    }

    var self = this;
    setTimeout(function(){
      self.getDocument(callback);
    }, 100);
  };

  Headless.prototype.getDocumentAtRevision = function(revisionId, callback) {
    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    if (this.ready_) {
      return this.firebaseAdapter_.getDocumentAtRevision(revisionId, callback);
    }

    var self = this;
    setTimeout(function(){
      self.getDocumentAtRevision(revisionId, callback);
    }, 100);
  };

  Headless.prototype.getLastRevision = function(callback) {
    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    if (this.ready_) {
      return callback(this.firebaseAdapter_.getLastRevision());
    }

    var self = this;
    setTimeout(function(){
      self.getLastRevision(callback);
    }, 100);
  };

  Headless.prototype.copyDocument = function(ref, callback) {
    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    var self = this;
    var dstFirebaseAdapter = new FirebaseAdapter(ref, this.deviceId_);

    dstFirebaseAdapter.on("ready", function() {
      self.getDocument(function(doc) {
        if (doc.ops.length === 0) return callback(null);

        for (var i = 0; i < doc.ops.length; i++) {
          var attrs = doc.ops[i].attributes;
          var newAttrs = {};

          for (var attr in attrs) {
            if (attr !== ATTR.SCENE_CODE &&
              attr !== ATTR.SCENE_ID &&
              attr !== ATTR.SCENE_OMITTED &&
              attr !== ATTR.THREAD &&
              attr !== ATTR.DIFF &&
              attr.indexOf(ATTR.ELEMENT + "-") !== 0 &&
              attr.indexOf(ATTR.ELEMENT_COLOR + "-") !== 0) {
              newAttrs[attr] = attrs[attr];
            }
          }

          doc.ops[i].attributes = newAttrs;
        }

        dstFirebaseAdapter.sendOperation(doc, function(err) {
          callback(err);
        });
      });
    });
  };

  Headless.prototype.getText = function(callback) {
    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    this.getDocument(function(doc) {
      var text = doc.apply("");

      // Strip out any special characters from Rich Text formatting
      for (key in firepad.sentinelConstants) {
        text = text.replace(
          new RegExp(firepad.sentinelConstants[key], "g"),
          ""
        );
      }
      callback(text);
    });
  };

  Headless.prototype.setText = function(text, callback) {
    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    text = TriggerAutoformatSentinelCharacter + text;

    var op = TextOperation().insert(text);
    this.sendOperationWithRetry(op, callback);
  };

  Headless.prototype.initializeFakeDom = function(callback) {
    if (typeof document === "object" || typeof firepad.document === "object") {
      callback();
    } else {
      require("jsdom/lib/old-api.js").env(
        "<head></head><body></body>",
        function(err, window) {
          if (firepad.document) {
            // Return if we've already made a jsdom to avoid making more than one
            // This would be easier with promises but we want to avoid introducing
            // another dependency for just headless mode.
            window.close();
            return callback();
          }
          firepad.document = window.document;
          callback();
        }
      );
    }
  };

  Headless.prototype.getJson = function(revisionId, shootingEventId, callback) {
    var self = this;

    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    if (revisionId) {
      self.getDocumentAtRevision(revisionId, function(doc) {
        callback(firepad.SerializeJson(doc, shootingEventId));
      });
    } else {
      self.getDocument(function(doc) {
        callback(firepad.SerializeJson(doc, shootingEventId));
      });
    }
  };

  Headless.prototype.getJsonForPdfMake = function(revisionId, fontName, callback) {
    var self = this;

    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    if (revisionId) {
      self.getDocumentAtRevision(revisionId, function(doc) {
        callback(firepad.SerializePdfMake(doc, fontName));
      });
    } else {
      self.getDocument(function(doc) {
        callback(firepad.SerializePdfMake(doc, fontName));
      });
    }
  };

  Headless.prototype.getHtml = function(callback) {
    var self = this;

    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    self.initializeFakeDom(function() {
      self.getDocument(function(doc) {
        callback(firepad.SerializeHtml(doc, self.entityManager_));
      });
    });
  };

  Headless.prototype.setHtml = function(html, callback) {
    var self = this;

    if (this.zombie_) {
      throw new Error(
        "You can't use a firepad.Headless after calling dispose()!"
      );
    }

    self.initializeFakeDom(function() {
      var textPieces = ParseHtml(html, self.entityManager_);
      var inserts = firepad.textPiecesToInserts(true, textPieces);
      var op = new TextOperation();

      for (var i = 0; i < inserts.length; i++) {
        op.insert(inserts[i].string, inserts[i].attributes);
      }

      self.sendOperationWithRetry(op, callback);
    });
  };

  Headless.prototype.sendOperationWithRetry = function(operation, callback) {
    var self = this;

    self.getDocument(function(doc) {
      var op = operation.clone()["delete"](doc.targetLength);
      self.firebaseAdapter_.sendOperation(op, function(err, committed) {
        if (committed) {
          if (typeof callback !== "undefined") {
            callback(null, committed);
          }
        } else {
          self.sendOperationWithRetry(operation, callback);
        }
      });
    });
  };

  Headless.prototype.dispose = function() {
    this.zombie_ = true; // We've been disposed.  No longer valid to do anything.
    this.firebaseAdapter_.dispose();
  };

  return Headless;
})();

var firepad = firepad || {};

if (
  typeof CodeMirror === "undefined" &&
  typeof require === "function"
) {
  try {
    CodeMirror = require("codemirror");
  } catch(ex) {
    console.log("CodeMirror not found");
  }
}

firepad.Firepad = (function() {
  if (!firepad.RichTextCodeMirrorAdapter) {
    throw new Error(
      "Oops! It looks like you're trying to include lib/firepad.js directly.  This is actually one of many source files that make up firepad.  You want dist/firepad.js instead."
    );
  }
  var RichTextCodeMirrorAdapter = firepad.RichTextCodeMirrorAdapter;
  var RichTextCodeMirror = firepad.RichTextCodeMirror;
  var RichTextToolbar = firepad.RichTextToolbar;
  var ScreenplayToolbar = firepad.ScreenplayToolbar;
  var FirebaseAdapter = firepad.FirebaseAdapter;
  var EditorClient = firepad.EditorClient;
  var EntityManager = firepad.EntityManager;
  var ATTR = firepad.AttributeConstants;
  var utils = firepad.utils;

  function Firepad(ref, place, options) {
    if (!(this instanceof Firepad)) {
      return new Firepad(ref, place, options);
    }

    if (!CodeMirror) {
      throw new Error(
        "Couldn't find CodeMirror.  Did you forget to include codemirror.js?"
      );
    }

    this.zombie_ = false;

    if (CodeMirror && place instanceof CodeMirror) {
      this.codeMirror_ = this.editor_ = place;
      var curValue = this.codeMirror_.getValue();
      if (curValue !== "") {
        throw new Error(
          "Can't initialize Firepad with a CodeMirror instance that already contains text."
        );
      }
    } else {
      this.codeMirror_ = this.editor_ = new CodeMirror(place);
    }

    var editorWrapper = this.codeMirror_.getWrapperElement();
    this.firepadWrapper_ = utils.elt("div", null, { class: "firepad" });
    editorWrapper.parentNode.replaceChild(this.firepadWrapper_, editorWrapper);
    this.firepadWrapper_.appendChild(editorWrapper);

    // Don't allow drag/drop because it causes issues.  See https://github.com/firebase/firepad/issues/36
    utils.on(editorWrapper, "dragstart", utils.stopEvent);

    // Provide an easy way to get the firepad instance associated with this CodeMirror instance.
    this.editor_.firepad = this;
    this.options_ = options || {};

    this.editorMode = this.getOption("mode", "richtext"); // "richtext" or "screenplay"
    this.toolbarEnabled = this.getOption("toolbar", false);
    this.shortcutsEnabled = this.getOption("shortcuts", false);
    this.imageInsertionUI = this.getOption("imageInsertionUI", true);
    this.defaultText = this.getOption("defaultText", null);
    this.userId = this.getOption("userId", ref.push().key);
    this.userColor = this.getOption("userColor", colorFromUserId(this.userId));
    this.userName = this.getOption("userName", "");
    this.screenplayMode = this.getOption("screenplayMode", "edit"); // "edit" or "tag"
    this.shootingEvent = this.getOption("shootingEvent", null); // {"id": string, scenes: [{"sceneId": string, "sceneType": string}]}
    this.showComments = this.getOption("showComments", false);
    this.showDiffAdditions = this.getOption("showDiffAdditions", false);
    this.readOnly = this.getOption("readOnly", false);

    this.options_.cssPrefix = "firepad-";
    this.options_.screenplayMode = this.screenplayMode;
    this.options_.shootingEvent = this.shootingEvent;
    this.options_.showComments = this.showComments;
    this.options_.showDiffAdditions = this.showDiffAdditions;

    if (this.editorMode === "richtext") {
      this.firepadWrapper_.className += " firepad-richtext";
    } else if (this.editorMode === "screenplay") {
      this.firepadWrapper_.className += " firepad-screenplay";

      if (this.screenplayMode === "tag") {
        if (!this.shootingEvent) {
          throw new Error(
            "A shootingEvent is required for the screenplay tag mode."
          );
        }

        this.codeMirror_.setOption("readOnly", true);
        this.shortcutsEnabled = false;
      }
    } else {
      throw new Error(
        "Invalid editor mode. The allowed values are 'richtext' and 'screenplay'."
      );
    }

    if (this.readOnly) {
      this.codeMirror_.setOption("readOnly", true);
    }

    if (this.shortcutsEnabled) {
      if (this.editorMode === "richtext") {
        if (!CodeMirror.keyMap["richtext"]) {
          this.initializeRichtextKeyMap_();
        }
        this.codeMirror_.setOption("keyMap", "richtext");
      } else if (this.editorMode === "screenplay") {
        if (!CodeMirror.keyMap["screenplay"]) {
          this.initializeScreenplayKeyMap_();
        }
        this.codeMirror_.setOption("keyMap", "screenplay");
      }
    }

    if (this.toolbarEnabled) {
      this.firepadWrapper_.className += " firepad-with-toolbar";

      if (this.editorMode === "richtext") {
        this.addRichtextToolbar_();
      } else if (this.editorMode === "screenplay") {
        this.addScreenplayToolbar_();
      }
    }

    // Now that we've mucked with CodeMirror, refresh it.
    if (this.codeMirror_) {
      this.codeMirror_.refresh();
    }

    this.entityManager_ = new EntityManager();
    this.firebaseAdapter_ = new FirebaseAdapter(
      ref,
      null,
      this.userId,
      this.userColor,
      this.userName
    );
    this.richTextCodeMirror_ = new RichTextCodeMirror(
      this.codeMirror_,
      this.entityManager_,
      this.firebaseAdapter_,
      this.options_
    );
    this.editorAdapter_ = new RichTextCodeMirrorAdapter(
      this.richTextCodeMirror_
    );

    this.client_ = new EditorClient(this.firebaseAdapter_, this.editorAdapter_);

    var self = this;
    this.firebaseAdapter_.on("cursor", function() {
      self.trigger.apply(self, ["cursor"].concat([].slice.call(arguments)));
    });

    if (this.codeMirror_) {
      this.richTextCodeMirror_.on("newLine", function() {
        self.trigger.apply(self, ["newLine"].concat([].slice.call(arguments)));
      });
    }

    this.firebaseAdapter_.on("ready", function() {
      self.ready_ = true;
      self.richTextCodeMirror_.setReady();

      if (self.defaultText && self.isHistoryEmpty()) {
        self.setText(self.defaultText);
      }

      if (self.editorMode === "screenplay" && self.screenplayMode === "tag") {
        setTimeout(function() {
          self.richTextCodeMirror_.filterScenes();
          self.trigger("ready");
        }, 0);
      } else {
        self.trigger("ready");
      }
    });

    this.client_.on("synced", function(isSynced) {
      self.trigger("synced", isSynced);
    });

    // Hack for IE8 to make font icons work more reliably.
    // http://stackoverflow.com/questions/9809351/ie8-css-font-face-fonts-only-working-for-before-content-on-over-and-sometimes
    if (
      navigator.appName == "Microsoft Internet Explorer" &&
      navigator.userAgent.match(/MSIE 8\./)
    ) {
      window.onload = function() {
        var head = document.getElementsByTagName("head")[0],
          style = document.createElement("style");
        style.type = "text/css";
        style.styleSheet.cssText = ":before,:after{content:none !important;}";
        head.appendChild(style);
        setTimeout(function() {
          head.removeChild(style);
        }, 0);
      };
    }
  }
  utils.makeEventEmitter(Firepad);

  // For readability, these are the primary "constructors", even though right now they're just aliases for Firepad.
  Firepad.fromCodeMirror = Firepad;

  Firepad.prototype.dispose = function() {
    this.zombie_ = true; // We've been disposed.  No longer valid to do anything.

    // Unwrap the editor.
    var editorWrapper = this.codeMirror_.getWrapperElement();
    this.firepadWrapper_.removeChild(editorWrapper);
    this.firepadWrapper_.parentNode.replaceChild(
      editorWrapper,
      this.firepadWrapper_
    );

    this.editor_.firepad = null;

    if (
      this.codeMirror_ &&
      (this.codeMirror_.getOption("keyMap") === "richtext" ||
        this.codeMirror_.getOption("keyMap") === "screenplay")
    ) {
      this.codeMirror_.setOption("keyMap", "default");
    }

    this.firebaseAdapter_.dispose();
    this.editorAdapter_.detach();
    if (this.richTextCodeMirror_) this.richTextCodeMirror_.detach();
  };

  Firepad.prototype.setUserId = function(userId) {
    this.userId = userId;
    this.firebaseAdapter_.setUserId(userId);
  };

  Firepad.prototype.setUserColor = function(color) {
    this.userColor = color;
    this.firebaseAdapter_.setColor(color);
  };

  Firepad.prototype.setShootingEvent = function(shootingEvent) {
    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      this.shootingEvent = shootingEvent // {"id": string, scenes: [{"sceneId": string, "sceneType": string}]}
      this.options_.shootingEvent = this.shootingEvent;

      var self = this;
      setTimeout(function() {
        self.richTextCodeMirror_.setShootingEvent(self.shootingEvent);
        self.trigger("ready");
      }, 0);
    } else {
      console.log(
        "Firepad: 'setShootingEvent' is only available for the screenplay tag mode"
      );
    }
  };

  Firepad.prototype.onUsersChange = function(callback) {
    this.firebaseAdapter_.onUsersChange(callback);
  };

  Firepad.prototype.scrollToLine = function(lineNum) {
    this.richTextCodeMirror_.scrollToLine(lineNum);
  };

  Firepad.prototype.scrollToScene = function(sceneCode) {
    this.richTextCodeMirror_.scrollToScene(sceneCode);
  };

  Firepad.prototype.prepareForNewScene = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.prepareForNewScene();
  };

  Firepad.prototype.onCursorChange = function(callback) {
    this.richTextCodeMirror_.onCursorChange(callback);
  };

  Firepad.prototype.onScenesChange = function(callback) {
    this.richTextCodeMirror_.onScenesChange(callback);
  };

  Firepad.prototype.onLockedScenesDeleteIntent = function(callback) {
    this.richTextCodeMirror_.onLockedScenesDeleteIntent(callback);
  };

  Firepad.prototype.onLockedSceneTitleEdited = function(callback) {
    this.richTextCodeMirror_.onLockedSceneTitleEdited(callback);
  };

  Firepad.prototype.onVisibleThreadsChange = function(callback) {
    this.richTextCodeMirror_.onVisibleThreadsChange(callback);
  };

  Firepad.prototype.getRevisionsFromRevision = function(revId, callback) {
    this.firebaseAdapter_.getRevisionsFromRevision(revId, callback);
  };

  Firepad.prototype.getDocumentAtRevisionForDiff = function(
    revisionId,
    callback
  ) {
    if (!revisionId) return callback("");

    var self = this;

    self.firebaseAdapter_.getDocumentAtRevision(revisionId, function(doc) {
      if (doc === null) return callback(null);

      var serializedDoc = null;

      if (self.editorMode === "screenplay") {
        serializedDoc = firepad.SerializeText(doc);
      } else {
        serializedDoc = firepad.SerializeHtml(doc, self.entityManager_);
      }

      callback(serializedDoc);
    });
  };

  Firepad.prototype.getText = function() {
    this.assertReady_("getText");
    return this.richTextCodeMirror_.getText();
  };

  Firepad.prototype.setText = function(textPieces) {
    this.assertReady_("setText");

    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    // HACK: Hide CodeMirror during setText to prevent lots of extra renders.
    this.codeMirror_.getWrapperElement().setAttribute("style", "display: none");
    this.codeMirror_.setValue("");
    this.insertText(0, textPieces);
    this.codeMirror_.getWrapperElement().setAttribute("style", "");
    this.codeMirror_.refresh();

    this.editorAdapter_.setCursor({ position: 0, selectionEnd: 0 });
  };

  Firepad.prototype.insertTextAtCursor = function(textPieces) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.insertText(
      this.codeMirror_.indexFromPos(this.codeMirror_.getCursor()),
      textPieces
    );
  };

  Firepad.prototype.insertText = function(index, textPieces) {
    this.assertReady_("insertText");

    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    // Wrap it in an array if it's not already.
    if (Object.prototype.toString.call(textPieces) !== "[object Array]") {
      textPieces = [textPieces];
    }

    var self = this;
    self.codeMirror_.operation(function() {
      // HACK: We should check if we're actually at the beginning of a line; but checking for index == 0 is sufficient
      // for the setText() case.
      var atNewLine = index === 0;
      var inserts = firepad.textPiecesToInserts(atNewLine, textPieces);

      for (var i = 0; i < inserts.length; i++) {
        var string = inserts[i].string;
        var attributes = inserts[i].attributes;
        self.richTextCodeMirror_.insertText(index, string, attributes);
        index += string.length;
      }
    });
  };

  Firepad.prototype.getOperationForSpan = function(start, end) {
    var text = this.richTextCodeMirror_.getRange(start, end);
    var spans = this.richTextCodeMirror_.getAttributeSpans(start, end);
    var pos = 0;
    var op = new firepad.TextOperation();
    for (var i = 0; i < spans.length; i++) {
      op.insert(text.substr(pos, spans[i].length), spans[i].attributes);
      pos += spans[i].length;
    }
    return op;
  };

  Firepad.prototype.getJson = function(shootingEventId) {
    if (this.editorMode === "screenplay") {
      var doc = this.getOperationForSpan(0, this.codeMirror_.getValue().length);
      return firepad.SerializeJson(doc, shootingEventId);
    } else {
      console.log(
        "Firepad: json serialization is only implemented for the screenplay format"
      );
      return null;
    }
  };

  Firepad.prototype.getJsonForPdfMake = function(fontName) {
    if (this.editorMode === "screenplay") {
      var doc = this.getOperationForSpan(0, this.codeMirror_.getValue().length);
      return firepad.SerializePdfMake(doc, fontName);
    } else {
      console.log(
        "Firepad: json for pdfmake serialization is only implemented for the screenplay format"
      );
      return null;
    }
  };

  Firepad.prototype.getTextFromSelection = function() {
    if (this.richTextCodeMirror_.emptySelection_()) {
      this.richTextCodeMirror_.selectWord();
    }

    return this.codeMirror_.getSelection();
  };

  Firepad.prototype.getHtml = function() {
    return this.getHtmlFromRange(null, null);
  };

  Firepad.prototype.getHtmlFromSelection = function() {
    var startPos = this.codeMirror_.getCursor("start"),
      endPos = this.codeMirror_.getCursor("end");
    var startIndex = this.codeMirror_.indexFromPos(startPos),
      endIndex = this.codeMirror_.indexFromPos(endPos);
    return this.getHtmlFromRange(startIndex, endIndex);
  };

  Firepad.prototype.getHtmlFromRange = function(start, end) {
    this.assertReady_("getHtmlFromRange");
    var doc =
      start != null && end != null
        ? this.getOperationForSpan(start, end)
        : this.getOperationForSpan(0, this.codeMirror_.getValue().length);
    return firepad.SerializeHtml(doc, this.entityManager_);
  };

  Firepad.prototype.insertHtml = function(index, html) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    var lines = firepad.ParseHtml(html, this.entityManager_);
    this.insertText(index, lines);
  };

  Firepad.prototype.insertHtmlAtCursor = function(html) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.insertHtml(
      this.codeMirror_.indexFromPos(this.codeMirror_.getCursor()),
      html
    );
  };

  Firepad.prototype.setHtml = function(html) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    var lines = firepad.ParseHtml(html, this.entityManager_);
    this.setText(lines);
  };

  Firepad.prototype.isHistoryEmpty = function() {
    this.assertReady_("isHistoryEmpty");
    return this.firebaseAdapter_.isHistoryEmpty();
  };

  Firepad.prototype.bold = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleAttribute(ATTR.BOLD);
    this.codeMirror_.focus();
  };

  Firepad.prototype.italic = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleAttribute(ATTR.ITALIC);
    this.codeMirror_.focus();
  };

  Firepad.prototype.underline = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleAttribute(ATTR.UNDERLINE);
    this.codeMirror_.focus();
  };

  Firepad.prototype.strike = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleAttribute(ATTR.STRIKE);
    this.codeMirror_.focus();
  };

  Firepad.prototype.fontSize = function(size) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.setAttribute(ATTR.FONT_SIZE, size);
    this.codeMirror_.focus();
  };

  Firepad.prototype.font = function(font) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.setAttribute(ATTR.FONT, font);
    this.codeMirror_.focus();
  };

  Firepad.prototype.color = function(color) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.setAttribute(ATTR.COLOR, color);
    this.codeMirror_.focus();
  };

  Firepad.prototype.highlight = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleAttribute(
      ATTR.BACKGROUND_COLOR,
      "rgba(255,255,0,.65)"
    );
    this.codeMirror_.focus();
  };

  Firepad.prototype.anchorThread = function(threadId) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    var res = null;

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      res = this.richTextCodeMirror_.anchorThread(threadId);
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'anchorThread' is only available for the screenplay edit mode"
      );
    }

    return res;
  };

  Firepad.prototype.setSelectedThread = function(threadId) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    var res = null;

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      res = this.richTextCodeMirror_.setSelectedThread(threadId);
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'setSelectedThread' is only available for the screenplay edit mode"
      );
    }

    return res;
  };
  Firepad.prototype.clearSelectedThread = function(threadId) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    var res = null;

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      res = this.richTextCodeMirror_.clearSelectedThread(threadId);
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'clearSelectedThread' is only available for the screenplay edit mode"
      );
    }

    return res;
  };

  Firepad.prototype.deleteThread = function(threadId) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      this.richTextCodeMirror_.deleteThread(threadId);
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'deleteThread' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.scrollToThread = function(threadId) {
    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      this.richTextCodeMirror_.scrollToThread(threadId);
    } else {
      console.log(
        "Firepad: 'scrollToThread' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.getAddedDiffScenes = function(callback) {
    this.richTextCodeMirror_.getAddedDiffScenes(callback);
  };

  Firepad.prototype.getAddedDiffLines = function(callback) {
    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      this.richTextCodeMirror_.getAddedDiffLines(callback);
    } else {
      console.log(
        "Firepad: 'getDiffLines' is only available for the screenplay tag mode"
      );
    }
  };

  Firepad.prototype.deleteAddedDiffs = function(callback) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      this.richTextCodeMirror_.deleteAddedDiffs(callback);
    } else {
      console.log(
        "Firepad: 'deleteDiffs' is only available for the screenplay tag mode"
      );
    }
  };

  Firepad.prototype.toggleElement = function(elementId, elementColor) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    var res = null;

    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      res = this.richTextCodeMirror_.toggleElement(elementId, elementColor);
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'toggleElement' is only available for the screenplay tag mode"
      );
    }

    return res;
  };

  Firepad.prototype.deleteElement = function(elementId) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      this.richTextCodeMirror_.deleteElements(elementId);
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'deleteElement' is only available for the screenplay tag mode"
      );
    }
  };

  Firepad.prototype.deleteAllElements = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      this.richTextCodeMirror_.deleteElements();
      this.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'deleteAllElements' is only available for the screenplay tag mode"
      );
    }
  };

  Firepad.prototype.getElements = function() {
    if (this.editorMode === "screenplay" && this.screenplayMode === "tag") {
      return this.richTextCodeMirror_.getElements();
    } else {
      console.log(
        "Firepad: 'getElements' is only available for the screenplay tag mode"
      );
    }
  };

  Firepad.prototype.align = function(alignment) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (
      alignment !== "left" &&
      alignment !== "center" &&
      alignment !== "right"
    ) {
      throw new Error('align() must be passed "left", "center", or "right".');
    }
    this.richTextCodeMirror_.setLineAttribute(ATTR.LINE_ALIGN, alignment);
    this.codeMirror_.focus();
  };

  Firepad.prototype.setLineClass = function(newClass) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      var self = this;
      var currentAttrs = self.richTextCodeMirror_.getCurrentLineAttributes_();
      var oldClass = currentAttrs[ATTR.LINE_CLASS];
      var sceneId = currentAttrs[ATTR.SCENE_ID];

      if (sceneId) {
        console.log("Scene is locked");
        return;
      }

      function _unsetOldClass() {
        self.richTextCodeMirror_.setLineAttribute(ATTR.LINE_CLASS, false);
        self.richTextCodeMirror_.setLineAttribute(ATTR.LINE_CLASS_TYPE, false);
        self.richTextCodeMirror_.setLineAttribute(ATTR.SCENE_CODE, false);

        if (oldClass === "pc-scene") {
          setTimeout(function() {
            self.richTextCodeMirror_.recodeScenes();
          }, 0);
        }
      }

      function _setNewClass() {
        self.richTextCodeMirror_.setLineAttribute(ATTR.LINE_CLASS, newClass);
        self.richTextCodeMirror_.setLineAttribute(ATTR.LINE_CLASS_TYPE, "user");

        if (newClass === "pc-scene") {
          setTimeout(function() {
            self.richTextCodeMirror_.recodeScenes();
          }, 0);
        }
      }

      if (
        !newClass || // passed an empty value
        (oldClass && newClass && oldClass === newClass) // the old and the new values are the same (toggle)
      ) {
        _unsetOldClass();
      } else if (oldClass === "pc-scene") {
        _unsetOldClass();
        _setNewClass();
      } else {
        _setNewClass();
      }

      setTimeout(function() {
        self.richTextCodeMirror_.updateToolbar();
      }, 100);

      self.codeMirror_.focus();
    } else {
      console.log(
        "Firepad: 'setLineClass' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.deleteScene = function(sceneCode, callback) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      var self = this;

      setTimeout(function() {
        self.richTextCodeMirror_.deleteScene(sceneCode);

        if (callback) {
          callback();
        }
      }, 0);
    } else {
      console.log(
        "Firepad: 'deleteScene' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.restoreScene = function(sceneCode, callback) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      var self = this;

      setTimeout(function() {
        self.richTextCodeMirror_.restoreScene(sceneCode);

        if (callback) {
          callback();
        }
      }, 0);
    } else {
      console.log(
        "Firepad: 'restoreScene' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.lockScene = function(
    sceneIdGenerator,
    sceneCode,
    callback
  ) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      var self = this;

      setTimeout(function() {
        var error = self.richTextCodeMirror_.lockScene(
          sceneIdGenerator,
          sceneCode
        );

        if (callback) {
          var scenes = self.richTextCodeMirror_.getScenes();
          callback(scenes, error);
        }
      }, 0);
    } else {
      console.log(
        "Firepad: 'lockScene' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.lockScenes = function(
    sceneIdGenerator,
    sceneCodes,
    callback
  ) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      var self = this;

      if (arguments.length === 2 && typeof sceneCodes === "function") {
        callback = sceneCodes;
        sceneCodes = [];
      }

      setTimeout(function() {
        var errors = self.richTextCodeMirror_.lockScenes(
          sceneIdGenerator,
          sceneCodes
        );

        if (callback) {
          var scenes = self.richTextCodeMirror_.getScenes();
          callback(scenes, errors);
        }
      }, 0);
    } else {
      console.log(
        "Firepad: 'lockScenes' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.screenplayAutoFormat = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      this.richTextCodeMirror_.screenplayAutoFormat(true);
    } else {
      console.log(
        "Firepad: 'screenplayAutoFormat' is only available for the screenplay edit mode"
      );
    }
  };

  Firepad.prototype.orderedList = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleLineAttribute(ATTR.LIST_TYPE, "o");
    this.codeMirror_.focus();
  };

  Firepad.prototype.unorderedList = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleLineAttribute(ATTR.LIST_TYPE, "u");
    this.codeMirror_.focus();
  };

  Firepad.prototype.todo = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.toggleTodo();
    this.codeMirror_.focus();
  };

  Firepad.prototype.newline = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.newline();

    if (this.editorMode === "screenplay" && this.screenplayMode === "edit") {
      this.richTextCodeMirror_.screenplayAutoFormat(false, "newline");
    }
  };

  Firepad.prototype.deleteLeft = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.deleteLeft();
  };

  Firepad.prototype.deleteRight = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.deleteRight();
  };

  Firepad.prototype.indent = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.indent();
    this.codeMirror_.focus();
  };

  Firepad.prototype.unindent = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.unindent();
    this.codeMirror_.focus();
  };

  Firepad.prototype.undo = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.codeMirror_.undo();
  };

  Firepad.prototype.redo = function() {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.codeMirror_.redo();
  };

  Firepad.prototype.insertEntity = function(type, info, origin) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.insertEntityAtCursor(type, info, origin);
  };

  Firepad.prototype.insertEntityAt = function(index, type, info, origin) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.richTextCodeMirror_.insertEntityAt(index, type, info, origin);
  };

  Firepad.prototype.registerEntity = function(type, options) {
    if (this.readOnly) {
      console.log("Firepad: read only mode");
      return;
    }

    this.entityManager_.register(type, options);
  };

  Firepad.prototype.getOption = function(option, def) {
    return option in this.options_ ? this.options_[option] : def;
  };

  Firepad.prototype.assertReady_ = function(funcName) {
    if (!this.ready_) {
      throw new Error(
        'You must wait for the "ready" event before calling ' + funcName + "."
      );
    }
    if (this.zombie_) {
      throw new Error(
        "You can't use a Firepad after calling dispose()!  [called " +
          funcName +
          "]"
      );
    }
  };

  Firepad.prototype.makeImageDialog_ = function() {
    this.makeDialog_("img", "Insert image url");
  };

  Firepad.prototype.makeDialog_ = function(id, placeholder) {
    var self = this;

    var hideDialog = function() {
      var dialog = document.getElementById("overlay");
      dialog.style.visibility = "hidden";
      self.firepadWrapper_.removeChild(dialog);
    };

    var cb = function() {
      var dialog = document.getElementById("overlay");
      dialog.style.visibility = "hidden";
      var src = document.getElementById(id).value;
      if (src !== null) self.insertEntity(id, { src: src });
      self.firepadWrapper_.removeChild(dialog);
    };

    var input = utils.elt("input", null, {
      class: "firepad-dialog-input",
      id: id,
      type: "text",
      placeholder: placeholder,
      autofocus: "autofocus"
    });

    var submit = utils.elt("a", "Submit", {
      class: "firepad-btn",
      id: "submitbtn"
    });
    utils.on(submit, "click", utils.stopEventAnd(cb));

    var cancel = utils.elt("a", "Cancel", { class: "firepad-btn" });
    utils.on(cancel, "click", utils.stopEventAnd(hideDialog));

    var buttonsdiv = utils.elt("div", [submit, cancel], {
      class: "firepad-btn-group"
    });

    var div = utils.elt("div", [input, buttonsdiv], {
      class: "firepad-dialog-div"
    });
    var dialog = utils.elt("div", [div], {
      class: "firepad-dialog",
      id: "overlay"
    });

    this.firepadWrapper_.appendChild(dialog);
  };

  Firepad.prototype.addRichtextToolbar_ = function() {
    this.toolbar = new RichTextToolbar(this.imageInsertionUI);

    this.toolbar.on("undo", this.undo, this);
    this.toolbar.on("redo", this.redo, this);
    this.toolbar.on("bold", this.bold, this);
    this.toolbar.on("italic", this.italic, this);
    this.toolbar.on("underline", this.underline, this);
    this.toolbar.on("strike", this.strike, this);
    this.toolbar.on("font-size", this.fontSize, this);
    this.toolbar.on("font", this.font, this);
    this.toolbar.on("color", this.color, this);
    this.toolbar.on(
      "left",
      function() {
        this.align("left");
      },
      this
    );
    this.toolbar.on(
      "center",
      function() {
        this.align("center");
      },
      this
    );
    this.toolbar.on(
      "right",
      function() {
        this.align("right");
      },
      this
    );
    this.toolbar.on("ordered-list", this.orderedList, this);
    this.toolbar.on("unordered-list", this.unorderedList, this);
    this.toolbar.on("todo-list", this.todo, this);
    this.toolbar.on("indent-increase", this.indent, this);
    this.toolbar.on("indent-decrease", this.unindent, this);
    this.toolbar.on("insert-image", this.makeImageDialog_, this);

    this.firepadWrapper_.insertBefore(
      this.toolbar.element(),
      this.firepadWrapper_.firstChild
    );
  };

  Firepad.prototype.addScreenplayToolbar_ = function() {
    this.toolbar = new ScreenplayToolbar();

    this.toolbar.on(
      "screenplay-scene",
      function() {
        this.setLineClass("pc-scene");
      },
      this
    );
    this.toolbar.on(
      "screenplay-action",
      function() {
        this.setLineClass("pc-action");
      },
      this
    );
    this.toolbar.on(
      "screenplay-character",
      function() {
        this.setLineClass("pc-character");
      },
      this
    );
    this.toolbar.on(
      "screenplay-dialogue",
      function() {
        this.setLineClass("pc-dialogue");
      },
      this
    );
    this.toolbar.on(
      "screenplay-parenthetical",
      function() {
        this.setLineClass("pc-parenthetical");
      },
      this
    );
    this.toolbar.on(
      "screenplay-transition",
      function() {
        this.setLineClass("pc-transition");
      },
      this
    );
    this.toolbar.on(
      "screenplay-act-start",
      function() {
        this.setLineClass("pc-act-start");
      },
      this
    );
    this.toolbar.on(
      "screenplay-act-end",
      function() {
        this.setLineClass("pc-act-end");
      },
      this
    );
    this.toolbar.on(
      "screenplay-centered",
      function() {
        this.setLineClass("pc-centered");
      },
      this
    );
    this.toolbar.on("screenplay-auto-format", this.screenplayAutoFormat, this);

    this.firepadWrapper_.insertBefore(
      this.toolbar.element(),
      this.firepadWrapper_.firstChild
    );
  };

  Firepad.prototype.initializeRichtextKeyMap_ = function() {
    function binder(fn) {
      return function(cm) {
        // HACK: CodeMirror will often call our key handlers within a cm.operation(), and that
        // can mess us up (we rely on events being triggered synchronously when we make CodeMirror
        // edits).  So to escape any cm.operation(), we do a setTimeout.
        setTimeout(function() {
          fn.call(cm.firepad);
        }, 0);
      };
    }

    CodeMirror.keyMap["richtext"] = {
      "Ctrl-B": binder(this.bold),
      "Cmd-B": binder(this.bold),
      "Ctrl-I": binder(this.italic),
      "Cmd-I": binder(this.italic),
      "Ctrl-U": binder(this.underline),
      "Cmd-U": binder(this.underline),
      "Ctrl-H": binder(this.highlight),
      "Cmd-H": binder(this.highlight),
      Enter: binder(this.newline),
      Delete: binder(this.deleteRight),
      Backspace: binder(this.deleteLeft),
      Tab: binder(this.indent),
      "Shift-Tab": binder(this.unindent),
      fallthrough: ["default"]
    };
  };

  Firepad.prototype.initializeScreenplayKeyMap_ = function() {
    function binder(fn) {
      return function(cm) {
        // HACK: CodeMirror will often call our key handlers within a cm.operation(), and that
        // can mess us up (we rely on events being triggered synchronously when we make CodeMirror
        // edits).  So to escape any cm.operation(), we do a setTimeout.
        setTimeout(function() {
          fn.call(cm.firepad);
        }, 0);
      };
    }

    CodeMirror.keyMap["screenplay"] = {
      Enter: binder(this.newline),
      Delete: binder(this.deleteRight),
      Backspace: binder(this.deleteLeft),
      fallthrough: ["default"]
    };
  };

  function colorFromUserId(userId) {
    var a = 1;
    for (var i = 0; i < userId.length; i++) {
      a = (17 * (a + userId.charCodeAt(i))) % 360;
    }
    var hue = a / 360;

    return hsl2hex(hue, 1, 0.75);
  }

  function rgb2hex(r, g, b) {
    function digits(n) {
      var m = Math.round(255 * n).toString(16);
      return m.length === 1 ? "0" + m : m;
    }
    return "#" + digits(r) + digits(g) + digits(b);
  }

  function hsl2hex(h, s, l) {
    if (s === 0) {
      return rgb2hex(l, l, l);
    }
    var var2 = l < 0.5 ? l * (1 + s) : l + s - s * l;
    var var1 = 2 * l - var2;
    var hue2rgb = function(hue) {
      if (hue < 0) {
        hue += 1;
      }
      if (hue > 1) {
        hue -= 1;
      }
      if (6 * hue < 1) {
        return var1 + (var2 - var1) * 6 * hue;
      }
      if (2 * hue < 1) {
        return var2;
      }
      if (3 * hue < 2) {
        return var1 + (var2 - var1) * 6 * (2 / 3 - hue);
      }
      return var1;
    };
    return rgb2hex(hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3));
  }

  return Firepad;
})(this);

// Export Text classes
firepad.Firepad.Formatting = firepad.Formatting;
firepad.Firepad.Text = firepad.Text;
firepad.Firepad.Entity = firepad.Entity;
firepad.Firepad.LineFormatting = firepad.LineFormatting;
firepad.Firepad.Line = firepad.Line;
firepad.Firepad.TextOperation = firepad.TextOperation;
firepad.Firepad.Headless = firepad.Headless;

// Export adapters
firepad.Firepad.RichTextCodeMirrorAdapter = firepad.RichTextCodeMirrorAdapter;

return firepad.Firepad; }, this);