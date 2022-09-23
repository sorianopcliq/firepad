var FOUNTAIN_SECTIONS = {
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
