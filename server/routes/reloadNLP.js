var _ = require("lodash");
var Promise = require("bluebird");
module.exports = function (command) {

  var app = command.app;
  var cacheUtils = command.cacheUtils;
  var redisClient = command.redisClient;
  var roots = command.roots;

  //Update Redis NLP Cache with supported vocabulary values per attribute
  //
  //Attributes to populate (configurable): 
  //
  //- tags
  //- subtypes
  //
  //Populate is done for each type in the system separately. 
  //
  // `subtypes` is only defined for all roots. 
  // `tags` is defined for all types in the system (subtypes can have more tags defined)
  //
  // Lastly, values are extracted from 2 sources: 
  // - vocabulary . This will be the go-to-source when things have stabalized.
  // - elasticsearch. In the end ES values will be a subset of values defined in vocabulary. For now, 
  // we allow values to be posted to ES that don't match vocabulary. (using schema.enumKeepOriginal)

  app.post("/reloadNLPCache", function (req, res) {

    console.log("MIGHT NOT WORK IN TERMS OF REFERENCES, BC WE MANUALLY PASTED THIS IN FROM MASTER AFTER GIT BRANCH SNAFU");

    var cachePropMap = cacheUtils.cachePropertyMap;

    var esMap = {};
    var cacheMap = {};

    //fetch values for all attributes from ES for ALL ROOTS
    var esPromiseMap = _.reduce(roots, function (agg, root) {


      var searchQuery = {
        index: "kwhen-" + root.toLowerCase(),
        type: 'type1',
        body: {
          "size": 0,
          "aggs": _.reduce(cachePropMap, function (agg, v, k) {
            agg[k] = {
              "terms": {
                "field": v.esField,
                "size": 0
              }
            };
            return agg;
          }, {})
        }
      };

      console.log("Aggregation query", JSON.stringify(searchQuery, null, 2));

      //cache into redis buckets
      agg[root] = Promise.resolve()
        .then(function () {
          return command.esClient.search(searchQuery);
        })
        .then(function (result) {

          esMap = _.reduce(_.keys(cachePropMap), function (agg, k) {
            agg[root] = agg[root] || {};
            agg[root][k] = _.pluck(result.aggregations[k].buckets, "key");
            return agg;
          }, esMap);
        });

      return agg;
    }, {});

    return Promise.props(esPromiseMap)
      .then(function () {

        //populate ALL TYPES
        _.each(generatedSchemas.types, function (type, typeName) {

          cacheMap[typeName] = {};

          var typechain = type.ancestors.concat([typeName]);

          _.each(cachePropMap, function (v, attribName) {

            //test if need to process
            if (!((v.cacheForRootsOnly && ~roots.indexOf(typeName)) || !v.cacheForRootsOnly)) return;

            //fetch values from ES as well as vocab for all types in typechain
            var vals = _.uniq(_.reduce(typechain, function (arr, t) {

              //add values for <type,attribName> from ES
              //AS PART OF #247 THIS WILL NOT BE NEEDED ANYMORE ONCE VOCAB STABALIZES ENOUGH
              if (esMap[t]) {
                arr = arr.concat(esMap[t][attribName] || []);
              }

              //get values from vocabulary
              arr = arr.concat(vocabs[v.vocab].supportedValuesPerType[t] || []).concat();

              return arr;
            }, []));

            if (vals.length) {
              cacheMap[typeName][attribName] = vals;
            }
          });
        });
      })
      .then(function saveCacheMapToRedis() {

        var redisPromises = [];
        _.each(cacheMap, function (typeMap, typeName) {
          _.each(typeMap, function (attribs, attribName) {
            var redisKey = "cache-" + typeName.toLowerCase() + "-" + attribName;
            if (attribs.length) {
              redisPromises.push(redisClient.setAsync(redisKey, attribs.join(",")));
            }
          });
        });
        return Promise.all(redisPromises);
      })
      .then(function () {
        cacheUtils.updateInProcessCaches(); //sync
        res.json(cacheMap);
      });
  });
};
