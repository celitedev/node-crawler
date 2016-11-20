var elasticsearch = require('elasticsearch');
var _ = require("lodash");
var argv = require("yargs").argv;

var config = require("../config");
var domainConfig = require("../schemas/domain/_definitions/config");
var domainUtils = require("../schemas/domain/utils");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
  checkSoundness: true,
  config: domainConfig,
  properties: require("../schemas/domain/_definitions").properties,
  types: require("../schemas/domain/_definitions").types,
  schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var erdMappingConfig = require("../schemas/es_schema")(generatedSchemas);

var client = new elasticsearch.Client(config.elasticsearch);

var indexMapping = erdMappingConfig.indexMapping;


Promise.resolve()
  .then(function () {

    var nonExistPropNames = [],
      enumOnNonDatatypes = [];

    _.each(_.keys(erdMappingConfig.properties), function (propName) {
      if (!~_.keys(generatedSchemas.properties).indexOf(propName)) {
        nonExistPropNames.push(propName);
      } else {

        var prop = generatedSchemas.properties[propName];

        if (prop.enum) {
          //enum defined -> may not be defined on non-datatypes
          //may be defined on all calculated fields since these are treated
          //as datatypes at all time
          var typeName = prop.ranges[0];
          if (!generatedSchemas.datatypes[typeName]) {
            enumOnNonDatatypes.push(propName);
          }
        }
      }
    });

    if (nonExistPropNames.length) {
      throw new Error("ES property doesn't exit in definitions. " +
        "Did you want to make it a calculated property? : " +
        nonExistPropNames.join(","));
    }

    if (enumOnNonDatatypes.length) {
      throw new Error("ES property with 'enum' exists on non-datatype property: " +
        enumOnNonDatatypes.join(","));
    }

    //test / normalize all enums
    var allProps = _.extend({}, erdMappingConfig.properties, erdMappingConfig.propertiesCalculated);

    _.each(allProps, function (prop, propName) {
      if (!prop.enum) return;

      if (prop.enum.type !== "static") throw new Error("enum.type should be 'static' for now: " +
        prop.enum.type);

      if (!prop.enum.sourceMappings || !prop.enum.vocabulary) {
        throw new Error("enum.sourceMappings and enum.vocabulary should be defined: " +
          JSON.stringify(prop.enum));
      }
    });
  })
  .then(function () {

    return Promise.all(_.map(getAllIndexNames(), function (obj) {

      var root = obj.root,
        indexName = obj.indexName;

      return Promise.resolve()
        .then(function deleteIndex() {

          return Promise.resolve()
            .then(function () {
              return client.indices.delete({
                index: indexName
              });
            })
            .catch(function (err) {
              //silenty ignore index_not_found
              if (err.body.error.type !== "index_not_found_exception") {
                throw err;
              }
            });
        })
        .then(function createIndex() {
          return client.indices.create({
            method: "PUT",
            index: indexName,
            body: createIndexMapping(_.cloneDeep(indexMapping), root)
          });
        })
        .catch(function (err) {
          throw err;
        });
    }));
  })
  .then(function (result) {
    console.log("indices created: ", _.pluck(getAllIndexNames(), "indexName").join(","));
  })
  .catch(function (err) {
    setTimeout(function () { //throw already
      throw err;
    });
  });



function getAllIndexNames() {
  return _.map(domainConfig.domain.roots, function (root) {
    return {
      root: root,
      indexName: "kwhen-" + root.toLowerCase()
    };
  });
}

function createIndexMapping(mapping, root) {

  //get root + all subtypes
  var typesForRoot = _.filter(generatedSchemas.types, {
    rootName: root
  });

  //Get all properties that can exist in index. 
  //This is the aggregate of all properties defined on the above types.
  var propNames = _.uniq(_.reduce(typesForRoot, function (arr, type) {
    return arr.concat(_.keys(type.properties));
  }, []));

  //add mappings for properties that exist on root
  mapping.mappings.type1.properties = _.reduce(propNames, function (agg, propName) {
    addPropertyMapping(propName, agg);
    return agg;
  }, {});


  //Add mappings for isCalculated properties that should exist on this root. 
  //This is defined by directive `roots`, with options: 
  //- true -> belong to any root
  //- string || [string]  
  var allPropertyNames = _.keys(generatedSchemas.properties);
  var calculatedProps = erdMappingConfig.propertiesCalculated;

  var existingProps = _.intersection(allPropertyNames, _.keys(calculatedProps));
  if (existingProps.length) {
    throw new Error("calculated ES properties exist that are already defined in prop definitions: " + existingProps.join(","));
  }

  mapping.mappings.type1.properties = _.reduce(calculatedProps, function (agg, prop, propName) {
    var roots = _.isArray(prop.roots) ? prop.roots : [prop.roots];
    if (prop.roots === true || ~roots.indexOf(root)) {
      addPropertyMapping(propName, agg);
    }
    return agg;
  }, mapping.mappings.type1.properties);

  return mapping;
}

function isNestedMapping(mapping) {
  return ~["object", "nested"].indexOf(mapping.type);
}

function addPropertyMapping(propName, agg) {

  var propESObj = erdMappingConfig.properties[propName] || erdMappingConfig.propertiesCalculated[propName];
  var propType = generatedSchemas.properties[propName]; //NOTE: doesn't exist in case of calculated prop.

  if (propESObj) {

    if (propESObj.mapping) {

      //expand short string notation to full mapping, e.g.: 
      //
      //mapping: "string" -> 
      //
      //mapping: {
      // type: "string"
      //}
      if (_.isString(propESObj.mapping)) {
        propESObj.mapping = {
          type: propESObj.mapping
        };
      }

      //set mapping
      agg[propName] = propESObj.mapping;


      //If nested mapping defined ...
      if (isNestedMapping(agg[propName])) {

        //... and property mapping without properties -> attempt to fetch mappings through
        //knowledge of type on that property, and through that find possible nested props.
        //
        //TECH NOTE: this deliberately doesn't use clone, so this code will automatically inject
        //the updated mapping to 'expand' mappings below
        if (!agg[propName].properties && propType) {
          var nestedPropNames = _.pluck(generatedSchemas.types[propType.ranges[0]].properties, "id");
          agg[propName].properties = _.reduce(nestedPropNames, function (agg, propName) {
            addPropertyMapping(propName, agg);
            return agg;
          }, {});
        }
      }
    }

    //If property is enum we set a predefined mapping.
    //This mapping overwrites any explicitly set mapping.
    if (propESObj.enum) {
      agg.propName = {
        "type": "string",
        "analyzer": "enum"
      };
    }
  }


  ///////////////////////////////////////////////////////
  //For each property containing references:           //
  //- set standard mapping                             //
  //- check if we want to add a <prop>--expand mapping //
  ///////////////////////////////////////////////////////
  if (propType) {

    var type = generatedSchemas.types[propType.ranges[0]];
    if (type && type.isEntity) {

      //Set standard mapping for references: not_analyzed
      //This mapping overwrites any explicitly set mapping.
      agg[propName] = {
        type: 'string',
        index: 'not_analyzed'
      };

      propESObj = erdMappingConfig.properties[propName];

      //Extend with mappingExpanded, i.e.: a bunch of fields to include/expand a reference with
      if (propESObj && propESObj.expand) {

        var out = {};

        if (!propESObj.expand.flatten) {

          var obj = out[propName + "--expand"] = {
            type: propType.isMulti ? "nested" : "object"
          };

          obj.properties = _.reduce(propESObj.expand.fields, function (agg, fieldName) {

            var name = fieldName;
            if (~name.indexOf("--")) { //fieldName: `containedInPlace--name` should fetch mapping from `name`
              name = name.substring(name.indexOf("--") + 2);
            }

            var fieldESObj = erdMappingConfig.properties[name];
            if (fieldESObj && fieldESObj.mapping) {
              agg[fieldName] = fieldESObj.mapping;
            }
            return agg;
          }, {});

        } else {

          out = _.reduce(propESObj.expand.fields, function (agg, fieldName) {
            var fieldESObj = erdMappingConfig.properties[fieldName];
            if (fieldESObj && fieldESObj.mapping) {
              agg[propName + "--" + fieldName] = fieldESObj.mapping;
            }
            return agg;
          }, {});

        }

        _.extend(agg, out);
      }

    }
  }

  //////////////////////
  //setting subfields //
  //////////////////////
  if (propESObj && propESObj.fields) {
    agg[propName] = agg[propName] || {};
    agg[propName].fields = _.reduce(propESObj.fields, function (agg, v, k) {

      if (_.isString(v)) {
        v = {
          type: v
        };
      }
      agg[k] = v;
      return agg;
    }, {});
  }

}
