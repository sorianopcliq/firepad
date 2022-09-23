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
