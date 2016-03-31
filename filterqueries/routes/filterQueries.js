var _ = require("lodash");
var Promise = require("bluebird");
var colors = require("colors");

var domainUtils = require("../../schemas/domain/utils");
var domainConfig = require("../../schemas/domain/_definitions/config");
var roots = domainConfig.domain.roots;

var cardViewModel = require("../cardViewModel");
var FilterQuery;

function createRelatedFilterQueries(filterQuery) {
  return [filterQuery, filterQuery, filterQuery];
}

//This map statically defines per type which references should be expanded
var expandMap = {
  Event: [
    "location.containedInPlace",
    "location",
    "workFeatured"
  ]
};

var middleware = {
  createFilterQuery: function createFilterQuery(req, res, next) {
    if (!req.body.sort) {
      throw new Error("sort required");
    }
    req.body.sort = _.isArray(req.body.sort) ? req.body.sort : [req.body.sort];

    //create filterQuery object
    req.filterQuery = FilterQuery(req.body);

    //asserts
    if (!~roots.indexOf(req.filterQuery.type)) {
      throw new Error("filterQuery.type should be a known root: " + roots.join(","));
    }

    next();
  },
  addExpand: function addExpand(req, res, next) {
    req.body.meta = req.body.meta || {};
    req.includeCardFormatting = req.body.meta.includeCardFormatting || req.query.includeCardFormatting;

    if (req.includeCardFormatting) {

      var type = req.body.type;

      if (!type) {
        next(new Error("'type' not defined. Needed if 'includeCardFormatting' defined "));;
      }

      var refs = req.body.meta.refs = req.body.meta.refs || {};

      //Create the expand map automatically as default
      refs.expand = refs.expand || expandMap[type];

      if (!refs.expand) {
        next(new Error("'type' not found in auto-expand map. Used for 'includeCardFormatting=true'. For type: " + type));;
      }
    }
    next();
  }
};



function conditionalEnrichWithCardViewmodel(req, json) {
  if (!req.includeCardFormatting) {
    return json.hits;
  }
  var results = _.map(json.hits, function (hit) {
    var obj = {
      raw: hit,
      formatted: {}
    };
    return cardViewModel.enrichViewModel(obj, json.expand);
  });

  return results;
}


module.exports = function (command) {

  var app = command.app;
  var config = command.config;
  var generatedSchemas = command.generatedSchemas;
  var r = command.r;
  var erdEntityTable = r.table(domainUtils.statics.ERDTABLE);

  //ERD
  var erdMappingConfig = require("../../schemas/erd/elasticsearch")(generatedSchemas);

  FilterQuery = require("../queryGen/FilterQuery")({
    r: command.r,
    erdEntityTable: erdEntityTable,
    erdMappingConfig: erdMappingConfig,
    filterQueryUtils: require("../utils")(generatedSchemas, r),
    esClient: command.esClient,
  });

  app.get('/', function (req, res) {
    res.send('Use POST silly');
  });

  //Single Item
  app.get("/entities/:id", middleware.addExpand, function (req, res, next) {

    Promise.resolve()
      .then(function () {
        return erdEntityTable.get(req.params.id);
      })
      .then(function (entity) {
        return erdMappingConfig.cleanupRethinkDTO(entity);
      })
      .then(function (entity) {

        if (req.includeCardFormatting) {

          //TODO: 
          //- define a static list of refs per subtype, needed to render said subtype. 
          //e.g.: event -> workFeatured, location, location.containedInPlace. 
          //This is needed to render the card. 
        }

        res.json({
          result: entity,
          expand: {}
        });
      });
  });


  //used by Search page. 
  app.post('/search', middleware.addExpand, middleware.createFilterQuery, function (req, res, next) {

    var filterQuery = req.filterQuery;

    return Promise.resolve()
      .then(function () {
        //perform query
        return filterQuery.performQuery();
      })
      .then(function transformResults(json) {

        var dto = {
          query: {
            //TODO: what is this used for?
          },

          //TODO: actual filterContext from question. Used for: 
          //- creating link to search
          //- possibly showing pills/tags
          filterContext: {
            filters: {
              subtype: "Bar",
              neighborhood: "Soho"
            },
            sort: {
              userProximity: "asc"
            }
          },
          results: conditionalEnrichWithCardViewmodel(req, json),
          expand: json.expand,
          meta: json.meta
        };

        return dto;
      })
      .then(function returnDTO(dto) {

        res.json(dto);
      })
      .catch(function (err) {
        err.filterQuery = filterQuery;
        return next(err);
      });
  });

  //used by Answer page. 
  app.post('/question', middleware.addExpand, middleware.createFilterQuery, function (req, res, next) {

    //create related filter queries.
    var filterQueries = createRelatedFilterQueries(req.filterQuery);

    var promises = _.map(filterQueries, function (filterQuery) {
      return Promise.resolve()
        .then(function () {

          //perform query
          return filterQuery.performQuery();

        })
        .then(function transformResults(json) {

          var dto = {
            query: {
              //TODO: what is this used for?
            },
            answerNLP: "TODO: below should be a DIFFERENT filtercontext. It's not very useful now", //TODO

            //TODO: actual filterContext from question. Used for: 
            //- creating link to search
            //- possibly showing pills/tags
            filterContext: {
              filters: {
                subtype: "Bar",
                neighborhood: "Soho"
              },
              sort: {
                userProximity: "asc"
              }
            },
            results: conditionalEnrichWithCardViewmodel(req, json),
            expand: json.expand,
            meta: json.meta
          };

          return dto;
        });
    });

    return Promise.all(promises)
      .then(function (jsons) {

        var firstFilterResult = jsons.shift();

        var outputJson = _.extend(firstFilterResult, {
          related: jsons
        });

        res.json(outputJson);

      })
      .catch(function (err) {
        err.filterQuery = req.filterQuery;
        return next(err);
      });
  });


};
