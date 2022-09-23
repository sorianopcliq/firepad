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
