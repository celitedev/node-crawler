var _ = require("lodash");

module.exports = function (generatedSchemas) {


  var exports = {
    type: "static",
    sourceMappings: {

      //NYC
      PlaceWithOpeninghours: {
        "restaurant": "restaurant",
        "bistro": ["bistro", "restaurant"],
        "bar": "bar",
        "club": "club",
      }
    },
    //all values (independent of type) including their aliases and parents 
    vocabulary: {
      "restaurant": ["restaurant", "eatery", "diner"],
      "bistro": ['bistro'],
      "bar": ["bar"],
      "club": "club"
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
