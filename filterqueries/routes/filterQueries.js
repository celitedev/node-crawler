var _ = require("lodash");
var Promise = require("bluebird");
var colors = require("colors");

var domainUtils = require("../../schemas/domain/utils");
var domainConfig = require("../../schemas/domain/_definitions/config");
var roots = domainConfig.domain.roots;

var cardViewModel = require("../cardViewModel");
var FilterQuery;

var subtypeToFilterQuery = require("../queryGen/fakeNLP").subtypeToFilterQuery;

function createRelatedFilterQueries(filterQuery) {
  return [filterQuery, filterQuery, filterQuery];
}

//This map statically defines per type which references should be expanded
var expandMap = {
  Event: [
    "location.containedInPlace",
    "location",
    "workFeatured"
  ],
  PlaceWithOpeninghours: [],
  CreativeWork: []
};


//used for answer and search
function createDTOS(command) {
  return function (json) {

    return {
      results: {

        query: {
          //TODO: what is this used for?
        },
        answerNLP: "TODO: below should be a DIFFERENT filtercontext. It's not very useful now", //TODO

        filterContext: command.filterContext,

        //conditionally enrich results with cardViewModel
        results: conditionalEnrichWithCardViewmodel(command, json),

        totalResults: json.meta.elasticsearch.hits.total,

        expand: json.expand,

        meta: json.meta
      },
      original: json
    };
  };
}



function enrichWithSchema(command) {
  return function (combinedResult) {

    //combinedResult.original contains the original results from query
    //keys: hits, expand, meta.

    return _.extend(combinedResult.results, {
      schema: {
        sort: [{
          name: "userProximity",
          label: "proximity to user",
          isAcending: true, //ascending or decending,
          help: "tooltip with more help" //optiona;
        }, {
          name: "rating",
          label: "rating",
          isAcending: true //ascending or decending,
        }],

        filters: [{
          name: "subtypes",
          label: "type", //used for display
          type: "enum",
          values: [{
            val: "Movietheater",
            nr: combinedResult.results.totalResults
          }, {
            val: "Restaurant",
            nr: 42
          }, {
            val: "Bar",
            nr: 13
          }]
        }, {
          name: "neighborhood",
          label: "neighborhood",
          help: "what neighborhood bla bla description", //used for tooltip
          type: "enum",
          values: [{
            val: "Soho",
            nr: 48
          }, {
            val: "Brooklyn",
            nr: 38
          }, {
            val: "Astoria",
            nr: 38
          }, {
            val: "Brooklyn",
            nr: 38
          }, {
            val: "Astoria",
            nr: 38
          }, {
            val: "Brooklyn",
            nr: 38
          }, {
            val: "Astoria",
            nr: 38
          }]
        }, {
          name: "price",
          label: "price range", //used for display
          type: "range",
          min: 10,
          max: 5000,
          prefix: '$',
          postfix: ''
        }]
      }
    });
  };
}

function conditionalEnrichWithCardViewmodel(command, json) {
  if (!command.includeCardFormatting) {
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

var middleware = {
  superSweetNLP: function superSweetNLP(req, res, next) {
    if (!req.type && req.body.question !== undefined) { //change question into filtercontext if filtercontext not already present

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

      //if type no found to a 'all-type' query
      //Also make sure 'filter' object exists
      filterContext = _.defaults(filterContext || {}, {
        type: "all",
        filter: {}
      });

      //termFound was used for type-lookup. Remove that for lookup of name
      if (termFound) {
        lowerBodySplit = _.difference(lowerBodySplit, [termFound]);
      }

      if (lowerBodySplit.length) {
        filterContext.filter.name = lowerBodySplit.join(" ").trim();
      }

      //Make a all types query. 
      //This will exectute on a separate code path, since we need to query 
      //multiple/all indices at the same time. 
      if (filterContext.type === "all") {
        var filterNames = _.keys(filterContext.filter);
        if (filterNames.length !== 1 || !filterContext.filter.name) {
          err = new Error("multi-type query only allowed with exactly 1 filter of type='name'");
          err.status = 400;
          return next(err);
        }
        filterContext.allTypesQuery = true;
      }

      _.extend(req.body, filterContext, {
        wantUnique: false
      });
    }
    next();
  },
  createFilterQuery: function createFilterQuery(req, res, next) {

    if (!req.body.type) {
      throw new Error("req.body.type shoud be defined");
    }

    req.body.page = req.body.page || 0;

    //default sort
    req.body.sort = req.body.sort || {
      type: "doc"
    };

    //sort is an array
    req.body.sort = _.isArray(req.body.sort) ? req.body.sort : [req.body.sort];

    req.body.filter = req.body.filter || req.body.filters; //filter and filters are both supported

    //create filterQuery object
    req.filterQuery = FilterQuery(req.body);

    //asserts
    if (!~roots.indexOf(req.filterQuery.type) && !req.filterQuery.allTypesQuery) {
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
      if (type === "all") {
        //HACK : need to hack this as well. Relates to #206
        refs.expand = refs.expand || _.uniq(_.reduce(expandMap, function (arr, v) {
          return arr.concat(v);
        }, []));

      } else {
        refs.expand = refs.expand || expandMap[type];
      }

      if (!refs.expand) {
        next(new Error("'type' not found in auto-expand map. Used for 'includeCardFormatting=true'. For type: " + type));;
      }
    }
    next();
  }
};


module.exports = function (command) {

  var app = command.app;
  var config = command.config;
  var generatedSchemas = command.generatedSchemas;
  var r = command.r;
  var erdEntityTable = r.table(domainUtils.statics.ERDTABLE);

  var filterQueryUtils = require("../utils")(generatedSchemas, r);

  //ERD
  var erdMappingConfig = require("../../schemas/es_schema")(generatedSchemas);

  FilterQuery = require("../queryGen/FilterQuery")({
    r: command.r,
    erdEntityTable: erdEntityTable,
    erdMappingConfig: erdMappingConfig,
    filterQueryUtils: filterQueryUtils,
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

        //if entity not found return a 404
        if (null) {
          var err = new Error("Entity not found");
          err.status = 404;
          throw err;
        }

        //fetch root and get the to-be-expanded fields
        var root = entity.root;
        var fieldsToExpand = expandMap[root];
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
        return conditionalEnrichWithCardViewmodel({
          includeCardFormatting: true
        }, json);
      })
      .then(function (entities) {

        if (!entities.length) {
          throw new Error("Sanity check: entities.length = 0 but we've found an entity before?!");
        }
        res.json(entities[0]);
      })
      .catch(function (err) {
        next(err);
      });
  });


  //used by Search page. 
  app.post('/search', middleware.addExpand, middleware.createFilterQuery, function (req, res, next) {

    var filterQuery = req.filterQuery;

    var command = {
      //NOTE: here filterQuery and filterContext are the same
      filterContext: filterQuery,
      includeCardFormatting: req.includeCardFormatting
    };

    return Promise.resolve()
      .then(function () {
        //perform query
        return filterQuery.performQuery();
      })
      .then(createDTOS(command))
      .then(enrichWithSchema(command))
      .then(function returnDTO(dto) {
        console.log("SEARCH response with attribs", _.keys(dto));
        res.json(dto);
      })
      .catch(function (err) {
        err.filterQuery = filterQuery;
        return next(err);
      });
  });

  //used by Answer page. 
  app.post('/question', middleware.superSweetNLP, middleware.addExpand, middleware.createFilterQuery, function (req, res, next) {

    //create related filter queries.
    var filterQueries = createRelatedFilterQueries(req.filterQuery);

    var promises = _.map(filterQueries, function (filterQuery) {
      return Promise.resolve()
        .then(function () {
          //perform query
          return filterQuery.performQuery();
        })
        .then(createDTOS({
          filterContext: filterQuery,
          includeCardFormatting: req.includeCardFormatting
        }))
        .then(function (combinedResult) {
          return combinedResult.results;
        });
    });

    return Promise.all(promises)
      .then(function (jsons) {

        var outputJson = {
          related: jsons
        };

        console.log("ANSWER response with attribs", _.keys(outputJson));

        res.json(outputJson);

      })
      .catch(function (err) {
        err.filterQuery = req.filterQuery;
        return next(err);
      });
  });


};
