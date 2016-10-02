var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

var subtypeToFilterQuery = require("../fakeNLP").subtypeToFilterQuery;
var searchQueryParser = require('../search_query_parser');


/**
 * Each FilterContext is shown are 1 row. 
 * @type {Object}
 */

var middleware = {
  createFilterContextsFromQuestion: function (command) {

    var filterQueryUtils = command.filterQueryUtils;

    var question;
    var parsedQuestion;

    //todo jim: abstract these out of the routes and into utils or something, once I'm done tearing them up
    var ensureQuestion = function(query, next){
      if (query.filterContexts || query.type) {
        if (query.filterContexts && query.type) {
          var err = new Error("body contains both 'type' and 'filterContexts'. These attributes are mutually exclusive");
          err.status = 400;
          return next(err);
        }
        return next();
      }
      if (query.question === undefined) {
        var err = new Error("body should either contain 'type', 'question' or 'filterContexts");
        err.status = 400;
        return next(err);
      }
    };

    var getDateFilter = function(){
      if ( parsedQuestion
        && parsedQuestion.sentences
        && parsedQuestion.sentences.length > 0
        && parsedQuestion.sentences[0].temporal_query_info
        && parsedQuestion.sentences[0].temporal_query_info.length > 0)
      {
        return parsedQuestion.sentences[0].temporal_query_info[0];
      }
    };

    var createFilterContexts = function(){

      //Let's add the default rows
      var rootsInOrder = [].concat(filterQueryUtils.fixedTypesInOrder); //clone

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
      // 4. Parse the data from search_query_parser, which at the moment only contains data information,
      // and add it to each of the filter contexts so it can be utilized in the query down the line


      //ngrams from large to small and from back to front.

      var ngrams = getNGramsInSizeOrder(question);
      var dateFilter = getDateFilter();
      var nlpContexts = [];

      var nlpFilterContextProtos,
        matchingNgram;

      //We try to match the ngram against all defined subtype aliases
      //If ngram ends in an 'n' we assume it's plural and also try to match to naive singular 'ngram - s'
      //the first match found is the one we're going with.
      //Based on ordening we favour (1) large subtypes that (2) sit at the end of the question
      _.each(ngrams, function (ngram) {
        var ngramSingular = ngram[ngram.length - 1] = 's' && ngram.substring(0, ngram.length - 1);
        _.each(subtypeToFilterQuery, function (subtypeFilterContext, subtypeAlias) {
          if (nlpFilterContextProtos) return;
          if (ngram === subtypeAlias || (ngramSingular && ngramSingular === subtypeAlias)) {
            nlpFilterContextProtos = subtypeFilterContext;
            matchingNgram = ngram;
          }
        });
        if (nlpFilterContextProtos) return;
      });

      //Get the question without the matched nlp. The reamining stuff is the keyword search
      //This is used for queries that filter on actual subtype
      var questionWithPossiblyRemovedType = matchingNgram ? question.replace(matchingNgram, "").trim() : question;

      var reorderFallbackTypes = [];

      if (nlpFilterContextProtos) {

        //can be array! E.g.: for movies, which would show movies as well as movie events
        nlpFilterContextProtos = _.isArray(nlpFilterContextProtos) ? nlpFilterContextProtos : [nlpFilterContextProtos];

        _.each(nlpFilterContextProtos, function (nlpFilterContextProto) {

          var nlpFilterContext = {
            filter: {},
            wantUnique: false,
          };

          //get subtype if exists or type otherwise to use in human feedback
          var typeOrSubtype = nlpFilterContextProto.filter.subtypes || nlpFilterContextProto.filter.type;
          typeOrSubtype = _.isArray(typeOrSubtype) ? typeOrSubtype[0] : typeOrSubtype;

          if (questionWithPossiblyRemovedType) { //if there's still a keyword left...

            nlpFilterContext.filter.name = questionWithPossiblyRemovedType;

            nlpFilterContext.humanContext = {
              templateData: {
                label: nlpFilterContextProto.label,
                keyword: questionWithPossiblyRemovedType
              },
              template: "<span class='accentColor'>{{nrOfResults}} <i>'{{keyword}}'</i>&nbsp;{{label.pluralOrSingular}}</span> {{label.sorted}} in NYC"
            };

          } else {

            nlpFilterContext.humanContext = {
              templateData: {
                label: nlpFilterContextProto.label,
              },
              template: "Showing all <span class='accentColor'>{{nrOfResults}} {{label.pluralOrSingular}}</span> {{label.sorted}} in NYC"
            };
          }

          if (dateFilter && nlpFilterContextProto.temporal) nlpFilterContextProto.temporal = dateFilter;

          nlpContexts.push(_.merge({}, nlpFilterContext, nlpFilterContextProto));

          //Get the fallback type that matches the nlpFilterContextProto
          //1. if nlpFilterContextProto DOES NOT contain a subtype (and thus matches a root) we'll remove the fallback
          //2. if nlpFilterContextProto DOES contain a subtype, we'll be sure to move the fallback row up in the order.
          var fallbackOfSameType = rootsInOrder.splice(rootsInOrder.indexOf(nlpFilterContextProto.type), 1)[0];

          if(nlpFilterContextProto.filter.subtypes){
            reorderFallbackTypes.push(fallbackOfSameType);
          }
        });
      }

      //todo jim left off here, the plan is:
      // look for temporal query info, add to filter context (will require changing the filter context structure most likely
      // if temporal query info, replace label.sorted with entity mention text, ask taylor for possible types
      // don't worry about removing the ner mentions yet, taylor will handle that

      //The ordinary/fallback rows
      return nlpContexts.concat(_.map(reorderFallbackTypes.concat(rootsInOrder), function (root) {

        var filterContext = _.merge({
          filter: {},
          wantUnique: false,
        }, subtypeToFilterQuery[root.toLowerCase()]);

        if (question) {
          filterContext.filter.name = question;

          filterContext.humanContext = {
            templateData: {
              label: subtypeToFilterQuery[root.toLowerCase()].label,
              keyword: question
            },
            template: "<span class='accentColor'>{{nrOfResults}} {{label.pluralOrSingular}}</span> for <i>'{{keyword}}'</i> {{label.sorted}} in NYC"
          };

        } else {

          filterContext.humanContext = {
            templateData: {
              label: subtypeToFilterQuery[root.toLowerCase()].label,
            },
            template: "Showing all <span class='accentColor'>{{nrOfResults}} {{label.pluralOrSingular}}</span>  {{label.sorted}} in NYC"
          };
        }

        if (dateFilter && filterContext.temporal) filterContext.temporal = dateFilter;

        return filterContext;
      }));

    };

    return function (req, res, next) {
      question = req.body.question.toLowerCase().trim();
      ensureQuestion(req.body, next); //check that we have a question or a type / filtercontext - if we have a type but no question, we move on from here and skip the rest of this
      searchQueryParser.parseQuestion(question)
        .then(function(result){
          parsedQuestion = JSON.parse(result);
          //console.log("question: ", parsedQuestion); // DEBUG
          req.body.filterContexts = createFilterContexts();
          //console.log(JSON.stringify(req.body.filterContexts, null, 2)); //DEBUG
          next();
        })
        .catch(function(err){
          next(err);
        });
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

    var promises = _.map(_.isArray(filterContexts) ? filterContexts : [filterContexts], function (filterContext) {

      //extend filterContext
      _.extend(filterContext, {
        includeCardFormatting: true,
        meta: {}
      });

      var humanContext = filterContext.humanContext;
      delete filterContext.humanContext;

      //create FilterQuery from FilterContext
      var filterQuery = filterQueryUtils.createFilterQuery(filterContext);

      return Promise.resolve(filterQuery.performQuery())
        .then(cardViewModel.createDTOS({
          filterContext: filterQuery,
          includeCardFormatting: true,
          humanContext: humanContext
        }));
    });

    return Promise.all(promises)
      .then(function (jsons) {

        jsons = _.filter(jsons, function(json){
          return json.totalResults; //not 0
        });

        if(!jsons.length){
          //no results
          return res.json({
            warningHuman: "Nothing quite matched your search for <i>\'"  + req.body.question + "\'</i>" +
            "&nbsp; We're working on it." 
          });
        }
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
