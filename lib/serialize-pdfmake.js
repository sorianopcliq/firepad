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
