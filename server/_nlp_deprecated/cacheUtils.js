var _ = require("lodash");
var Promise = require("bluebird");
var roots = require("../../schemas/domain/_definitions/config").domain.roots;

var redisClient;

var cachePropertyMap = {
  all: {
    esField: "all_tags",
  },
  tags: {
    esField: "tagsFromFact"
  },
  subtypes: {
    esField: "subtypes"
  }
};
var cacheUtils = {

  cachePropertyMap: cachePropertyMap,
  supportedAttribsPerRoot: {},
  updateInProcessCaches: function updateInProcessCaches() {

    console.log("UPDATE NLP CACHE");

    ///update cache that stores supported attributes per root
    Promise.map(roots, function (root) {

      root = root.toLowerCase();

      var propMap = _.reduce(_.keys(cachePropertyMap), function (agg, k) {
        var redisKey = "cache-" + root + "-" + k;
        agg[k] = redisClient.getAsync(redisKey);
        return agg;
      }, {});

      return Promise.props(propMap)
        .then(function (props) {
          cacheUtils.supportedAttribsPerRoot[root] = _.reduce(props, function (agg, sDelimited, k) {
            agg[k] = !sDelimited ? [] : sDelimited.split(",");
            return agg;
          }, {});

        });
    });
  },
};

module.exports = {
  loadCache: function (rClient) {

    if (redisClient) {
      console.log("NLP Cache already loaded");
      return;
    }

    redisClient = rClient;

    //Update redis cache each 5 minutes. 
    //This rechecks ES
    setInterval(cacheUtils.updateInProcessCaches, 5 * 60 * 1000); //update each 5 minutes
    cacheUtils.updateInProcessCaches();

    return cacheUtils;
  }
};
