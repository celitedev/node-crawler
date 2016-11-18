var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

var subtypeToFilterQueryBase = require("../fakeNLP").subtypeToFilterQuery;
var searchQueryParser = require('../search_query_parser');
var searchQueryParserUtils = require('../search_query_parser/utils');
var humanContextHelper = require('../humanContextHelper');


/**
 * Each FilterContext is shown are 1 row. 
 * @type {Object}
 */

var middleware = {
  createFilterContextsFromQuestion: function (command) {

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

    var createFilterContexts = function(parsedQuestion){

      var filterQueryUtils = command.filterQueryUtils;

      //PRE: Based on question we generate multiple FilterContexts.

      // Get the query components we know about from Search Query Parser
      var filteredKeyword = searchQueryParserUtils.getFilteredKeyword(parsedQuestion);
      var rawKeyword = searchQueryParserUtils.getRawKeyword(parsedQuestion);
      var dateFilter = searchQueryParserUtils.getDateFilter(parsedQuestion);
      var organizationAndPersonFilter = searchQueryParserUtils.getOrganizationAndPersonFilter(parsedQuestion);
      var placeWithOpeningHoursFilter = searchQueryParserUtils.getPlaceWithOpeningHoursFilter(parsedQuestion);
      var locationFilter = searchQueryParserUtils.getLocationFilter(parsedQuestion);

      var hasNLPFilter = organizationAndPersonFilter || placeWithOpeningHoursFilter || locationFilter ;

      var subtypeToFilterQuery = _.cloneDeep(subtypeToFilterQueryBase);
      var defaultRoots = [].concat(filterQueryUtils.fixedTypesInOrder);
      var rootsInOrder = hasNLPFilter ? _.filter(defaultRoots, function(root) {
        var rootType = subtypeToFilterQuery[root.toLowerCase()];
        var includeType = true;
        if( organizationAndPersonFilter ){
          //this is really crude, but the schema calls for all kinds of data we don't have, so we are hardcoding this to check for a performer subtype
          includeType = rootType.type == 'OrganizationAndPerson' || filterQueryUtils.getRootMap(rootType.type).performer;
        }
        if( placeWithOpeningHoursFilter ){
          // another hack, the schema defines OrganizationAndPerson as having a location, but we do not index any location information for this type
          includeType = rootType.type == "PlaceWithOpeninghours" ||
            (filterQueryUtils.getRootMap(rootType.type).location && rootType.type != "OrganizationAndPerson") ||
            (rootType.type == "OrganizationAndPerson" && organizationAndPersonFilter);
        }

        return includeType;
      }) : defaultRoots;

      var nlpContexts = [];
      var reorderFallbackTypes = [];

      if( filteredKeyword ){
        var nlpFilterContextProtos = null;
        var matchingNgram = null;

        //We try to match the ngram against all defined subtype aliases
        //If ngram ends in an 'n' we assume it's plural and also try to match to naive singular 'ngram - s'
        //the first match found is the one we're going with.
        //Based on ordening we favour (1) large subtypes that (2) sit at the end of the question
        _.each(getNGramsInSizeOrder(filteredKeyword.toLowerCase()), function (ngram) {
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
        var questionWithPossiblyRemovedType = matchingNgram ? filteredKeyword.toLowerCase().replace(matchingNgram, "").trim() : filteredKeyword;
        var rawQuestionWithPossiblyRemovedType = matchingNgram ? rawKeyword.toLowerCase().replace(matchingNgram, "").trim() : rawKeyword;

        if (nlpFilterContextProtos) {
          //can be array! E.g.: for movies, which would show movies as well as movie events
          nlpFilterContextProtos = _.isArray(nlpFilterContextProtos) ? nlpFilterContextProtos : [nlpFilterContextProtos];
          _.each(nlpFilterContextProtos, function (nlpFilterContextProto) {
            var nlpFilterContext = {
              filter: {},
              wantUnique: false
            };

            //set final question (may override)
            var finalQuestion = questionWithPossiblyRemovedType;

            //add date filter
            if( dateFilter && nlpFilterContextProto.temporal ) nlpFilterContextProto.temporal = dateFilter;

            //add organizationandperson filter
            if( organizationAndPersonFilter ){
              //again we have to hardcode this instead of building it dynamically, because our ES schema only contains the organizationandperson
              // subtype of performer even though our entity schema contains many subtypes that are organizationandperson
              if( nlpFilterContextProto.type == 'OrganizationAndPerson' ){
                nlpFilterContext.filter['name.raw'] = {
                  text: organizationAndPersonFilter,
                  typeOfQuery: "Prefix",
                  typeOfMatch: "must"
                };
              } else if( filterQueryUtils.getRootMap(nlpFilterContextProto.type).performer ){
                nlpFilterContext.filter['performer--expand.name'] = {
                  text: organizationAndPersonFilter,
                  typeOfQuery: "Text",
                  typeOfMatch: "must"
                };
              } else {
                finalQuestion = rawQuestionWithPossiblyRemovedType;
              }
            }
            if( placeWithOpeningHoursFilter ){
              //again we have to hardcode this instead of building it dynamically
              if( nlpFilterContextProto.type == 'PlaceWithOpeninghours' ){
                nlpFilterContext.filter['name.raw'] = {
                  text: placeWithOpeningHoursFilter,
                  typeOfQuery: "Prefix",
                  typeOfMatch: "must"
                };
              } else if( filterQueryUtils.getRootMap(nlpFilterContextProto.type).location && nlpFilterContextProto.type != 'OrganizationAndPerson' ){
                nlpFilterContext.filter['location--expand.name'] = {
                  text: placeWithOpeningHoursFilter,
                  typeOfQuery: "Text",
                  typeOfMatch: "must"
                };
              } else {
                finalQuestion = rawQuestionWithPossiblyRemovedType;
              }
            }

            //add default freetext filter if none defined

            if(finalQuestion != ""){ //if there's still a keyword left...
              nlpFilterContext.filter.name = {
                text: finalQuestion,
                typeOfQuery: "FreeText",
                typeOfMatch: "must"
              };
              nlpFilterContext.humanContext = humanContextHelper.keywordTemplate(nlpFilterContextProto.label, finalQuestion);
            } else {
              nlpFilterContext.humanContext = humanContextHelper.typeTemplate(nlpFilterContextProto.label);
            }

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
      }

      //The ordinary/fallback rows
      var filterContexts = nlpContexts.concat(_.map(reorderFallbackTypes.concat(rootsInOrder), function (root) {

        //build filter context object template
        var filterContext = _.merge({
          filter: {},
          wantUnique: false,
        }, subtypeToFilterQuery[root.toLowerCase()]);

        if( dateFilter && filterContext.temporal ) filterContext.temporal = dateFilter;
        if( organizationAndPersonFilter ){
          //again we have to hardcode this instead of building it dynamically, because our ES schema only contains the organizationandperson
          // subtype of performer even though our entity schema contains many subtypes that are organizationandperson
          if( filterContext.type == 'OrganizationAndPerson' ){
            filterContext.filter['name.raw'] = {
              text: organizationAndPersonFilter,
              typeOfQuery: "Prefix",
              typeOfMatch: "must"
            };
          } else if( filterQueryUtils.getRootMap(filterContext.type).performer ){
            filterContext.filter['performer--expand.name'] = {
              text: organizationAndPersonFilter,
              typeOfQuery: "Text",
              typeOfMatch: "must"
            };
          }
        }
        if( placeWithOpeningHoursFilter ){
          if( filterContext.type == 'PlaceWithOpeninghours' ){
            filterContext.filter['name.raw'] = {
              text: placeWithOpeningHoursFilter,
              typeOfQuery: "Prefix",
              typeOfMatch: "must"
            };
          } else if( filterQueryUtils.getRootMap(filterContext.type).location && filterContext.type != 'OrganizationAndPerson' ){
            filterContext.filter['location--expand.name'] = {
              text: placeWithOpeningHoursFilter,
              typeOfQuery: "Text",
              typeOfMatch: "must"
            };
          }
        }
        if( locationFilter ){
          if( filterContext.type == 'PlaceWithOpeninghours' ){
            filterContext.filter['address.neighborhood'] = {
              text: locationFilter,
              typeOfQuery: "Text",
              typeOfMatch: "should",
              boost: 1000
            };
            filterContext.filter['address.addressLocality'] = {
              text: locationFilter,
              typeOfQuery: "Text",
              typeOfMatch: "should",
              boost: 1000
            };
          } else if( filterQueryUtils.getRootMap(filterContext.type).location && filterContext.type != 'OrganizationAndPerson' ){
            filterContext.filter['location--expand.address.neighborhood'] = {
              text: locationFilter,
              typeOfQuery: "Text",
              typeOfMatch: "should",
              boost: 1000
            };
            filterContext.filter['location--expand.address.addressLocality'] = {
              text: locationFilter,
              typeOfQuery: "Text",
              typeOfMatch: "should",
              boost: 1000
            };
          }
        }

        if( filteredKeyword && !((organizationAndPersonFilter && filterContext.type == 'OrganizationAndPerson') || ((placeWithOpeningHoursFilter || locationFilter) && filterContext.type == 'PlaceWithOpeninghours')) ){
          matchType = "must";
          boost = 1;
          if ( _.some(nlpFilterContextProtos, {type: filterContext.type}) ) {
            matchType = "should";
            boost = 1000;
          }
          filterContext.filter.name = {
            text: filteredKeyword,
            typeOfQuery: "FreeText",
            typeOfMatch: matchType,
            boost: boost
          };
          filterContext.humanContext = humanContextHelper.keywordTemplate( subtypeToFilterQuery[root.toLowerCase()].label, filteredKeyword );
        } else {
          filterContext.humanContext = humanContextHelper.typeTemplate( subtypeToFilterQuery[root.toLowerCase()].label );
        }

        return filterContext;
      }));

      //re-order for NER if no named types are present
      if( hasNLPFilter && !nlpFilterContextProtos ){
          if( organizationAndPersonFilter && !placeWithOpeningHoursFilter ){
            filterContexts.splice(0,0,filterContexts.splice(filterContexts.indexOf(_.find(filterContexts, {'type': "OrganizationAndPerson"})),1)[0])
          }
          if( placeWithOpeningHoursFilter && !organizationAndPersonFilter ){
            filterContexts.splice(0,0,filterContexts.splice(filterContexts.indexOf(_.find(filterContexts, {'type': "PlaceWithOpeninghours"})),1)[0])
          }
      }

      return filterContexts;
    };

    return function (req, res, next) {
      ensureQuestion(req.body, next); //check that we have a question or a type / filtercontext - if we have a type but no question, we move on from here and skip the rest of this
      searchQueryParser.parseQuestion(req.body.question.trim())
        .then(function(result){
          console.log("question: ", result); // DEBUG
          req.body.filterContexts = createFilterContexts(JSON.parse(result));
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
