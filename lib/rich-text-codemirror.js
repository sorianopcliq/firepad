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
