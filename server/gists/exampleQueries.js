var example = {

  //
  //The query that was input by the user. 
  //This is echo'ed back in the response. 
  //
  //type=nlp -> query is a natural language query. This is used by the Answer Page
  //type=filterContext -> query is a filtercontext, i.e.: the underlying filters
  //to describe a query. This is used by the Search results page. 
  query: {
    type: "nlp",
    query: "what are the best budget italian restaurants open near me?"
  },

  //the answer in natural language form to display direclty on the answer page.
  answerNLP: "La cuisina and 25 other italian resturants are open near you now",

  //The backend translates a NLP (natural language) query to a filterContext representing
  //said natural language query. 
  //NOTE: if the input query is type=filterContext, then obviously this translation 
  //doesn't have to happen and the `filterContext` returned here is the same as the input 
  //FilterContext. 
  //
  //Usage: 
  //Answer page: this might be used by the frontend to display the filterContext as tags. 
  filterContext: {
    type: "Place",
    subtype: "restaurant",
    cuisine: "italian",
    spatial: {
      type: "nearUser"
    },
    tags: ["best", "budget"]
  },


  //The results (in the case italian restaurants) of the query. 
  //Notice: each result has a: 
  //- 'raw result', which are the facts as stored directly in the backend for this result
  //- 'formatted result', which displays the formatted result for each card subcomponent. 
  //
  //The formatted result can be used to easily populate the subcomponents of a card. 
  //THe raw result can be used to get to data which isn't normally displayed in a card, such 
  //as latitude/longitude info for use to display a marker on a map.
  results: [{
      //See Example B. for an example 
    }, {
      //...
    }
    //...
  ],

  //`related` contains the related questions. Each related question has (similar as above) a: 
  //- answerNLP
  //- filterContext
  //- results
  related: [{
      query: {
        type: "nlp",
        query: "what are the best mid-range italian restaurants open near me?"
      },
      answerNLP: "....",
      filterContext: { //...
      },
      results: [{
          //...
        }, {
          // ...
        },
        // ...
      ]
    }, {
      // ...
    },
    // ...
  ]

};


var singleResult = {

  //`raw` contains all info directly from backend. 
  //It can be used to get to data when `formatted` 
  //doesn't display it. For instance getting to latitude/longitude 
  //to create a marker on a map.
  raw: {
    name: "...",
    geo: {
      latitude: 50,
      longitude: 13,
    },
    all: "other",
    raw: "properties"
  },


  //formatted is used to populate cards
  //it contains info for *all* subcomponents, so each 
  //card-layout/template can be rendered with it. Some card-layout/templates 
  //don't display all subcomponents, that's not a big deal: 
  //we just don't use the data returned for that subcomponent. 
  //
  //General rule: we never return html-markup, only data. Sometimes we need to transform 
  //data to html-markup within a particular component, such as stars infobits1.stars -> ***
  //This is all straightforward it seems.
  formatted: {

    type: "French Restaurant",
    identifiers1: "Le Blue",
    identifiers2: ["10211, Upper Ease Side", "15 min by foot"],
    headsup1: "Open until 2am tonight",
    headsup2: "Today's special: coq au vin",
    infobits1: { //I'm pretty sure this is clear but...
      priceCategory: 3, //this needs some frontend logic to format price=3 -> $$$
      stars: 3 //similar: stars=3 -> *** 
    },
    infobits2: [
      //infobits row 2 is always text only and should probably be formatted as an unordered list (UL)
      //I don't want to go into this detail though. 
      "Fench Cuisine",
      "fancy",
      "cosy",
      "laidback"
    ],
    whyAmIShown: "", //NOT IN POC
    actions: "" //NOT IN POC
  }
};
