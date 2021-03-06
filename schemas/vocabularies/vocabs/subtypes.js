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
        "movie": "movie",
      },

      Event: {
        ////////////////
        //fandango
        "screeningevent": ["event", "screeningevent"],

        //////////////
        //seatgeek, et al
        "comedyevent": ["event","comedyevent"],
        "danceevent": ["event","danceevent"],
        "literaryevent": ["event","literaryevent"],
        "musicevent": ["event","musicevent"],
        "sportsevent": ["event","sportsevent"],
        "theaterevent": ["event","theaterevent"],
        
        ////////////////
        //coursehorse
        "educationevent": ["event","educationevent"],

        ///////////////////
        //eventful events
        
        //TBD: animals, art, attractions, clubs_associations, community
        //food, fundraisers, holiday, other, outdoors_recreation
        //politics_activism, religion_spirituality
        //sales, schools_alumni, science, singles_social, support, technology
        "art": ["event", "exhibitionevent"],
        "books": ["event","literaryevent"],
        "comedy": ["event","comedyevent"],
        "business": ["event","businessevent"],
        "conference": ["event","businessevent", "conference"],
        "family_fun_kids": ["event", "funevent", "childrensevent", "familyevent"],
        "festivals_parades": ["event", "festival", "parade"],
        "learning_education": ["event","educationevent"],
        "movies_film": ["event", "screeningevent"],
        "music": ["event", "musicevent"],
        "performing_arts": ["event","theaterevent"], 
        "sports": ["event", "sportsevent"],
        "food": ["event", "foodevent"],
        "sales": ["event", "salevent"]
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
        "historic city sites": ["attraction", "historicsite"],
        "parks": ["attraction", "park"],
        "art galleries": ["artgallery"],
        "universities": ["university"],
        "classical music & opera": ["theater", "opera", "concerthall"],
        "beaches": "beach",
        "zoos": "zoo",
        "amusement parks": "amusementpark",
        "botanical gardens": "botanicalgarden",

        //skipped since not denoting subtype
        //tv show tapings, kid friendly, dance


        ////////////////////////
        //NYC.com nightlife
        "local hang out": ["hangout"],
        "wine bar": ["bar", "winebar", ],
        "dive bar": ["bar", "divebar"],
        "hotel bars": ["bar", "hotelbar"],
        "live music": ["bar", "livemusic"],
        "sports bar": ["bar", "sportsbar"],
        "after work": ["bar", "afterwork"],
        "danceg club": ["danceclub", "club"],
        "lounge": ["bar", "lounge"],
        "gay & lesbian": ["bar", "gay"],
        "gay": ["bar", "gay"],
        "comedy club": ["comedyclub"],
        "billiards": "billiards",
        "jazz": ["jazzclub", "club"],
        "karaoke": ["bar", "karaoke"],
        "whiskey bars": ["bar", "whiskeybar"],
        "cabaret & revue": ["theater", "cabaret"],
        "cigar bar": ["bar", "cigarbar"],
        "cocktail bar": ["bar", "cocktailbar"],
        "mixology": ["bar", "cocktailbar"],
        "djs": ["bar", "dj", "danceclub"],
        "strip club": ["stripclub", "nightclub"],
        "piano bar": ["bar", "pianobar"],


      },

      FoodEstablishment: {

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
      "historicsite": ["historic site"],
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
      "winebar": ["bar", "wine bar"],
      "divebar": ["bar", "dive bar"],
      "hotelbar": ["bar", "hotel bar"],
      "lounge": ["bar", "lounge"],
      "livemusic": ["bar", "live music"],
      "sportsbar": ["bar", "sports bar"],
      "afterwork": ["bar", "afterwork", "after work"],
      "danceclub": ["danceclub", "club", "dance club", "clubbing"],
      "gay": ["gay", "gay lesbian", "gay and lesbian", "lgbt", "gay bar"],
      "comedyclub": ["comedyclub", "comedy club", "comedy", "comedies"],
      "billiards": "billiards",
      "jazzclub": ["jazz", "jazzclub", "jazz club"],
      "karaoke": ["bar", "karaoke", "karaoke bar", "karaoke club"],
      "whiskeybar": ["whiskey bar"],
      "cabaret": ["cabaret", "revue"],
      "cigarbar": ["bar", "cigarbar", "cigar", "cigars", "cigar bar"],
      "cocktailbar": ["mixology", "cocktailbar", "cocktail bar", "cocktails", "cocktail"],
      "dj": ["dj"],
      "stripclub": ["stripclub", "strip club", "vice"],
      "nightclub": ["nightclub", "night club"],
      "pianobar": ["bar", "pianobar", "piano bar"],



      ///////////////
      ///events
      "comedyevent": ["comedy", "comedies"],
      "danceevent":["music", "dance", "clubbing", "concert"],
      "musicevent": ["music", "musicevent", "concert", "music event"],
      "literaryevent": ["literary"],
      "sportsevent": ["sports"],
      "theaterevent": ["theater", "perfoming arts"],

      //coursehores
      "educationevent": ["education event", "course event"],

      //eventful
      "exhibitionevent": ["exhibition", 'art'],
      "businessevent": ["businessevent", "business event", "business"],
      "conference": ["conference"],
      "funevent": ["fun"],
      "childrensevent": ["childrensevent", "children", "kids"], //official schema.org
      "familyevent": ["family"],
      "festival": ["festival"],
      "parade": ["parade"], 
      "foodevent": ["food event", "foodevent", "food"],
      "salevent": ["salevent", "sale", "sales", "sale event"]
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
    rootMap[typeName] = [typeName];

    //make array of existing vocab
    if(exports.vocabulary[typeName]){
      var existingVal = exports.vocabulary[typeName]; 
      existingVal = _.isArray(existingVal) ? existingVal : [existingVal];
      exports.vocabulary[typeName] = existingVal;
    }
    exports.vocabulary[typeName] = _.uniq((exports.vocabulary[typeName] || []).concat([typeName]));
  });
  return exports;
};
