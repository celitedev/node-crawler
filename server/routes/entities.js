var _ = require("lodash");
var Promise = require("bluebird");

var cardViewModel = require("../cardViewModel");

module.exports = function (command) {

  var app = command.app;
  var erdEntityTable = command.erdEntityTable;
  var sourceEntityTable = command.sourceEntityTable;
  var filterQueryUtils = command.filterQueryUtils;

  //Single Item
  app.get("/entities/:id", function (req, res, next) {

    Promise.resolve()
      .then(function () {
        return erdEntityTable.get(req.params.id);
      })
      .then(function (entity) {

        //if entity not found return a 404
        if (null) {
          var err = new Error("Entity not found");
          err.status = 404;
          throw err;
        }

        //fetch root and get the to-be-expanded fields
        var root = entity.root;
        var fieldsToExpand = filterQueryUtils.expandMap[root];
        var entities = [entity];
        var expand = {};

        if (!fieldsToExpand) {
          throw new Error("'type' not found in auto-expand map for type: " + root);
        }

        //fetch the expanded entities
        return Promise.resolve()
          .then(function () {
            return filterQueryUtils.recurseReferencesToExpand(entities, root, fieldsToExpand, expand);
          })
          .then(function () {
            return {
              hits: entities,
              expand: expand
            };
          });
      })
      .then(function (json) {
        return Promise.resolve()
          .then(function () {
            return cardViewModel.conditionalEnrichWithCardViewmodel({
              includeCardFormatting: true
            }, json);
          })
          .then(function (entities) {
            return entities[0];
          });
      })
      .then(function (entity) {
        return Promise.resolve()
          .then(function () {
            return sourceEntityTable.get(entity.raw.id);
          })
          .then(function (sourceEntity) {
            entity.raw.sources = [{
              sourceId: sourceEntity.id,
              name: sourceEntity._sourceType,
              url: sourceEntity._sourceUrl
            }];
          })
          .then(function () {
            return entity;
          });
      })
      .then(function (entity) {
        res.json(entity);
      })
      .catch(function (err) {
        next(err);
      });
  });


  //Fetch items in batch
  //
  //{
  //  ids: [ida, idb]
  //}
  app.post("/entities/actions/getBatch", function (req, res, next) {

    var ids = req.body.ids;

    Promise.resolve()
      .then(function fetchEntitiesFromERD() {
        return erdEntityTable.getAll.apply(erdEntityTable, ids);
      })
      .then(function enrichEntities(entities) {

        //Entities might not be uniform (have the same root). 
        //Therefore, we enrich each and every entity separately
        var promises = _.map(entities, function (entity) {

          var root = entity.root;
          var fieldsToExpand = filterQueryUtils.expandMap[root];
          var entityArrayOfOne = [entity];

          if (!fieldsToExpand) {
            throw new Error("'type' not found in auto-expand map for type: " + root);
          }

          var expand = {};
          return Promise.resolve()
            .then(function () {
              return filterQueryUtils.recurseReferencesToExpand(entityArrayOfOne, root, fieldsToExpand, expand);
            })
            .then(function () {
              return cardViewModel.conditionalEnrichWithCardViewmodel({
                includeCardFormatting: true
              }, {
                hits: entityArrayOfOne,
                expand: expand
              });
            })
            .then(function (entityArrayOfOne) {
              return entityArrayOfOne[0];
            });
        });

        return Promise.all(promises);

      })
      .then(function (entities) {
        res.json(entities);
      })
      .catch(function (err) {
        next(err);
      });
  });

};
