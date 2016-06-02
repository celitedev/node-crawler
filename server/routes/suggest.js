var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

module.exports = function (command) {

  var app = command.app;
  var filterQueryUtils = command.filterQueryUtils;

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
