var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

var subtypeToFilterQuery = require("../queryGen/fakeNLP").subtypeToFilterQuery;

var middleware = {
  superSweetNLP: function (command) {

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

        console.log("FILTERCONTEXT", JSON.stringify(filterContext, null, 2));

        next();
      }

      if (!req.type && req.body.question !== undefined) {

        // var question = req.body.question;

        // nlpQueryGenerator.createQueryPlan(question)
        //   .then(function (filterContextOrFallback) {

        //     //only show nlp meta
        //     if (req.body.nlpMetaOnly) {
        //       var meta = filterContextOrFallback.doFallback ? filterContextOrFallback : filterContextOrFallback.nlpMeta;
        //       return res.json(meta);
        //     }
        //     if (filterContextOrFallback.doFallback) {
        //       return oldNLP();
        //     }
        //     console.log("NLP GENERATED FILTERCONTEXT", filterContextOrFallback);
        //     _.extend(req.body, filterContextOrFallback);
        //     next();
        //   })
        //   .catch(function (err) {
        //     err.status = 400;
        //     next(err);
        //   });

        return oldNLP();

      } else {
        next();
      }

    };
  }
};


module.exports = function (command) {

  var app = command.app;
  var filterQueryUtils = command.filterQueryUtils;

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
};


function createRelatedFilterQueries(filterQuery) {
  return [filterQuery, filterQuery, filterQuery];
}
