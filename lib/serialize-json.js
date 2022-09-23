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
