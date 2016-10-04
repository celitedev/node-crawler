var _ = require("lodash");

var roots = require("../schemas/domain/_definitions/config").domain.roots;
var domainUtils = require("../schemas/domain/utils");


//This map statically defines per type which references should be expanded
var expandMap = {
  Event: [
    "location.containedInPlace",
    "location",
    "workFeatured"
  ],
  PlaceWithOpeninghours: [],
  CreativeWork: [],
  OrganizationAndPerson: []
};

//used for type-less query
var fixedTypesInOrder = ["Event", "PlaceWithOpeninghours", "CreativeWork", "OrganizationAndPerson"];

//Exposes suggest endpoint. 
//By default returns results for each type
//
//body: 
// {
//  query: "some query"  
//}
//
//Optionally constrain to type to be returned: 
//
//{
//  query: "some query", 
//  type: "PlaceWithOpening"
//}
//
//
var rootsLowerCaseMap = _.reduce(fixedTypesInOrder, function (agg, root) {
  agg[root.toLowerCase()] = root;
  return agg;
}, {});



module.exports = function (command) {

  var generatedSchemas = command.generatedSchemas;
  var r = command.r;
  var erdConfig = command.erdMappingConfig;
  var erdEntityTable = command.erdEntityTable;

  var rootUtils = command.rootUtils;

  //NOTE: we need to pass FilterQueryUtils to FilterQueries
  var filterQueryUtils = command.filterQueryUtils = {};

  var FilterQuery = require("./FilterQuery")(command);


  //Get all possible properties per root (including the properties defined on subtypes of said root)
  //Format: 
  //
  //Place: {
  //	gender: "Text"
  //}
  //
  //Later on we want to extend this with: 
  //- type for ES calc fields
  //- ways to see if we can do range queries (either ordinal OR number)
  //- ...

  var domainPropertyMap = {};
  var rootPropertyMap = _.reduce(roots, function (agg, root) {

    var calcPropNamesForRoot = _.reduce(erdConfig.propertiesCalculated, function (agg2, calcProp, name) {
      var roots = _.isArray(calcProp.roots) ? calcProp.roots : [calcProp.roots];
      if (calcProp.roots === true || ~roots.indexOf(root)) {
        agg2[name] = _.pick(calcProp, "isMulti");
      }
      return agg2;
    }, {});

    var nestedMap = {};

    agg[root] = _.extend(_.reduce(rootUtils.getPropertyMapForType(root, roots), function (agg2, v, k) {
      var key = k.substring(k.indexOf(".") + 1);

      var prop = generatedSchemas.properties[key];
      agg2[key] = _.pick(prop, "isMulti");

      //add expand info to be used for calculating paths
      if (erdConfig.properties[key]) {
        agg2[key].expand = erdConfig.properties[key].expand;
      }

      //add nested properties in case we're talking a valueObject here
      //Moreover, add isEntity, rootName, isValueObject attributes
      var nestedType = generatedSchemas.types[prop.ranges[0]];
      if (nestedType) {
        if (nestedType.isValueObject) {
          agg2[key].isValueObject = true;
          nestedMap[key] = nestedType;
        } else if (nestedType.isEntity) {
          agg2[key].isEntity = true;
          agg2[key].rootName = nestedType.rootName;
        }
      }

      domainPropertyMap[key] = domainPropertyMap[key] || agg2[key];

      return agg2;
    }, {}), calcPropNamesForRoot);

    //We allow for autoresolving properties. 
    //This means that we use a filterQuery on a Place and property, say, ratingValue, 
    //it should know to resolve it through Place.aggregateRating.ratingValue. 
    //
    //
    //TecH: Add nested properties if they didn't exist on root itself yet. 
    //e.g.: only include ratingValue (coming from AggregateRating) if root doesn't have
    //ratingValue defined as property itself
    agg[root] = _.reduce(nestedMap, function (inAgg, type, propName) {

      _.each(type.properties, function (nestedProp, nestedPropName) {
        if (inAgg[nestedPropName]) return; //only include property if it's not already set
        inAgg[nestedPropName] = _.extend(_.pick(nestedProp, "isMulti"), {
          path: propName
        });
      });

      return inAgg;
    }, agg[root]);

    return agg;
  }, {});

  function getRootMap(rootName) {
    return rootPropertyMap[rootName];
  }

  //dot-separated paths for all entities. Per root
  var entityPathsPerRoot = _.reduce(rootPropertyMap, function (agg, propMap, rootName) {
    agg[rootName] = _.reduce(propMap, function (agg, propVal, propName) {
      if (propVal.isEntity) {
        agg[(propVal.path ? propVal.path + "." : "") + propName] = propVal.rootName;
      }
      return agg;
    }, {});
    return agg;
  }, {});

  function getEntityPathsForRoot(rootName) {
    return entityPathsPerRoot[rootName];
  }

  //Given 
  //- paths: e.g: ["address.streetAdderess", "workFeatured"]
  //- json = entity 
  //
  //- return a map with all flattened values grouped by path
  function getValuesForPaths(paths, json) {

    var map = {};

    rec(json, "");

    function rec(obj, prefix) {
      _.each(obj, function (v, k) {

        var needlePath = prefix ? prefix + "." + k : k;

        if (~paths.indexOf(needlePath)) { //complete path found 

          //we try to keep the cardinality of the original structure

          if (!map[needlePath]) {

            map[needlePath] = v; //which is possible to do here

          } else {
            //but not here anympre. This happens only if parent is array, which for now is never
            map[needlePath] = _.isArray(map[needlePath]) ? map[needlePath] : [map[needlePath]];
            map[needlePath] = map[needlePath].concat(v);
          }

        } else if (_.isObject(v)) {

          //check if needlePath is prefix of path
          //If so recurse down the value
          _.each(paths, function (path) {
            if (path.indexOf(needlePath) === 0) {
              _.map(v, function (singleItem) {
                rec(singleItem, needlePath);
              });
            }
          });
        }
      });
    }

    return map;
  }

  function calcPathSuffix(pathSet, rootName) {

    //given a pathset: all the paths to entities that should be resolved
    //and a root, this: 
    //
    //- finds a map <prefixPath, root, ?pathSuffix-arr>

    var pathMapOut = {};
    var prefixForRoot = entityPathsPerRoot[rootName];

    _.each(pathSet, function (path) {
      _.each(prefixForRoot, function (refRootName, prefix) {
        if (path.indexOf(prefix) === 0) {
          pathMapOut[prefix] = pathMapOut[prefix] || {
            root: refRootName,
            suffixPaths: []
          };
          var suffixPath = path.substring(prefix.length + 1).trim();
          pathMapOut[prefix].suffixPaths = _.uniq(_.compact(pathMapOut[prefix].suffixPaths.concat([suffixPath])));
        }
      });
    });

    return pathMapOut;
  }

  function wrapWithNestedQueryIfNeeed(query, k) {

    var nestedQ = {
      "nested": {
        "query": {}
      }
    };

    var EXPAND_NEEDLE = "--expand";

    //calculate if we've got an expanded query going on.
    var expandObjNeedle = k.indexOf(EXPAND_NEEDLE);
    if (expandObjNeedle === -1) {

      //no expanded query: just return an ordinary range query
      return query;
    }

    //We're talking expanded objects here. 
    //In Elasticsearch these are respresented as so-called nested objects, 
    //which require a specific way of querying.
    //See: https://www.elastic.co/guide/en/elasticsearch/guide/current/nested-query.html
    //


    if (k.substring(0, expandObjNeedle).indexOf(".") !== -1) {
      //Found expanded object but path doesn't start with it. 
      //e.g.: test.workfeatured--expand
      throw new Error("expanded object should be at beginning of query: " + k);
    }

    ////////////////////////////////////////////////////////
    //Only if multivalued are we talking a nested object! //
    ////////////////////////////////////////////////////////
    var origPropName = k.substring(0, expandObjNeedle);
    if (!generatedSchemas.properties[origPropName].isMulti) {
      return query;
    }

    //nested path = name of expanded object, e.g.: workFeatured--expand
    nestedQ.nested.path = k.substring(0, expandObjNeedle + EXPAND_NEEDLE.length);
    nestedQ.nested.query = query;

    return nestedQ;
  }


  function buildRecursiveObj(path, resultObj) {
    var key = path.shift();
    resultObj[key] = resultObj[key] || {};
    if (path.length) {
      buildRecursiveObj(path, resultObj[key]);
    }
  }


  //filter keys may specify proper paths as follows: 
  //
  //- location -> pointing to property location
  //- location.containedInPlace -> pointing to id of containedInPlace for location
  //- location.name -> pointing to location name
  //- location.containedInPlace.name -> pointing to name of containedInPlace for location
  //
  function getPathForCompoundKey(root, propNameArr, objSupported) {

    //TECH: at the moment we only resolve these properties if there's an expansion defined to get to them.
    //I.e.: only if we need 1 query do we allow the key to be defined. 
    //Later on we may extend this by doing a lookup of related entities first, and work our way from the leafs to the root. 

    var propName = propNameArr.shift();
    var prop = rootPropertyMap[root][propName];

    if (!prop) {
      //Don't think we want this, since NLP - > FilterContext should be smart enough to query for Events instead of CreativeWorks
      //when location is involved. Similar for Persons -> Event
      throw new Error("property not found on schema for type (root, propName): " + root + ", " + propName);
    }

    if (prop.isValueObject) {

      if (!propNameArr.length) {

        // For normal filters: eg: location.aggregateRating = {..} not supported yet. 

        //..exceptions should inject `objSupported`
        if (objSupported) { //e.g.: spatial lookup on `geo`
          return (prop.path ? prop.path + "." : "") + propName;
        }

        throw new Error("path ending in ValueObject isn't supported (yet): " + propName);
      }
      //e.g.: aggregatedValue.ratingValue
      //We return the path is it would have been returned for `ratingValue`
      return getPathForCompoundKey(root, propNameArr, objSupported);
    }

    var path = (prop.path ? prop.path + "." : "") + propName; //possibly a valueObject

    //we reached the tail
    if (!propNameArr.length) return path;

    if (!prop.isEntity) return undefined; //no ValueObject and no Entity -> dot-separation not supported.

    //expand not defined which should be the case by now
    if (!prop.expand) return undefined;

    return path + (prop.expand.flatten ? "--" : "--expand.") + getPathForCompoundKey(prop.rootName, propNameArr, objSupported);

    //NOTE: again, LATER ON we allow resolving other related entities in a multi-stage lookup
  }


  function performSpatialPointQuery(options, path) {

    if (!options.geo) throw new Error("need `options.geo` for spatial type: nearPoint/nearUser");

    path = path ? path + ".geo" : "geo"; //add `geo` to path if defined                  	               

    path = getPathForCompoundKey(options._root, path.split("."), true);

    var query = {
      geo_distance: {
        distance: options.distance || "1mi", //1 mile

        //https://www.elastic.co/guide/en/elasticsearch/guide/current/geo-distance.html
        //Faster lookups. This is ok since we're searching really close so can treat earth as a plane
        "distance_type": "plane",
      }
    };

    query.geo_distance[path] = options.geo;

    return {
      query: {
        bool: {
          must: wrapWithNestedQueryIfNeeed(query, path)
        }
      }
    };
  }

  function performSpatialLookupQuery(options, path) {

    if (!options.id && !options.name) {
      throw new Error("need options.id or options.name for spatial type: location or containedInPlace");
    }

    path = path ? path + "." + options._type : options._type; //add `location` or `containedInPlace` to path
    path += options.name ? ".name" : ""; //add `name` to path if defined, otherwise leave as is.                          	               

    path = getPathForCompoundKey(options._root, path.split("."));

    var query = {
      match: {}
    };

    query.match[path] = {
      query: options.name || options.id,
      operator: "and"
    };

    return {
      query: {
        bool: {
          must: wrapWithNestedQueryIfNeeed(query, path)
        }
      }
    };
  }


  function performTextQuery(v, k, isFuzzy) {

    var matchQuery = {
      match: {}
    };
    matchQuery.match[k] = {
      query: v,

      //this requires all terms to be found. This is default (since only 1 term) for exact matches
      //and we require this for free text (e.g.: name) as well for now. 
      //
      //More info
      //- https://www.elastic.co/guide/en/elasticsearch/guide/current/match-multi-word.html
      //- https://www.elastic.co/guide/en/elasticsearch/guide/current/bool-query.html#_controlling_precision
      operator: "and"
    };

    //allow fuzziness.
    if (isFuzzy) {
      matchQuery.match[k].fuzziness = "AUTO";
    }

    return wrapWithNestedQueryIfNeeed(matchQuery, k);
  }


  //verbatim copy of range filter structure. Allowed keys: gt, gte, lt, lte
  function performRangeQuery(v, k) {

    var rangeQuery = {
      range: {}
    };
    rangeQuery.range[k] = v;

    return wrapWithNestedQueryIfNeeed(rangeQuery, k);
  }

  function performTemporalQuery(dateFilters) {

    var rangeQueries = [];
    _.each(dateFilters, function(v, k){
      var rangeQuery = {
        range: {}
      };
      rangeQuery.range[k] = v;
      rangeQueries.push(wrapWithNestedQueryIfNeeed(rangeQuery, k));
    });
    if (rangeQueries.length === 1) {
      return rangeQueries[0];
      // todo jim create or range query
    } else {
      return rangeQueries;

    }
  }

  function createFilterQuery(command) {

    if (!command.type) {
      throw new Error("command.type should be defined");
    }

    //auto load expand-map
    if (command.includeCardFormatting) {
      var refs = command.meta.refs = command.meta.refs || {};
      refs.expand = refs.expand || expandMap[command.type];
    }

    command.page = command.page || 0;

    //default sort
    command.sort = command.sort || {
      type: "score"
    };

    //sort is an array
    command.sort = _.isArray(command.sort) ? command.sort : [command.sort];

    command.filter = command.filter || command.filters; //filter and filters are both supported

    //create filterQuery object
    var filterQuery = FilterQuery(command);

    //asserts
    if (!~roots.indexOf(filterQuery.type)) {
      throw new Error("filterQuery.type should be a known root: " + roots.join(","));
    }

    return filterQuery;
  }

  function createSuggestionQueries(entity, command) {
    switch (entity.root)
    {
      case 'Event':
          return [
            createFilterQuery(_.extend({}, command, {
              filter: {
                name: entity.name
              },
              wantUnique: true,
              sort: {
                type: 'date'
              }
            })),
            createFilterQuery(_.extend({}, command, {
              wantUnique: false,
              subtype: _.last(entity.subtypes_raw),
              sort: [{
                type: 'date'
              }]
            }))];
            break;
      case '‌PlaceWithOpeninghours':
        return [
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            filter: {
              name: entity.name
            },
            sort: {
              type: 'date'
            },
            temporal: {
              gte: 'now'
            }
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            subtype: _.last(entity.subtypes_raw),
            sort: [{
              type: 'date'
            }],
            temporal: {
              gte: 'now'
            }
          }))];
        break;
            break;
      case 'OrganizationOrPersion':
        return [
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            type: 'Event',
            filter: {
              name: entity.name
            },
            sort: [
              {
                type: 'date'
              },
              {
                type: 'keyword'
              }],
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            type: 'Event',
            subtype: _.last(entity.subtype_raw),
            filter: {
              name: entity.name
            },
            sort: [
              {
                type: 'keyword'
              },
              {
                type: 'date'
              }],
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            subtype: _.last(entity.subtype_raw),
            filter: {
              name: entity.name
            },
            sort: [
              {
                type: 'keyword'
              }],
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            type: 'Event',
            subtype: _.last(entity.subtype_raw),
            filter: {
              name: entity.name
            },
            sort: {
              type: 'date'
            },
            temporal: {
              lte: 'now'
            }
          }))];
      case 'Creativework':
        return [
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            type: 'Event',
            filter: {
              name: entity.name
            },
            sort: [
              {
                type: 'date'
              }],
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            type: 'Event',
            subtype: _.last(entity.subtype_raw),
            filter: {
              name: entity.name
            },
            sort: [
              {
                type: 'date'
              }],
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            subtype: _.last(entity.subtype_raw),
            filter: {
              name: entity.name
            },
            sort: [
              {
                type: 'keyword'
              }],
          })),
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            type: 'Event',
            subtype: _.last(entity.subtype_raw),
            filter: {
              name: entity.name
            },
            sort: {
              type: 'date'
            },
            temporal: {
              lte: 'now'
            }
          }))];
      default:
        return [
          createFilterQuery(_.extend({}, command, {
            wantUnique: false,
            filter: {
              name: entity.name
            }
          }))];
          break;
    }
  }


  var mergeFN = function (a, b) {
    return (a || []).concat(_.isArray(b) ? b : [b]);
  };


  function recurseReferencesToExpand(entities, root, fieldsToExpand, expandOut) {

    //1. Move all refs to `_refs`, thereyby changing entities.
    //2. Fetch all ids for those refs and store them in refMap

    var suffixMap = {};
    var refMap = {};
    var pathsForRoot;

    //Normally all entities have the same root instead of 'all'. 
    //In that case, calc them here since otherwise we're redoing calculations
    if (root !== "all") {

      pathsForRoot = getEntityPathsForRoot(root);

      //datastruct for the paths that actually are requested for expansion. 
      //- key = path (dot.notated) until entity reference, i.e.: the prefix
      //- val : 
      //  - root: rootName at this entity reference
      //  - pathSuffix: path still left when prefix is subtracted. If there is still a suffix
      //    it means we need to recurse
      suffixMap = calcPathSuffix(fieldsToExpand, root);
    }

    _.each(entities, function (entity) {

      var localRoot = root !== "all" ? root : entity.root;
      pathsForRoot = root !== "all" ? pathsForRoot : getEntityPathsForRoot(localRoot);
      var refs = getValuesForPaths(_.keys(pathsForRoot), entity);

      //Extend on suffixmap while iterating different tyoes works because any prefixref (i.e.: location.containedInPlace)
      //is resovled to exact same types (because of universal definition of these references)
      _.extend(suffixMap, calcPathSuffix(fieldsToExpand, localRoot));
      _.merge(refMap, refs, mergeFN);
    });


    return Promise.resolve()
      .then(function () {

        //POTENTIAL OPTIMIZATION: lookup if we've already got refIds in `expand`

        var refsToResolve = _.pick(refMap, _.keys(suffixMap));

        if (!_.size(refsToResolve)) {
          return [];
        }

        var refIds = _.compact(_.uniq(_.flatten(_.values(refsToResolve))));
        return r.table(erdEntityTable).getAll.apply(erdEntityTable, refIds)
          .then(function (entities) {
            return Promise.all(_.map(entities, erdConfig.cleanupEnumSynonymsInRethinkDTO));
          });
      })
      .then(function (refEntities) {

        if (!refEntities.length) {
          return; //breaker
        }

        //create identity map from refEntities
        var referencesById = _.zipObject(_.pluck(refEntities, "id"), refEntities);

        //add to `json.extend` which is exposed on output
        _.extend(expandOut, referencesById);


        //recurse for each property to: 
        //- change entities so `_refs` is created
        //- nested references are resolved

        var promises = _.map(suffixMap, function (v, prefixPath) {

          //get the ids of the entities as found at for prefixPath
          var idsForPrefixPath = refMap[prefixPath];

          //given the ids fetch the entities themselves
          var refEntitiesForPath = _.values(_.pick(referencesById, idsForPrefixPath));

          //recurse already
          return recurseReferencesToExpand(refEntitiesForPath, v.root, v.suffixPaths, expandOut);
        });

        //execute the recurse
        return Promise.all(promises);
      });
  }


  //inject properties in filterQueryUtils and return
  return _.extend(filterQueryUtils, {
    createFilterQuery: createFilterQuery,
    createSuggestionQueries: createSuggestionQueries,
    performTemporalQuery: performTemporalQuery,
    performRangeQuery: performRangeQuery,
    performTextQuery: performTextQuery,
    performSpatialPointQuery: performSpatialPointQuery,
    performSpatialLookupQuery: performSpatialLookupQuery,
    getPathForCompoundKey: getPathForCompoundKey,
    wrapWithNestedQueryIfNeeed: wrapWithNestedQueryIfNeeed,
    buildRecursiveObj: buildRecursiveObj,
    getEntityPathsForRoot: getEntityPathsForRoot,
    calcPathSuffix: calcPathSuffix,
    getValuesForPaths: getValuesForPaths,
    recurseReferencesToExpand: recurseReferencesToExpand,
    getRootMap: getRootMap,
    erdConfig: erdConfig,

    expandMap: expandMap,
    fixedTypesInOrder: fixedTypesInOrder,
    rootsLowerCaseMap: rootsLowerCaseMap
  });


};
