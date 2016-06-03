var _ = require("lodash");

var roots = require("../../domain/_definitions/config").domain.roots;

module.exports = function (generatedSchemas) {


  var exports = {
    type: "static",
    sourceMappings: {

      Thing: {
        "event": "event",
        "placewithopeninghours": "placewithopeninghours",
        "creativework": "creativework",
        "organizationandperson": "organizationandperson"
      },

      CreativeWork: {
        //adding type=Movie alias
        "movie": "movie",
      },

      Event: {
        "screeningevent": "screeningevent"
      },

      PlaceWithOpeninghours: {

        /////////////////////////
        //NYC.com RESTAURANTS
        //incomplete
        "restaurant": "restaurant",
        "bistro": ["bistro", "restaurant"],
        "bar": "bar",
        "bars": "bar",
        "pub": "pub",
        "club": "club",

        //Fandango movietheater
        "movietheater": "movietheater",

        ////////////////////////
        //NYC.com attractions
        "touristattraction": "attraction",
        "museums": ["attraction", "museum"],
        "theaters": ["attraction", "theater"],
        "venues": ["attraction", "venue"],
        "historic city sites": ["attraction", "historic"],
        "parks": ["attraction", "park"],
        "art galleries": ["artgallery"],
        "universities": ["university"],
        "classical music & opera": ["theater", "opera", "concerthall"],
        "beaches": "beach",
        "zoos": "zoo",
        "amusement parks": "amusementpark",
        "botanical gardens": "botanicalgarden",

        //skipped since not denoting subtype
        //parades & festivals, tv show tapings, kid friendly, dance


        ////////////////////////
        //NYC.com nightlife
        "local hang out": ["hangout"],
        "wine bar": ["winebar", "bar"],
        "dive bar": ["divebar", "bar"],
        "hotel bars": ["hotelbar", "bar"],
        "live music": ["livemusic", "bar"],
        "sports bar": ["sportsbar", "bar"],
        "after work": ["afterwork", "bar"],
        "danceg club": ["danceclub", "club"],
        "lounge": ["lounge", "bar"],
        "gay & lesbian": ["gay", "bar"],
        "gay": ["gay", "bar"],
        "comedy club": ["comedyclub"],
        "billiards": "billiards",
        "jazz": ["jazzclub", "club"],
        "karaoke": ["karaoke", "bar"],
        "whiskey bars": ["whiskeybar", "bar"],
        "cabaret & revue": ["theater", "cabaret"],
        "cigar bar": ["cigarbar", "bar"],
        "cocktail bar": ["cocktailbar", "bar"],
        "mixology": ["cocktailbar", "bar"],
        "djs": ["dj", "danceclub", "bar"],
        "strip club": ["stripclub", "nightclub"],
        "piano bar": ["pianobar", "bar"],


        //////////////////////
        ///THIS IS WEIRD. LET'S NOT DO THIS. 
        ///THE TERM 'ROMANTIC' IS NOT ENOUGH TO MAKE IT A BAR. 
        ///IT *IS* FOR NYC.COM BUT THIS IS *NOT* GENERALLY APPLICABLE.
        //These are just tagged as bar (in addition to added as genre)
        // "upscale": "bar",
        // "hot spot": "bar",
        // "outdoor seating": "bar",
        // "romantic": "bar",
        // "singles": "bar",
      },

      FoodEstablishment: {

        //TODO: map cuisines that we want

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

    //all values (independent of type) including their aliases and parents 
    //IMPORTART FOR SUBTYPES: use the schema.org subtype names as keys
    vocabulary: {

      /////////////////
      ///TYPE ALIASES
      "event": ["event", "happening"],
      "placewithopeninghours": ["place", "venue", "local business", "business"],
      "creativework": ["creativework", "creative work"],
      "organizationandperson": ["organization", "person"],

      //Place
      "movie": ["movie", "film"],
      "movietheater": ["movietheater", "movie theater"],
      "screeningevent": ["screeningevent", "movie screening"],

      ///////////////////
      ///restaurants
      "restaurant": ["restaurant", "eatery", "diner"],
      "bistro": ['bistro'],
      "bar": ["bar"],
      "pub": "pub",
      "club": "club",


      //cuisine (NYC.com)
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


      //////////////////
      //attractions
      "attraction": ["attraction", "tourist attraction"],
      "museum": "museum",
      "theater": "theater",
      "venue": "venue",
      "historic": ["historic", "site", "historic site"],
      "park": "park",
      "artgallery": ["art gallery", "art galleries", "gallery", "galleries"], //complex plural
      "university": ["university", "universities"], //complex plural
      "opera": ["opera", "opera house"],
      "concerthall": ["concerthall", "concert hall"],
      "beach": "beach",
      "zoo": "zoo",
      "amusementpark": ["amusement park", "amusementpark"],
      "botanicalgarden": "botanical garden",


      /////////////
      ///nightlife
      "hangout": ["hangout", "hang out"],
      "winebar": ["wine bar", "bar"],
      "divebar": ["dive bar", "bar"],
      "hotelbar": ["hotel bar", "bar"],
      "lounge": ["lounge", "bar"],
      "livemusic": ["live music", "bar"],
      "sportsbar": ["sports bar", "bar"],
      "afterwork": ["afterwork", "bar", "after work"],
      "danceclub": ["danceclub", "club", "dance club", "clubbing"],
      "gay": ["gay", "gay lesbian", "gay and lesbian", "lgbt", "gay bar"],
      "comedyclub": ["comedyclub", "comedy club", "comedy"],
      "billiards": "billiards",
      "jazzclub": ["jazz", "jazzclub", "jazz club"],
      "karaoke": ["karaoke", "karaoke bar", "bar", "karaoke club"],
      "whiskeybar": ["whiskey bar"],
      "cabaret": ["cabaret", "revue"],
      "cigarbar": ["cigarbar", "cigar", "cigars", "cigar bar", "bar"],
      "cocktailbar": ["mixology", "cocktailbar", "cocktail bar", "cocktails", "cocktail"],
      "dj": ["dj"],
      "stripclub": ["stripclub", "strip club", "vice"],
      "nightclub": ["nightclub", "night club"],
      "pianobar": ["pianobar", "piano bar", "bar"],



      ///////////////
      ///events
      //adding for coverage in frontend (even if no entities yet)
      "danceevent": ["dance", "clubbing", "concert"],
      "festival": ["festival", "concert"],
      "musicevent": ["musicevent", "concert", "music event"],

    }
  };


  //Add all schema.org types on level of roots
  //This results in, say exports.vocabulary.PlaceWithOpeninghours to contain all subtypes lowercased
  _.each(generatedSchemas.types, function (val, typeName) {

    var rootsOfType = _.intersection([typeName].concat(val.ancestors), roots);
    if (!rootsOfType.length) return; //not avail for toplevel such as Things and Intangible

    typeName = typeName.toLowerCase();

    var rootName = rootsOfType[rootsOfType.length - 1];
    var rootMap = exports.sourceMappings[rootName] = exports.sourceMappings[rootName] || {};
    rootMap[typeName] = typeName;
    exports.vocabulary[typeName] = _.uniq((exports.vocabulary[typeName] || []).concat([typeName]));
  });

  return exports;
};
