var t = require("tcomb");
var _ = require("lodash");
var Promise = require("bluebird");
var moment = require("moment");
require("moment-timezone");

var domainConfig = require("../schemas/domain/_definitions/config");
var roots = domainConfig.domain.roots;

var DEFAULT_PAGESIZE = 10;
module.exports = function (command) {

  var r = command.r,
    erdEntityTable = command.erdEntityTable,
    erdMappingConfig = command.erdMappingConfig,
    filterQueryUtils = command.filterQueryUtils,
    esClient = command.esClient;

  var FilterQuery = t.struct({

    //A known root. This should be calculated out-of-band 
    type: t.String,

    //do we want a unique result or a list of results?
    wantUnique: t.Boolean,

    //How should we filter the returned results
    filter: t.maybe(t.Object),

    spatial: t.maybe(t.Object),

    temporal: t.maybe(t.Object),

    //return items similar to the items defined in filterObject. 
    //If similarTo and filter are both defined, similarTo is executed first
    similarTo: t.maybe(t.Object),

    //sort is always required. Also for wantUnique = true: 
    //if multiple values returned we look at score to see if we're confident
    //enough to return the first item if multiple items we're to be returned
    sort: t.Array,

    page: t.maybe(t.Number),

    meta: t.maybe(t.Object),

    pageSize: t.maybe(t.Number),

  }, 'FilterQuery');


  FilterQuery.prototype.getRoot = function () {
    return this.type;
  };

  FilterQuery.prototype.getESIndex = function (index) {
    return "kwhen-" + (index || this.getRoot()).toLowerCase();
  };

  FilterQuery.prototype.getSort = function () {

    var self = this;

    //possible TODO: 
    //- sort by nested: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-sort.html#nested-sorting
    //- sort by script: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-sort.html#_script_based_sorting
    //- track scores: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-sort.html#_track_scores
    return {
      sort: _.map(this.sort, function (s) {

        var esSort = {};

        function sortOnDistance() {
          //filter on geo

          //example
          // "sort": {
          //  "type": "distance",
          //  "path": "location",
          //  "geo": [-73.9764,
          //    40.7434
          //  ],
          //  "options": {
          //    unit: "km" //default = mi
          //  }
          // },

          if (!s.geo) {
            throw new Error("'geo'-attrib not defined on sort with type=distance||distanceUnser");
          }
          s.options = s.options || {};

          esSort._geo_distance = {

            unit: s.options.unit || "mi", //default 
            "ignore_unmapped" : true,
            order: s.asc === undefined ? "asc" : (s.asc ? "asc" : "desc"), //default to asc
            "distance_type": "plane" //quicker and accurate enough on small distances.
          };

          //e.g.: path = 'location' -> location.geo for event
          var path = s.path ? s.path + ".geo" : "geo";

          //e.g location.geo ->
          path = filterQueryUtils.getPathForCompoundKey(self.getRoot(), path.split("."), true);

          esSort._geo_distance[path] = s.geo;
        }

        switch (s.type) {

          case "doc":
            //filter by doc order
            //This is the most efficient.
            esSort._doc = {
              "ignore_unmapped" : true,
              order: s.asc === undefined ? "asc" : (s.asc ? "asc" : "desc")
            };
            break;

          case "score":
            //filter on score
            esSort._score = {
              "ignore_unmapped" : true,
              order: s.asc === undefined ? "desc" : (s.asc ? "asc" : "desc") //default desc sort order
            };
            break;

          case "field":
            //filter on field
            if (!s.field) {
              throw new Error("sort of type='field' should have 'field' defined");
            }
            esSort[s.field] = {
              "ignore_unmapped" : true,
              order: s.asc === undefined ? "asc" : (s.asc ? "asc" : "desc")
            };
            break;


          case "distance":

            //filter on distance
            sortOnDistance();
            break;

          case "distanceUser":

            //filter on distance to user
            if (!self.meta || !self.meta.user || !self.meta.user.geo) {
              throw new Error("meta.user.geo needs to be defined for sort with type='distanceUser'");
            }

            s.geo = self.meta.user.geo;

            sortOnDistance();
            break;

          default:
            throw new Error("sort needs `type`-value of (doc,score,field,distance, distanceUser) but was: " + s.type);
        }

        return esSort;
      })
    };

  };


  var OPENINGHOURS_RESOLUTION = 5;

  FilterQuery.prototype.getTemporal = function () {

    if (!this.temporal) {
      return {};
    }

    //PRE: temporal defined;

    if (this.getRoot() === "PlaceWithOpeninghours") {

      //check on openinghours
      if (!this.temporal.open) {
        throw new Error("temporal defined on PlaceWithOpeninghours must contain 'open' attrib");
      }

      var date;
      if (this.temporal.open === "now") {
        date = moment();
      }

      var days = date.isoWeekday() - 1; //returns[1, 7] -> map to [0,6]
      var hours = date.hours();
      var minutes = date.minutes();

      var dateAsInt = ((24 * days + hours) * 60 / OPENINGHOURS_RESOLUTION) + Math.round(minutes / OPENINGHOURS_RESOLUTION);
      var openingQuery = {
        "query": {
          "bool": {
            "must": [{
              "nested": {
                "path": "openingHoursSpecification",
                "query": {
                  "bool": {
                    "must": [{
                      "filtered": {
                        "filter": {
                          "range": {
                            "openingHoursSpecification.opens": {
                              "lte": dateAsInt
                            }
                          }
                        }
                      }
                    }, {
                      "filtered": {
                        "filter": {
                          "range": {
                            "openingHoursSpecification.closes": {
                              "gte": dateAsInt
                            }
                          }
                        }
                      }
                    }]
                  }
                }
              }
            }]
          }
        }
      };

      return openingQuery;
    }


    //TODO: all the checking on values, properties given root and all that.
    //NOTE startDate hardcoded
    return {
      query: {
        bool: {
          must: filterQueryUtils.performTemporalQuery(this.temporal, "startDate")
        }
      }
    };

  };

  FilterQuery.prototype.getSpatial = function () {

    if (!this.spatial) {
      return {};
    }

    if (!this.spatial.type) throw new Error("Spatial query needs `type` property");


    var options = _.defaults({
      _root: this.getRoot(),
      _type: this.spatial.type
    }, this.spatial.options || {});

    if (options._type === "nearUser") {
      if (!this.meta || !this.meta.user || !this.meta.user.geo) {
        throw new Error("need meta.user.geo for spatial type: nearUser");
      }
      options.geo = this.meta.user.geo;
      options._type = "nearPoint";
    }

    switch (options._type) {
      case "nearPoint":
        return filterQueryUtils.performSpatialPointQuery(options, this.spatial.path);
      case "location":
        return filterQueryUtils.performSpatialLookupQuery(options, this.spatial.path);
      case "containedInPlace":
        return filterQueryUtils.performSpatialLookupQuery(options, this.spatial.path);
      default:
        throw new Error("spatial type not supported: " + options._type);
    }
  };

  FilterQuery.prototype.getPage = function () {
    var size = this.pageSize || DEFAULT_PAGESIZE;
    return {
      from: size * (this.page || 0),
      size: size
    };
  };

  FilterQuery.prototype.getFilter = function () {


    var query = {
      query: {
        bool: {
          must: [], 
          filter: []
        }
      },
    };

    //All types except events are filtered if no image exists. 
    //Events often get their image transplanted from either location / performer / 
    //workFeatured, (out of bound info at this moment) so we won't filter on this for events.
    if (this.type !== "Event") {
      query.query.bool.filter.push({
        "exists": {
          "field": "image"
        }
      });
    }


    if (!this.filter) {
      return query;
    }

    var root = this.getRoot();

    _.each(this.filter, function (v, compoundKey) {

      var splitSymbols = _.difference(compoundKey.split(/\.|--/), ["expand"]); //remove 'expand'
      var path = filterQueryUtils.getPathForCompoundKey(root, splitSymbols);
      var typeOfQuery;

      //HACK: We misuse this code-path to construct a prefix-query...
      if (compoundKey === "name.raw") {
        path = compoundKey;
        typeOfQuery = "PrefixName";
      }

      if (!path) {
        throw new Error("following filter key not allowed: " + compoundKey);
      }

      //TODO: #183 - if compoundkey is an entity or valueObject and `v` is an object, allow
      //deep filtering inside nested object (which is either type = nested (multival) || type=object (singleval))
      typeOfQuery = typeOfQuery || (_.isObject(v) ? "Range" : "Text");

      //special path for name: free-text
      if (compoundKey === "name") {
        //TODO: should we allow other free text fields such as address?
        typeOfQuery = "FreeText";
      } else if (compoundKey === "subtypes" || compoundKey === "tagsFromFact" || compoundKey === "genre") {
        //TODO: we should look at ES_mapping instead or something this is not dry
        typeOfQuery = "Enum";
      }

      var propFilter;

      switch (typeOfQuery) {
        case "Enum":

          //terms filter for exact matching
          propFilter = {
            bool: {
              must: _.map(_.isArray(v) ? v : [v], function (singleVal) {
                var singleFilter = {
                  term: {}
                };

                singleFilter.term[compoundKey] = singleVal;
                return singleFilter;
              })
            }
          };

          break;
        case "PrefixName":
          propFilter = {
            prefix: {
              "name.raw": v
            }
          };
          break;
        case "FreeText":


          //Probably some improvements to be made: 
          //1. better scoring: shingles on name to take ordering into account
          //2. better recall: stemming of subtypes, genres, tagsFromFact
          //Also see ES Guide starting at: https://www.elastic.co/guide/en/elasticsearch/guide/2.x/most-fields.html
          propFilter ={
              "multi_match": {
                  "query":  v,
                  "type":   "most_fields", 
                  "fields": [ "name^10", "subtypes^3", "genres^2", "tagsFromFact" ]
              }
          };
          break;

        case "Text":
          propFilter = filterQueryUtils.performTextQuery(v, path);
          break;

        case "Range":
          propFilter = filterQueryUtils.performRangeQuery(v, path);
          break;
      }


      //add filter to AND
      query.query.bool.must.push(propFilter);
    });


    return query;
  };

  FilterQuery.prototype.wantRawESResults = function () {
    return this.meta && this.meta.elasticsearch && this.meta.elasticsearch.showRaw;
  };

  FilterQuery.prototype.performQuery = function () {
    var self = this;

    var root = self.getRoot();

    return Promise.resolve()
      .then(function () {

        var searchQuery = {
          index: self.getESIndex(),
          type: 'type1',
          body: {}
        };

        //getFilter exends body. Can set: 
        //- query
        //- filter
        _.merge(searchQuery.body, self.getPage(), self.getFilter(), self.getTemporal(), self.getSpatial(), self.getSort(), function (a, b) {
          if (_.isArray(a)) {
            return a.concat(b);
          }
        });

        // console.log(JSON.stringify(searchQuery, null,2));

        return esClient.search(searchQuery);
      })
      .then(function (esResult) {

        var hits = esResult.hits.hits;

        return Promise.resolve()
          .then(function () {

            if (hits.length) {

              ////////////
              //TODO: we want to check for confidence level between top result and rest
              if (self.wantUnique) {
                hits = esResult.hits.hits = hits.slice(0, 1);
              }

              return r.table(erdEntityTable).getAll.apply(erdEntityTable, _.pluck(hits, "_id"))
                .then(function (entities) {
                  return Promise.all(_.map(entities, erdMappingConfig.cleanupEnumSynonymsInRethinkDTO));
                })
                .then(function orderInHitOrder(entities) {

                  var entityMap = _.reduce(entities, function (agg, e) {
                    agg[e.id] = e;
                    return agg;
                  }, {});

                  return _.map(hits, function (hit) {
                    return entityMap[hit._id];
                  });

                });
            }
          })
          .then(function expandEntities(entities) {

            var expand = {};

            return Promise.resolve()
              .then(function () {

                //meta.refs.expand -> expand refs, based on array of dot-notated paths
                if (self.meta && self.meta.refs) {

                  var expandFields = self.meta.refs.expand || [];
                  expandFields = _.isArray(expandFields) ? expandFields : [expandFields];

                  return filterQueryUtils.recurseReferencesToExpand(entities, root, expandFields, expand);
                }
              })
              .then(function () {
                return [entities, expand];
              });
          })
          .spread(function (entities, expand) {

            var obj = {
              hits: entities || []
            };

            if (self.meta && self.meta.refs && self.meta.refs.expand) {
              obj.expand = expand;
            }

            _.extend(obj, {
              meta: {
                elasticsearch: _.extend(_.omit(esResult, "hits"), {
                  hits: _.omit(esResult.hits, "hits"),
                  raw: self.wantRawESResults() ? hits : undefined
                })
              }

            });

            return obj;
          });
      });
  };

  return FilterQuery;
};
