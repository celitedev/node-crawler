var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

var subtypeToFilterQueryBase = require("../filterQueryTemplates").subtypeToFilterQuery;
var searchQueryParser = require('../search_query_parser');
var searchQueryParserUtils = require('../search_query_parser/utils');
var humanContextHelper = require('../humanContextHelper');

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
      var filterKeywordWithoutType = searchQueryParserUtils.getFilteredKeywordWithoutType(parsedQuestion);
      var rawKeywordWithoutType = searchQueryParserUtils.getRawKeywordWithoutType(parsedQuestion);
      var dateFilter = searchQueryParserUtils.getDateFilter(parsedQuestion);
      var typeFilter = searchQueryParserUtils.getTypeFilter(parsedQuestion);
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

      if( typeFilter ){
        var nlpFilterContextProtos = subtypeToFilterQuery[typeFilter];

        if (nlpFilterContextProtos) {
          //can be array! E.g.: for movies, which would show movies as well as movie events
          nlpFilterContextProtos = _.isArray(nlpFilterContextProtos) ? nlpFilterContextProtos : [nlpFilterContextProtos];
          _.each(nlpFilterContextProtos, function (nlpFilterContextProto) {
            var nlpFilterContext = {
              filter: {},
              wantUnique: false
            };

            //set final question (may override)
            var finalQuestion = searchQueryParserUtils.getFilteredKeywordWithoutType(parsedQuestion, nlpFilterContextProto.type);

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
                finalQuestion = rawKeywordWithoutType;
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
                finalQuestion = rawKeywordWithoutType;
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

        if( searchQueryParserUtils.getFilteredKeyword(parsedQuestion, filterContext.type) && !((organizationAndPersonFilter && filterContext.type == 'OrganizationAndPerson') || ((placeWithOpeningHoursFilter || locationFilter) && filterContext.type == 'PlaceWithOpeninghours')) ){
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
          filterContext.humanContext = humanContextHelper.keywordTemplate( subtypeToFilterQuery[root.toLowerCase()].label, searchQueryParserUtils.getFilteredKeyword(parsedQuestion, filterContext.type) );
        } else {
          filterContext.humanContext = humanContextHelper.typeTemplate( subtypeToFilterQuery[root.toLowerCase()].label );
        }

        return filterContext;
      }));

      //re-order for NER if no named types are present
      // if( hasNLPFilter && !nlpFilterContextProtos ){
      //     if( organizationAndPersonFilter && !placeWithOpeningHoursFilter ){
      //       filterContexts.splice(0,0,filterContexts.splice(filterContexts.indexOf(_.find(filterContexts, {'type': "OrganizationAndPerson"})),1)[0])
      //     }
      //     if( placeWithOpeningHoursFilter && !organizationAndPersonFilter ){
      //       filterContexts.splice(0,0,filterContexts.splice(filterContexts.indexOf(_.find(filterContexts, {'type': "PlaceWithOpeninghours"})),1)[0])
      //     }
      // }

      return filterContexts;
    };

    return function (req, res, next) {
      ensureQuestion(req.body, next); //check that we have a question or a type / filtercontext - if we have a type but no question, we move on from here and skip the rest of this
      searchQueryParser.parseQuestion(req.body.question.trim())
        .then(function(result){
          console.log("question: ", result); // DEBUG
          command.filterQueryUtils.saveSearchQueryHistory(req.body.question.trim(), result);
          req.body.filterContexts = createFilterContexts(JSON.parse(result));
          console.log(JSON.stringify(req.body.filterContexts, null, 2)); //DEBUG
          next();
        })
        .catch(function(err){
          next(err);
        });
    };
  }
};

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
