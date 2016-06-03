var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

var subtypeToFilterQuery = require("../fakeNLP").subtypeToFilterQuery;


/**
 * Each FilterContext is shown are 1 row. 
 * @type {Object}
 */

var middleware = {
  createFilterContextsFromQuestion: function (command) {

    var filterQueryUtils = command.filterQueryUtils;

    return function (req, res, next) {

      var err;

      //If body contains `type` we treat body as filterContext.
      //Optionally we might want to calculate closeby filterContexts. 
      // 
      //Alternatively, if body contains `filterContexts`
      if (req.body.filterContexts || req.body.type) {
        if (req.body.filterContexts && req.body.type) {
          err = new Error("body contains both 'type' and 'filterContexts'. These attributes are mutually exclusive");
          err.status = 400;
          return next(err);
        }

        //TODO: if req.type + req.calculateNearbyFilterContexts -> calculate nearby FC. 

        return next();
      }

      if (req.body.question === undefined) {
        err = new Error("body should either contain 'type', 'question' or 'filterContexts");
        err.status = 400;
        return next(err);
      }

      //PRE: Based on question we generate multiple FilterContexts. 
      //Strategy is as follows: 
      //
      // 1. we ALWAYS show 4 keyword-search based rows, 
      //for type= Event, PlaceWithOpeninghours, CreativeWork, OrganizationAndPerson in this order.
      //
      // 2. If the question contains one of the 4 above roots (or an alias) =>
      //Show the row for said root first. The remaining 3 rows are shown in fixed order
      //
      // 3. If the question contains a subtype (or an alias) =>
      //Show an ADDITIONAL row on top of the 4 rows, filtered on subtype.
      //
      // 4. If the question contains a subtype + a date/duration=>
      //Show an ADDITIONAL row on top of the 4 rows + the row shown based on point 3 above, filtered on subtype + date/duration


      //TODO: if type/subtype found (using subtypeToFilterQuery?)
      //-> remove from keyword search
      //-> apply as rules are per above

      var question = req.body.question.toLowerCase().trim();

      //ngrams from large to small and from back to front. 
      var ngrams = getNGramsInSizeOrder(question);
      var nlpContexts = [];

      var nlFilterContextProto,
        matchingNgram;

      //We try to match the ngram against all defined subtype aliases
      //If ngram ends in an 'n' we assume it's plural and also try to match to naive singular 'ngram - s'
      //the first match found is the one we're going with. 
      //Based on ordening we favour large subtypes that sit at the end of the question
      _.each(ngrams, function (ngram) {
        _.each(subtypeToFilterQuery, function (subtypeFilterContext, subtypeAlias) {
          if (nlFilterContextProto) return;
          if (ngram === subtypeAlias) {
            nlFilterContextProto = subtypeFilterContext;
            matchingNgram = ngram;
          }
        });
        if (nlFilterContextProto) return;
      });



      //If nlpFilterContext found -> create an extra row
      if (nlFilterContextProto) {

        //get the question without the matched nlp
        //The reamining stuff is the keyword search
        var questionExclNLPMatch = question.replace(matchingNgram, "");

        var nlpFilterContext = {
          filter: {},
          wantUnique: false,
        };

        if (questionExclNLPMatch) {
          nlpFilterContext.filter.name = questionExclNLPMatch;
        }
        _.merge(nlpFilterContext, nlFilterContextProto);

        nlpContexts.push(nlpFilterContext);
      }


      //Let's add the default rows
      var rootsInOrder = filterQueryUtils.fixedTypesInOrder;

      var filterContexts = nlpContexts.concat(_.map(rootsInOrder, function (root) {
        var filterContext = _.defaults(filterContext || {}, {
          type: root,
          filter: {
            name: question
          },
          wantUnique: false,
        });

        return filterContext;
      }));

      req.body.filterContexts = filterContexts;

      next();

    };
  }
};


function getNGramsInSizeOrder(text) {

  var atLeast = 1; // Show results with at least .. occurrences
  var numWords = 20; // Show statistics for one to .. words (20 should be enough)
  var ignoreCase = true; // Case-sensitivity
  var REallowedChars = /[^a-zA-Z'\-]+/g;


  var i, j, k, textlen, len, s;
  // Prepare key hash
  var keys = [null]; //"keys[0] = null", a word boundary with length zero is empty
  var results = [];
  numWords++; //for human logic, we start counting at 1 instead of 0
  for (i = 1; i <= numWords; i++) {
    keys.push({});
  }

  // Remove all irrelevant characters
  text = text.replace(REallowedChars, " ").replace(/^\s+/, "").replace(/\s+$/, "");

  // Create a hash
  if (ignoreCase) text = text.toLowerCase();
  text = text.split(/\s+/);
  for (i = 0, textlen = text.length; i < textlen; i++) {
    s = text[i];
    keys[1][s] = (keys[1][s] || 0) + 1;
    for (j = 2; j <= numWords; j++) {
      if (i + j <= textlen) {
        s += " " + text[i + j - 1];
        keys[j][s] = (keys[j][s] || 0) + 1;
      } else break;
    }
  }

  // Prepares results for advanced analysis
  for (var k = 1; k <= numWords; k++) {
    var key = keys[k];
    for (var i in key) {
      if (key[i] >= atLeast) {
        results.push(i);
      }
    }
  }

  results.reverse();
  return results;
}


module.exports = function (command) {

  var app = command.app;
  var filterQueryUtils = command.filterQueryUtils;

  //used by Answer page. 
  app.post('/question', middleware.createFilterContextsFromQuestion(command), function (req, res, next) {

    //Body contains either 'filterContexts' or is a filterContext itself

    var filterContexts = req.body.filterContexts || req.body;

    var filterQueries = _.map(_.isArray(filterContexts) ? filterContexts : [filterContexts], function (fc) {
      _.extend(fc, {
        includeCardFormatting: true,
        meta: {}
      });
      return filterQueryUtils.createFilterQuery(fc);
    });

    return Promise.map(filterQueries, function (filterQuery) {
        return Promise.resolve(filterQuery.performQuery())
          .then(cardViewModel.createDTOS({
            filterContext: filterQuery,
            includeCardFormatting: true
          }));
      })
      .then(function (jsons) {

        res.json({
          results: jsons
        });

      })
      .catch(function (err) {
        err.filterQuery = req.filterQuery;
        return next(err);
      });
  });
};


function createRelatedFilterQueries(filterQuery) {
  return [filterQuery, filterQuery, filterQuery];
}
