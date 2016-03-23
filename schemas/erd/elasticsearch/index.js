var _ = require("lodash");

//This file describes elasticsearch mappings. 
//Each domain-property that IS NOT described here, is mapped verbatim. 
//If a domain-property should NOT be indexed in ES it should be made explicit here. 
//
//TODO: Calculated properties should also be allowed. 
//These is likely seperate config altogether, since we must
//loop them separately in renewEsMapping and populateES jobs


//Elasticsearch mappings which may be included by reference. 
//We first implemented this by string lookup but this gave some weird errors
//on geo-mapping. This seems cleaner anyway.
var mappings = require("../../domain/utils").mappings;

var singleton;
module.exports = function (generatedSchemas) {

  var vocabs = require("../../../vocabularies")(generatedSchemas);



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
      "aggregateRating", "genre"
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

    properties: {

      genre: {
        enum: vocabs.genre
      },

      subtypes: {
        enum: vocabs.subtypes
      },

      ratingValue: {
        mapping: "double",
        transform: "float"
      },

      ratingCount: {
        mapping: "long",
        transform: "float"
      },

      aggregateRating: {
        mapping: "object"
      },

      geo: {
        mapping: mappings.geo,
        transform: "geo"
      },

      name: {
        mapping: {
          type: "string",
        },
        fields: {
          "raw": mappings.notAnalyzed
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

      "startDate": {
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


      ////////////////////////////////////////
      //Raw fields: use for vaocab creation //
      ////////////////////////////////////////
      raw_subtypes: {
        roots: true, //true (all) or (array of) rootNames
        isMulti: true,
        mapping: mappings.enum,
        populate: {
          fields: "subtypes",
        },
      },

      raw_genre: {
        roots: "CreativeWork",
        isMulti: true,
        mapping: mappings.enum,
        populate: {
          fields: "genre"
        },
      },

      //We don't use a suggester to lookup tags, since the result is deduped. 
      //i.e.: only 1 result for genre:action is given
      //Instead we probably create a separate index that let's you search for 
      //tags / vocabulary terms.
      all_tags: {
        roots: true,
        isMulti: true,
        mapping: mappings.enum,
        postPopulate: { //populate *after* vocab lookup + transform
          fields: ["genre", "subtypes"]
        },
      },


      ///////////////
      //SUGGESTERS //
      ///////////////

      // https://www.elastic.co/guide/en/elasticsearch/reference/current/search-suggesters-completion.html
      // https://www.elastic.co/guide/en/elasticsearch/reference/current/suggester-context.html

      //suggester on name:
      suggest: {
        roots: true, //true (all) or (array of) rootNames
        isMulti: false,
        mapping: mappings.suggestWithRoot,
        populate: {
          fields: "name",
        },
        postReduce: function (val, props) {
          return {
            input: val,
            // context: { //not needed since defined by path=root in mapping
            // 	root: props.root
            // },
            payload: {
              id: props.id,
              root: props.root,
              subtypes: props.subtypes
            }
          };
        }
      },
    },

    defaultPropertyRelations: {

    }
  };

  //Need for singleton (instead of local copy) 
  //because we change this object in process, and this change
  //should be propagated to all stuff referencing it.
  singleton = singleton || obj;

  if (singleton !== obj) return singleton;

  /////////////////////////////////////////
  //First require -> do some processing. //
  /////////////////////////////////////////

  var allProps = _.extend({}, obj.properties, obj.propertiesCalculated);

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

  return singleton;
};
