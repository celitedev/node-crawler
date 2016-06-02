var _ = require("lodash");
var Promise = require("bluebird");
module.exports = function (command) {

  var app = command.app;
  var cacheUtils = command.cacheUtils;
  var redisClient = command.redisClient;
  var roots = command.roots;

  //Update Redis NLP Cache from ES
  app.post("/reloadNLPCache", function (req, res) {

    var promiseMap = _.reduce(roots, function (agg, root) {

      var cachePropMap = cacheUtils.cachePropertyMap;

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

      //cache into redis buckets
      agg[root] = Promise.resolve()
        .then(function () {
          return command.esClient.search(searchQuery);
        })
        .then(function (result) {
          return Promise.map(_.keys(cachePropMap), function (k) {
            var redisKey = "cache-" + root.toLowerCase() + "-" + k;
            var supportedKeys = _.pluck(result.aggregations[k].buckets, "key");
            return redisClient.setAsync(redisKey, supportedKeys.join(","));
          });
        });

      return agg;

    }, {});

    return Promise.props(promiseMap)
      .then(function (resultJSON) {
        cacheUtils.updateInProcessCaches();
        res.json(resultJSON);
      });
  });

};
