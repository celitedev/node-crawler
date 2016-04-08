var _ = require("lodash");

module.exports = function (generatedSchemas) {


  var exports = {
    type: "static",
    sourceMappings: {

      //mappings from sourceEntity-values -> controlled values
      //It's logical to model these per Type since this is how crawlers are written
      PlaceWithOpeninghours: {
        //TBD
      }
    },
    //all values (independent of type) including their aliases and parents 
    vocabulary: {
      //TBD
    }
  };


  //Add all schema.org types
  exports.sourceMappings.Thing = exports.sourceMappings.Thing || {};

  _.each(_.keys(generatedSchemas.types), function (type) {
    exports.sourceMappings.Thing[type] = type;
    exports.vocabulary[type] = type;
  });


  return exports;
};
