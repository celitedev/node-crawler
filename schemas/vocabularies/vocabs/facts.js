var _ = require("lodash");

module.exports = function (generatedSchemas) {


  var exports = {
    type: "static",
    sourceMappings: {

      //NYC.com
      PlaceWithOpeninghours: {

        //cuisine
        "chinese": "chinese",
        "indian/pakistani": ["indian", "pakistani"],
        "sandwich shops": ["sandwich shops"],
        "barbecue": ["bbq"],
        "ice cream &amp; frozen yogurt": ["ice"],
        "american (regional)": "american",
        "american (new)": "american",
        "southern style": ["southern", "american"],


        //ambiance
        "business casual<br>casual": ["business casual", "casual"],

        //payment
        "visa only": ["visa"],
        "mastercard only": ["mastercard"],
        "all major": ["all major cards"],
      }
    },
    vocabulary: {
      "southern": ["southern"],
      "american": ["american"],
      "chinese": ["chinese"],
      "indian": ["indian"],
      "pakistani": ["pakistani"],
      "sandwich shops": ["sandwiches"],
      "bbq": ["barbecue", "bbq", "grill"],
      "ice": ["ice cream", "frozen yoghurt"],

      //ambiance
      "business casual": ["business casual", "urban chique"],
      "casual": ["casual"],


      //payment
      "all major cards": ["visa", "mastercard", "all major cards", "all major"],
      "visa": "visa",
      "mastercard": "mastercard"
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
