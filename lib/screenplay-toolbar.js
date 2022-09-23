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
