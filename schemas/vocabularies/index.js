var _ = require("lodash");
var path = require('path');
var glob = require("glob");

var domainUtils = require("../domain/utils");

var singleton;

function toLowerCase(val) {
  return val.toLowerCase();
}

module.exports = function (generatedSchemas) {

  if (singleton) return singleton; //important! since we'll modify below object, which is not idempotent.

  var vocabs = _.reduce(glob.sync(path.resolve(__dirname, "vocabs") + "**/**/*.js"), function (vocabs, file) {
    var vocabName = file.substring(file.lastIndexOf("/") + 1, file.lastIndexOf("."));
    if (vocabName === "index") return vocabs; //skip this index file
    var vocabOrFN = require(file);
    vocabs[vocabName] = _.isFunction(vocabOrFN) ? vocabOrFN(generatedSchemas) : vocabOrFN;
    return vocabs;
  }, {});


  _.each(vocabs, function (vocab, vocabName) {

    //expand from string to object
    //expand `values` to array
    //expand `parents` to array and default to []
    vocab.vocabulary = _.reduce(vocab.vocabulary, function (agg, value, valueName) {

      valueName = valueName.toLowerCase();

      if (_.isString(value) || _.isArray(value)) { //needs to be value of strings.
        value = {
          values: value
        };
      }

      if (!_.isObject(value)) {
        throw new Error("sanity check: vacabulary value should be an object by now: " + JSON.stringify(value, null, 2));
      }

      value.values = _.isArray(value.values) ? value.values : [value.values];
      value.values = _.map(value.values, toLowerCase);

      value.parents = value.parents || [];
      value.parents = _.isArray(value.parents) ? value.parents : [value.parents];
      value.parents = _.map(value.parents, toLowerCase);

      agg[valueName] = value;
      return agg;
    }, {});

    var dagComparators = _.reduce(vocab.vocabulary, function (agg, value, valueName) {
      agg[valueName] = _.clone(value.parents); //clone !, otherwise we'll empty parents.
      return agg;
    }, {});

    //determine dependency order
    var vocabOrder = domainUtils.createDagOrderGeneric(dagComparators);

    //move in values from .parents to .values
    _.each(vocabOrder, function (valueName) {
      var v = vocab.vocabulary[valueName];
      v.values = _.reduce(v.parents, function (arr, parentName) {
        return arr.concat(vocab.vocabulary[parentName].values);
      }, v.values);
    });

    //Now onto the mappings. 
    vocab.sourceMappings = _.reduce(vocab.sourceMappings, function (agg, mapping, mappingType) {

      agg[mappingType] = _.reduce(mapping, function (agg, enumVals, enumKey) {

        enumKey = enumKey.toLowerCase();

        enumVals = _.isArray(enumVals) ? enumVals : [enumVals];
        enumVals = _.map(enumVals, toLowerCase);

        agg[enumKey] = _.reduce(enumVals, function (arr, enumVal) {

          var lookupVocabObj = vocab.vocabulary[enumVal];
          if (!lookupVocabObj) {
            throw new Error("vocab lookup of for mapping value failed: " + enumVal);
          }

          return arr.concat(lookupVocabObj.values || []);

        }, []);

        return agg;
      }, {});

      return agg;
    }, {});

    vocab.inverseMap = _.reduce(vocab.vocabulary, function (agg, value, valueName) {
      _.each(value.values, function (singleItem) {
        var arr = agg[singleItem] = agg[singleItem] || [];
        arr.push(valueName);
      });
      return agg;
    }, {});
  });



  //result: 
  //a map of <enumType, [sourceMappings, vocabulary]>
  //
  //sourceMappings are used by ERD-creation: 
  //- potential values of a sourceObject are the keys. 
  //- these are mapped to the values, which includes the configured values as well as those of all parents 
  //
  ////vocabulary is the actual config containing all the values including those of all parents. 
  //This is used during search. 

  singleton = vocabs;

  return singleton;
};
