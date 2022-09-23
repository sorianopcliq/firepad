module.exports = function(grunt) {
  grunt.initConfig({
    concat: {
      firepadjs: {
        options: {
          banner: [
            "/*!",
            " * Firepad is an open-source, collaborative code and text editor. It was designed",
            " * to be embedded inside larger applications. Since it uses Firebase as a backend,",
            " * it requires no server-side code and can be added to any web app simply by",
            " * including a couple JavaScript files.",
            " *",
            " * Firepad 0.0.0",
            " * http://www.firepad.io/",
            " * License: MIT",
            " * Copyright: 2014 Firebase",
            " * With code from ot.js (Copyright 2012-2013 Tim Baumann)",
            " */\n",
            "(function (name, definition, context) {",
            "  //try CommonJS, then AMD (require.js), then use global.",
            "  if (typeof module != 'undefined' && module.exports) module.exports = definition();",
            "  else if (typeof context['define'] == 'function' && context['define']['amd']) define(definition);",
            "  else context[name] = definition();",
            "})('Firepad', function () {"
          ].join("\n"),
          footer: "\nreturn firepad.Firepad; }, this);"
        },
        src: [
          "lib/fountain.js",
          "lib/utils.js",
          "lib/span.js",
          "lib/text-op.js",
          "lib/text-operation.js",
          "lib/annotation-list.js",
          "lib/cursor.js",
          "lib/firebase-adapter.js",
          "lib/rich-text-toolbar.js",
          "lib/screenplay-toolbar.js",
          "lib/wrapped-operation.js",
          "lib/undo-manager.js",
          "lib/client.js",
          "lib/editor-client.js",
          "lib/constants.js",
          "lib/entity-manager.js",
          "lib/entity.js",
          "lib/rich-text-codemirror.js",
          "lib/rich-text-codemirror-adapter.js",
          "lib/formatting.js",
          "lib/text.js",
          "lib/line-formatting.js",
          "lib/line.js",
          "lib/parse-html.js",
          "lib/serialize-html.js",
          "lib/serialize-json.js",
          "lib/serialize-pdfmake.js",
          "lib/serialize-text.js",
          "lib/text-pieces-to-inserts.js",
          "lib/headless.js",
          "lib/firepad.js"
        ],
        dest: "dist/firepad.js"
      }
    },
    uglify: {
      options: {
        preserveComments: "some"
      },
      "firepad-min-js": {
        src: "dist/firepad.js",
        dest: "dist/firepad.min.js"
      }
    },
    copy: {
      toBuild: {
        files: [
          {
            src: "font/CourierPrime.woff",
            dest: "dist/CourierPrime.woff"
          },
          {
            src: "font/CourierPrime.woff2",
            dest: "dist/CourierPrime.woff2"
          },
          {
            src: "font/firepad.woff",
            dest: "dist/firepad.woff"
          },
          {
            src: "lib/firepad.css",
            dest: "dist/firepad.css"
          }
        ]
      }
    }
  });

  grunt.loadNpmTasks("grunt-contrib-concat");
  grunt.loadNpmTasks("grunt-contrib-uglify");
  grunt.loadNpmTasks("grunt-contrib-copy");

  // Tasks
  grunt.registerTask("build", ["concat", "uglify", "copy"]);
  grunt.registerTask("default", ["build"]);
};
