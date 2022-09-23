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
