var _ = require("lodash");

module.exports = function (generatedSchemas) {


  var exports = {
    type: "static",
    sourceMappings: {

      //NYC
      PlaceWithOpeninghours: {
        "chinese": "chinese"
      }
    },
    vocabulary: {
      "chinese": ["chinese", "eastern"]
    }
  };


  //Add all schema.org types
  exports.sourceMappings.Thing = exports.sourceMappings.Thing || {};

  _.each(_.keys(generatedSchemas.types), function (type) {
    type = type.toLowerCase();
    exports.sourceMappings.Thing[type] = type; //this goes for everything
    exports.vocabulary[type] = _.uniq((exports.vocabulary[type] || []).concat([type]));
  });

  return exports;
};
