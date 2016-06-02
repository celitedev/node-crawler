var _ = require("lodash");

module.exports = function (generatedSchemas) {

  var genreVocab = require("./genre");

  var exports = {
    type: "static",
    sourceMappings: {

      //copy from genre vocab
      Movie: genreVocab.sourceMappings.Movie,


      PlaceWithOpeninghours: {

        //////////////
        //NYC.com

        //ambiance
        "business casual": ["business casual"],
        "casual": ["casual"],
        "fine dining": ["finedining"],

        //payment
        "visa only": ["visa"],
        "mastercard only": ["mastercard"],
        "all major": ["all major cards"],
      },

      FoodEstablishment: {

        /////////////
        //NYC.com

        //NOTE: LOTS OF RAW CUISINES HERE THAT WE DON'T MAP BUT PASSTHROUGH VERBATIM

        //cuisine
        "indian/pakistani": ["indian", "pakistani"],
        "sandwich shops": ["sandwichshop"],
        "barbecue": ["bbq"],
        "ice cream &amp; frozen yogurt": ["ice"],
        "american (regional)": "american",
        "american (new)": "american",
        "southern style": ["southern", "american"],
        "fish &amp; chips": "fishchips",
        "food trucks": "foodtruck",
        "hamburger &amp; hot dog stands": "hamburgerstand",
        "hot dog": "hamburgerstand",
        "wine &amp; cheese": "wineandcheese",
        "sushi bars": "sushi",
        "soup &amp; salad": "soupsalad",
      },
    },
    vocabulary: {
      //cuisine
      "southern": ["southern"],
      "american": ["american"],
      "indian": ["indian"],
      "pakistani": ["pakistani"],
      "sandwichshop": ["sandwich shop", "sandwiches"],
      "bbq": ["barbecue", "bbq", "grill"],
      "ice": ["ice", "ice cream", "frozen yoghurt"],
      "fishchips": ["fish and chips"],
      "foodtruck": ["foodtruck", "food truck"],
      "hamburgerstand": ["hamburgers", "hamburger stand", "hotdogs", "hotdog stand"],
      "wineandcheese": ["wine and cheese", "wine", "cheese"],
      "sushi": ["sushi bar", "sushi"],
      "soupsalad": ["soup and salad"],

      //ambiance
      "business casual": ["business casual", "urban chique"],
      "casual": ["casual"],
      "finedining": ["fine dining", "chique"],

      //payment
      "all major cards": ["visa", "mastercard", "all major cards", "all major"],
      "visa": "visa",
      "mastercard": "mastercard"
    }
  };


  //Merge genre vocabulary which is relic from movies
  exports.vocabulary = _.merge(exports.vocabulary, genreVocab.vocabulary);

  ////////////////////
  //DEPRECATE AFTER TESTING THIS ISN'T NEEDED.
  //
  // //Add all schema.org types on level of roots
  // //This results in, say exports.vocabulary.PlaceWithOpeninghours to contain all subtypes lowercased
  // //
  // //NOTE: THIS IS A DIRECT COPY OF SUBTYPES. 
  // //THIS IS **TEMPORARY***. WE USE THIS FOR NOW BECAUSE WE SIMPLY ONLY 
  // //MATCH ON FACTS, INSTEAD OF SEPARATING OUT PER ATTRIBUTE. THIS MAKES FOR FAR EASIER
  // //FILTERCONTEXT CONSTRUCTION. 
  // //
  // //DOWNSIDES: 
  // //- ES GETS POPULATED WITH LESS DESCRIPTIVE FACTS, WHICH ALSO ADDS TO BLOAT
  // _.each(generatedSchemas.types, function (val, typeName) {

  //   var rootsOfType = _.intersection([typeName].concat(val.ancestors), roots);
  //   if (!rootsOfType.length) return; //not avail for toplevel such as Things and Intangible

  //   typeName = typeName.toLowerCase();

  //   var rootName = rootsOfType[rootsOfType.length - 1];
  //   var rootMap = exports.sourceMappings[rootName] = exports.sourceMappings[rootName] || {};
  //   rootMap[typeName] = typeName;
  //   exports.vocabulary[typeName] = _.uniq((exports.vocabulary[typeName] || []).concat([typeName]));
  // });



  return exports;
};
