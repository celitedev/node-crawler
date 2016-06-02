var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

module.exports = function (command) {

  var app = command.app;
  var config = command.config;
  var generatedSchemas = command.generatedSchemas;
  var r = command.r;
  var erdEntityTable = command.erdEntityTable;
  var filterQueryUtils = command.filterQueryUtils;
  var roots = command.roots;

  //used by Search page. 
  app.post('/search', function (req, res, next) {

    //always do includeCardFormatting for simplicity
    var command = _.extend({}, req.body, {
      includeCardFormatting: true
    });

    var filterQuery;
    try {
      filterQuery = filterQueryUtils.createFilterQuery(command);
      command.filterContext = filterQuery;
    } catch (err) {
      return next(err);
    }

    return Promise.resolve()
      .then(function () {
        //perform query
        return filterQuery.performQuery();
      })
      .then(cardViewModel.createDTOS(command))
      .then(function returnDTO(dto) {
        res.json(dto);
      })
      .catch(function (err) {
        err.filterQuery = filterQuery;
        return next(err);
      });
  });
};
