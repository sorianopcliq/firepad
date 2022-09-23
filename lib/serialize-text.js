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
