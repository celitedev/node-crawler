var _ = require("lodash");

//This file describes elasticsearch mappings. 
//Each domain-property that IS NOT described here, is mapped verbatim. 
//If a domain-property should NOT be indexed in ES it should be made explicit here. 
//
//This config also allows for calculated fields


//Elasticsearch mappings which may be included by reference. 
//We first implemented this by string lookup but this gave some weird errors
//on geo-mapping. This seems cleaner anyway.
var mappings = require("./domain/utils").mappings;


function facetLabelForType(type) {
  //TODO:
  //- creativeWork? 
  return type.toLowerCase();
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}


var singleton;
module.exports = function (generatedSchemas) {

  if (singleton) return singleton; //important! since we'll modify below object, which is not idempotent.

  var vocabs = require("./vocabularies")(generatedSchemas);

  var obj = {

    //when expanding refs in ERD, for increased perf on indexing we don't 
    //fetch all fields. The fields fetched here should include all the 
    //fields that you ever want to use while expanding refs of any kind
    refExpandWithFields: [

      //thing
      "name",

      //place
      "address", "geo", "containedInPlace",

      //creative work
      "aggregateRating", "genre",

      //organizationAndPerson
      "tag"
    ],

    //general index mapping
    indexMapping: {
      "settings": {
        "number_of_shards": 1
      },
      "settings": {
        //We don't coerce since we want everything to be explicit. 
        //This is needed since we want to transform all queries through the same pipeline as indexing
        "index.mapping.coerce": false,

        "index": {
          "analysis": {
            "analyzer": {
              "enum": {
                "tokenizer": "keyword",
                "filter": "lowercase"
              }
            }
          }
        }
      },
      "mappings": {
        "type1": {

          //no source
          "_source": {
            "enabled": true //for now. BTW seems to make indexing time slightly worse
          },

          //timestamp probably useful for Kibana: 
          //https://www.elastic.co/guide/en/elasticsearch/reference/1.4/mapping-timestamp-field.html
          "_timestamp": {
            "enabled": true
          }
        }
      }
    },


    //NOTE: IF NOT DEFINED THIS 
    properties: {

      genre: {
        facet: {
          type: "enum",
          label: function (root, type) {
            if (root === type) return "genre"; //if we query for movies -> return genre
            return capitalizeFirstLetter(facetLabelForType(type)) + " genre"; //if we query for events -> return movie genre
          },
        },
        enum: vocabs.genre
      },

      tag: {
        facet: {
          type: "enum",
          label: function (root, type) {
            if (root === type) return "tags"; //if we query for artist -> return tag
            return capitalizeFirstLetter(facetLabelForType(type)) + " tags"; //if we query for events -> return 'person tags'
          },
        },
        enum: vocabs.tag //TODO, need to provide this. For now it's undefined thus pass-all
      },

      openingHoursSpecification: {
        mapping: mappings.openingHoursSpecification,
        transform: function transformOpeninghoursToES(openingHours) {

          //sometimes we have empty openinghours?
          //probably because null value on SourceEntities -> empty {} on entities
          //Null normally isn't set, but may be done by hand in RethinkDB
          if (!openingHours.hoursPayload) return [];

          var TIME_RESOLUTION = 5; //5 minutes
          function getIntFromTime(sTime) {
            //interval = 5minutes
            var splitHM = sTime.split(":");
            var hours = parseInt(splitHM[0]) * 60 / TIME_RESOLUTION; //hour = 60 minutes, interval = 5 minutes -> each hour is 12 intervals
            var minutes = Math.round(parseInt(splitHM[1]) / TIME_RESOLUTION);
            return hours + minutes;
          }

          return _.map(openingHours.dayOfWeekNumber, function (day) {


            var dayIntervals = day * 24 * (60 / TIME_RESOLUTION);

            var open = getIntFromTime(openingHours.opens) + dayIntervals;
            var close = getIntFromTime(openingHours.closes) + dayIntervals;

            //moving past midnight...
            if (open > close) {
              close += 24 * (60 / TIME_RESOLUTION); //add a day
            }


            return {
              hoursPayload: openingHours.hoursPayload,
              opens: open,
              closes: close
            };
          });

        }
      },

      subtypes: {
        facet: {
          type: "enum",
          label: function (root, type) {
            return "kind of " + facetLabelForType(type);
          },
        },
        populate: {
          fields: ["root"],
        },
        mapping: mappings.enum,
        enum: vocabs.subtypes,
        enumKeepOriginal: true, //We want high recall for now so enable uncontrolled subtypes as well.
      },

      ratingValue: {
        facet: {
          label: "rating",
          type: "range"
        },
        mapping: "double",
        transform: "float"
      },

      ratingCount: {
        facet: {
          label: "nr of ratings",
          type: "range"
        },
        mapping: "long",
        transform: "float"
      },

      aggregateRating: {
        mapping: "object"
      },

      fact: {
        mapping: mappings.fact,
      },

      geo: {
        // facet: {
        //   type: "geo" //? not sure if we want facet for geo. And if we want, how? 
        // },
        mapping: mappings.geo,
        transform: "geo"
      },

      name: {
        facet: {
          label: function (root, type) {
            if (root === type) return "name"; //if we query for movies -> return name
            return capitalizeFirstLetter(facetLabelForType(type)) + " name"; //if we query for events -> return movie name
          },
          type: "freeText"
        },
        mapping: {
          type: "string",
          //uses 'standard analyzer'
          //https://www.elastic.co/guide/en/elasticsearch/guide/current/analysis-intro.html
        },
        fields: {
          "raw": mappings.enum //not tokenized. Lowercased
        }
      },

      containedInPlace: {
        expand: {
          fields: ["name"], //create field: containedInPlace--name
          flatten: true
        }
      },

      location: {
        exclude: false,
        expand: {
          fields: ["name", "geo", "containedInPlace", "containedInPlace--name"],
          // postPruneFields: ["containedInPlace"], //used to create containedInPlace--name
          includeId: false,
        }
      },

      startDate: {
        facet: {
          label: "start at",
          type: "dateTime" //? display as calendar? 
        },
        "type": "date",
        "format": "yyyy-MM-dd"
      },

      endDate: {
        facet: {
          label: "end at",
          type: "dateTime" //? display as calendar? 
        },
        "type": "date",
        "format": "yyyy-MM-dd"
      },


      performer: {
        exclude: false,
        expand: {
          fields: ["name"]
        }
      },

      workFeatured: {
        expand: {
          fields: ["name", "aggregateRating", "genre", "subtypes", "all_tags"],
          // postPruneFields: ["genre", "subtypes"] //there are used to create `all_tags`
        }
      },
    },

    propertiesCalculated: {

      root: { //works since 'root' is specifically defined in CanonicalEntity
        roots: true, //true (all) or (array of) rootNames
        isMulti: false
      },


      subtypes_controlled: {
        roots: true,
        isMulti: true,
        populate: {
          fields: ["subtypes"],
        },
        mapping: mappings.enum,
        enum: vocabs.subtypes,
      },

      subtypes_raw: {
        roots: true,
        isMulti: true,
        populate: {
          fields: ["subtypes"],
        },
        mapping: mappings.enum,
      },

      //All the tags
      tagsFromFact: {
        roots: true,
        isMulti: true,
        mapping: mappings.enum,
        enum: vocabs.facts,
        enumKeepOriginal: true, //COmbine enum + raw
        populate: {
          fields: ["fact"],
          strategy: function (factArr) {

            //skip these facts for now
            var factsToSkip = [
              "urlOpenTable",
              "priceRange"
            ];

            //each fact can have multiple values. 
            //Simply combine them all in one big array
            return _.reduce(factArr, function (arr, fact) {
              if (~factsToSkip.indexOf(fact.name._value)) {
                return arr;
              }
              return arr.concat(_.map(_.pluck(fact.val, "_value"), function (v) {
                return v.toLowerCase();
              }));
            }, []);
          }
        }
      },

      tagsFromFact_controlled: {
        roots: true,
        isMulti: true,
        mapping: mappings.enum,
        enum: vocabs.facts,
        enumKeepOriginal: false, //only the controlled stuff
        populate: {
          fields: ["fact"],
          strategy: function (factArr) {

            //skip these facts for now
            var factsToSkip = [
              "urlOpenTable",
              "priceRange"
            ];

            //each fact can have multiple values. 
            //Simply combine them all in one big array
            return _.reduce(factArr, function (arr, fact) {
              if (~factsToSkip.indexOf(fact.name._value)) {
                return arr;
              }
              return arr.concat(_.map(_.pluck(fact.val, "_value"), function (v) {
                return v.toLowerCase();
              }));
            }, []);
          }
        }
      },

      //Raw fact values
      //This is used by admins for creating controlled vocabularies.
      tagsFromFact_raw: {
        roots: true,
        isMulti: true,
        mapping: mappings.enum,
        populate: {
          fields: ["fact"],
          strategy: function (factArr) {

            //skip these facts for now
            var factsToSkip = [
              "urlOpenTable",
              "priceRange"
            ];

            //each fact can have multiple values. 
            //Simply combine them all in one big array
            return _.reduce(factArr, function (arr, fact) {
              if (~factsToSkip.indexOf(fact.name._value)) {
                return arr;
              }
              return arr.concat(_.map(_.pluck(fact.val, "_value"), function (v) {
                return v.toLowerCase();
              }));
            }, []);
          }
        }
      },


      // ///////////////
      // //SUGGESTERS //
      // ///////////////

      // // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-suggesters-completion.html
      // // https://www.elastic.co/guide/en/elasticsearch/reference/current/suggester-context.html

      // //suggester on name:
      // suggest: {
      //   roots: true, //true (all) or (array of) rootNames
      //   isMulti: false,
      //   mapping: mappings.suggestWithRoot,
      //   populate: {
      //     fields: "name",
      //   },
      //   postReduce: function (val, props) {
      //     return {
      //       input: val,
      //       // context: { //not needed since defined by path=root in mapping
      //       // 	root: props.root
      //       // },
      //       payload: {
      //         id: props.id,
      //         root: props.root,
      //         subtypes: props.subtypes
      //       }
      //     };
      //   }
      // },

      // //search without need for context, so we can search all types in 1 go.
      // suggestAll: {
      //   roots: true, //true (all) or (array of) rootNames
      //   isMulti: false,
      //   mapping: mappings.suggestWithRootAll,
      //   populate: {
      //     fields: "name",
      //   },
      //   postReduce: function (val, props) {
      //     return {
      //       input: val,
      //       payload: {
      //         id: props.id,
      //         root: props.root,
      //         subtypes: props.subtypes
      //       }
      //     };
      //   }
      // },

    },

  };


  /////////////////////////////////////////
  //First require -> do some processing. //
  /////////////////////////////////////////

  var allProps = obj.allProperties = _.defaults({}, obj.properties, obj.propertiesCalculated);

  ///
  ///Enum-config is normalized. 
  ///- add lowercase to `transform` 
  _.each(allProps, function (prop, propName) {

    //set isMulti for all erd-properties
    if (obj.properties[propName]) {
      if (prop.isMulti !== undefined) throw new Error("isMulti not allowed on ERD-properties, unless they're calculated: " + propName);
      var propDef = generatedSchemas.properties[propName];
      if (!propDef) throw new Error("non-calculated ERD-poprety should be defined in domain: " + propName);
      prop.isMulti = !!propDef.isMulti;
    } else {
      //calculated ERD field
      prop.isMulti = !!prop.isMulti; //make false explicit as well to be clear
    }

    if (!prop.enum) return;

    // if mapping has an enum we should always do a lowercase transform
    // This is the same for the search-end
    prop.transform = prop.transform || [];
    prop.transform = _.isArray(prop.transform) ? prop.transform : [prop.transform];
    prop.transform.push("lowercase");
  });



  //Given propName, for which we look up vocab if defined, strip enumSynonyms based on said vocab.
  //We should probably already call this method on 'raw'-data for all props that have enums. 
  function stripEnumSynonyms(enums, enumValues) {

    //enums.vocabulary is a map containing <key, values> where values are all the synonyms
    //Process: 
    //1. fetch all the bins for each of the values. (do a static reverse index for this?)
    //2. return the first element of each found bin

    return _.compact(_.uniq(_.reduce(_.values(_.pick(enums.inverseMap, enumValues)), function (arr, val) {
      return arr.concat(val);
    }, [])));

  }

  /**
   * @param  {[type]} dto - direct dto input from Rethink
   * @return {[type]}     [description]
   */
  obj.cleanupEnumSynonymsInRethinkDTO = function (dto) {

    return dto; 

    //BELOW CODE RESULTS IN BUG: #284
    //COMMENTING OUT FOR NOW.
    // dto = _.reduce(dto, function (agg, propVal, propName) {

    //   var propDef = allProps[propName];
    //   if (!propDef) return agg; //for id

    //   ///////////////////////////////////////////
    //   // Check for enum and dedupe enum values //
    //   ///////////////////////////////////////////
    //   var enumObj = propDef.enum;
    //   if (!enumObj) return agg;

    //   var isSingleItemOrig = !_.isArray(propVal);
    //   propVal = stripEnumSynonyms(enumObj, _.isArray(propVal) ? propVal : [propVal]);

    //   if (isSingleItemOrig && !propVal.length) return agg;

    //   agg[propName] = isSingleItemOrig ? propVal[0] : propVal;

    //   return agg;
    // }, dto);

    // return dto;
  };

  singleton = obj;

  return singleton;
};
