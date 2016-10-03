var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

module.exports = function (command) {

  var app = command.app;
  var erdEntityTable = command.erdEntityTable;
  var sourceEntityTable = command.sourceEntityTable;
  var filterQueryUtils = command.filterQueryUtils;

  var filterContext = {};

  app.internalRoutes.getSuggestions = function(filter){



    return Promise.resolve()
      .then(function () {
        return erdEntityTable.get(filter.data.id);
      })
      .then(function (entity) {

        //if entity not found return a 404
        if (entity == null) {
          var err = new Error("Entity not found");
          err.status = 404;
          throw err;
        }
        console.log('Entity = ', entity);
        var entity = entity;
        var type = entity.root;
        filter.type = type;

        filterContext = filter;

        //fetch the expanded entities
        return Promise.resolve()
          .then(function () {
            try {
              var queries = filterQueryUtils.createSuggestionQueries(entity, filterContext);
              return queries;
            } catch (err) {
              throw err;
            }
          });
      })
      .then(function (queries) {
        console.log('suggestion Queries=  ', queries);
        return Promise.all(_.map(queries, function (query) {
          return query.performQuery();
        }));
      })
      .then(function (results) {
        console.log('suggestion results = ', results);

        return _.map(results, function(suggestion){

          if (suggestion.hits.length > 0)
          {
            var root = suggestion.hits[0].root;
            var fieldsToExpand = filterQueryUtils.expandMap[root];
            var expand = {};

            filterQueryUtils.recurseReferencesToExpand(suggestion, root, fieldsToExpand, expand);

            suggestion.expand = expand;

            var newSuggestions =  cardViewModel.conditionalEnrichWithCardViewmodel({
              includeCardFormatting: true
            }, suggestion);

            console.log("New suggestions: ", newSuggestions);

            return newSuggestions;
          } else
              return suggestion;
        });
      });
  };

  //Single Item
  app.post("/suggestions", function (req, res, next) {

    Promise.resolve()
      .then(function(){
        return app.internalRoutes.getSuggestions(req.body);
      })
      .then(function (entity) {
        res.json(entity);
      })
      .catch(function (err) {
        next(err);
      });
  });

};
