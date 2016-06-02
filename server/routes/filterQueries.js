var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

var subtypeToFilterQuery = require("../queryGen/fakeNLP").subtypeToFilterQuery;
var nlpQueryGeneratorFn = require("../nlp/queryGen");

var middleware = {
  superSweetNLP: function (command) {

    var nlpQueryGenerator = nlpQueryGeneratorFn(command);

    return function superSweetNLP(req, res, next) {

      function oldNLP() {
        var lowerBodySplit = _.compact(req.body.question.toLowerCase().split(" ")); //remove empty
        var err;

        if (!lowerBodySplit.length) {
          err = new Error("Not sure what you mean! try to search for something like `movie theater` or `events`");
          err.status = 400;
          return next(err);
        }

        //lookup on type
        var termFound;
        var filterContext = _.reduce(lowerBodySplit, function (agg, term) {
          if (agg) return agg; //if already found
          var fc = subtypeToFilterQuery[term];
          if (fc) {
            termFound = term;
          }
          return fc;
        }, null);

        //if type no found to a 'all-type' query which is later on separated
        //Also make sure 'filter' object exists
        filterContext = _.defaults(filterContext || {}, {
          filter: {},
          type: "all"
        });

        //termFound was used for type-lookup. Remove that for lookup of name
        if (termFound) {
          lowerBodySplit = _.difference(lowerBodySplit, [termFound]);
        }

        if (lowerBodySplit.length) {
          filterContext.filter.name = lowerBodySplit.join(" ").trim();
        }

        _.extend(req.body, filterContext, {
          wantUnique: false
        });

        next();
      }

      if (!req.type && req.body.question !== undefined) {

        var question = req.body.question;

        nlpQueryGenerator.createQueryPlan(question)
          .then(function (filterContextOrFallback) {

            //only show nlp meta
            if (req.body.nlpMetaOnly) {
              var meta = filterContextOrFallback.doFallback ? filterContextOrFallback : filterContextOrFallback.nlpMeta;
              return res.json(meta);
            }
            if (filterContextOrFallback.doFallback) {
              return oldNLP();
            }
            console.log("NLP GENERATED FILTERCONTEXT", filterContextOrFallback);
            _.extend(req.body, filterContextOrFallback);
            next();
          })
          .catch(function (err) {
            err.status = 400;
            next(err);
          });

      } else {
        next();
      }

    };
  }
};


module.exports = function (command) {

  var app = command.app;
  var config = command.config;
  var generatedSchemas = command.generatedSchemas;
  var r = command.r;
  var erdEntityTable = command.erdEntityTable;
  var filterQueryUtils = command.filterQueryUtils;
  var roots = command.roots;

  //used by Answer page. 
  app.post('/question', middleware.superSweetNLP(command), function (req, res, next) {

    //always include cardFormatting
    var command = _.extend({}, req.body, {
      includeCardFormatting: true
    });

    //typeless query -> should be split multiple typed queries
    var filterQueries;
    try {

      if (command.type === "all") {

        //group filter queries by type
        filterQueries = _.map(filterQueryUtils.fixedTypesInOrder, function (type) {
          return filterQueryUtils.createFilterQuery(_.defaults({
            type: type
          }, command));
        });
      } else {
        //temporary way of adding related filter queries
        filterQueries = createRelatedFilterQueries(filterQueryUtils.createFilterQuery(command));
      }
    } catch (err) {
      return next(err);
    }

    var promises = _.map(filterQueries, function (filterQuery) {
      return Promise.resolve()
        .then(function () {
          //perform query
          return filterQuery.performQuery();
        })
        .then(cardViewModel.createDTOS({
          filterContext: filterQuery,
          includeCardFormatting: command.includeCardFormatting
        }))
        .then(function (result) {
          return result;
        });
    });

    return Promise.all(promises)
      .then(function (jsons) {

        var outputJson = {};

        //add nl-stuff for debugging
        if (req.body.nlpMeta) {
          outputJson.meta = {
            nlp: req.body.nlpMeta
          };
        }
        outputJson.results = jsons;


        console.log("ANSWER response with attribs", _.keys(outputJson));

        res.json(outputJson);

      })
      .catch(function (err) {
        err.filterQuery = req.filterQuery;
        return next(err);
      });
  });


  //quick search returning results on every kepress
  //Used in
  //- collection "add dialog"
  app.post('/suggest', function (req, res, next) {

    var body = req.body;
    var err;
    if (!body.query) {
      err = new Error("'query' body param required");
      err.status = 400;
      return next(err);
    }

    var types = _.keys(filterQueryUtils.rootsLowerCaseMap);
    if (body.type) {
      var type = body.type.toLowerCase();
      if (filterQueryUtils.rootsLowerCaseMap[type]) {
        types = [type];
      } else {
        err = new Error("'type' body param should be one of existing types: " + types.join(","));
        err.status = 400;
        return next(err);
      }
    }

    //compound all indices together that we want to query
    var indexString = _.map(types, function (type) {
      return "kwhen-" + type;
    }).join(",");

    //create suggest body. 
    //This consists of a group per type
    var esBody = _.reduce(types, function (agg, type) {
      var rootCorrectCase = filterQueryUtils.rootsLowerCaseMap[type];
      agg[rootCorrectCase] = {
        completion: {
          field: "suggest",
          context: {
            root: rootCorrectCase
          }
        }
      };
      return agg;
    }, {
      "text": body.query
    });

    command.esClient.suggest({
        index: indexString,
        body: esBody
      })
      .then(function (esResult) {
        delete esResult._shards;

        res.json(_.reduce(esResult, function (agg, groupForType, typeName) {
          if (groupForType[0].options.length) {
            agg[typeName] = groupForType[0].options;
          }
          return agg;
        }, {}));
      })
      .catch(function (err) {
        console.log(err);
        next(err);
      });
  });


  //Search returns results on suggestion Enter
  //Used in
  //- collection "add dialog"
  //
  //Frontend needs to do a query per type.
  app.post('/suggestCards', function (req, res, next) {

    var body = req.body;
    var err;

    var types = _.keys(filterQueryUtils.rootsLowerCaseMap);
    if (body.type) {
      var type = body.type.toLowerCase();
      if (filterQueryUtils.rootsLowerCaseMap[type]) {
        types = [type];
      } else {
        err = new Error("'type' body param should be one of existing types: " + types.join(","));
        err.status = 400;
        return next(err);
      }
    }

    //pagination
    var page = body.page || 0;

    //create promises
    var promiseMap;
    try {
      promiseMap = _.reduce(types, function (agg, type) {
        var typeCorrectCase = filterQueryUtils.rootsLowerCaseMap[type.toLowerCase()];

        if (!typeCorrectCase) {
          err = new Error("'type' body param should be one of existing types: " + _.keys(filterQueryUtils.rootsLowerCaseMap).join(","));
          err.status = 400;
          throw err;
        }

        //if type no found to a 'all-type' query which is later on separated
        //Also make sure 'filter' object exists
        var command = _.extend({
          wantUnique: false,
          type: typeCorrectCase,
          includeCardFormatting: true,
          page: page,
          pageSize: body.type ? 10 : 5, //5 per page. Since we show multiple types, 
          sort: {
            type: "score"
          },
          meta: {
            includeCardFormatting: true
          }
        });

        //addq uery-param. Not
        if (body.query) {
          command.filter = {};
          //name.raw has enum-mapping: 1 token, lowercased. 
          //This allows to do prefix
          command.filter["name.raw"] = body.query.toLowerCase().trim();
        }

        var filterQuery = filterQueryUtils.createFilterQuery(command);
        command.filterContext = filterQuery;

        var singleReqPromise = Promise.resolve()
          .then(function () {
            //perform query
            return filterQuery.performQuery();
          })
          .then(function (json) {
            return {
              totalResults: json.meta.elasticsearch.hits.total,
              filterContext: command.filterContext,
              results: cardViewModel.conditionalEnrichWithCardViewmodel(command, json),
            };
          })
          .catch(function (err) {
            err.filterQuery = filterQuery;
            return err; //error passed as result
          });

        agg[typeCorrectCase] = singleReqPromise;
        return agg;
      }, {});

      return Promise.props(promiseMap)
        .then(function (json) {
          return res.json(json);
        });

    } catch (error) {
      next(error); //error sync -> 500
    }

  });


};


function createRelatedFilterQueries(filterQuery) {
  return [filterQuery, filterQuery, filterQuery];
}
