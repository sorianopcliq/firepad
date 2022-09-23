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
