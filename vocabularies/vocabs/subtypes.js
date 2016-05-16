var _ = require("lodash");

module.exports = function (generatedSchemas) {


  var exports = {
    type: "static",
    sourceMappings: {

      //NYC
      PlaceWithOpeninghours: {
        "restaurant": "restaurant"
      }
    },
    //all values (independent of type) including their aliases and parents 
    vocabulary: {
      "restaurant": ["restaurant", "eatery"]
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
