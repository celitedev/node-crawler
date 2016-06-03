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
      if (req.filterContexts || req.type) {
        if (req.filterContexts && req.type) {
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

      var rootsInOrder = filterQueryUtils.fixedTypesInOrder;

      var filterContexts = _.map(rootsInOrder, function (root) {

        var filterContext = _.defaults(filterContext || {}, {
          type: root,
          filter: {
            name: req.body.question
          },
          wantUnique: false
        });

        return filterContext;
      });

      req.body.filterContexts = filterContexts;

      next();

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
