var _ = require("lodash");
var Promise = require("bluebird");
var colors = require("colors");

var domainUtils = require("../../schemas/domain/utils");
var domainConfig = require("../../schemas/domain/_definitions/config");
var roots = domainConfig.domain.roots;

var cardViewModel = require("../cardViewModel");
var FilterQuery;

var appRoot = require('app-root-path');

var pos = require('pos');
var chunker = require('pos-chunker');

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
  CreativeWork: [],
  OrganizationAndPerson: []
};

//used for type-less query
var fixedTypesInOrder = ["Event", "PlaceWithOpeninghours", "CreativeWork", "OrganizationAndPerson"];

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

function fakeFilters(combinedResult) {

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
      }]
    }
  });
}

function enrichWithFilters(command, filterQueryUtils) {
  return function (combinedResult) {

    var root = command.filterContext.getRoot();

    if (root !== "CreativeWork") return fakeFilters(combinedResult);

    //fetch all supported properties for root
    var rootMap = filterQueryUtils.getRootMap(root);

    //all properties that are indexed in ES and can thus be queried
    var allProperties = filterQueryUtils.erdConfig.allProperties;

    //get all the facetProperties supported by this root
    var facetProperties = _.reduce(_.pick(allProperties, _.keys(rootMap)), function (agg, v, k) {
      if (v.facet) {
        agg[k] = v;
      }
      return agg;
    }, {});

    ////////////////////////////////////////
    //TODO: FETCH BASED ON EXPAND AS WELL //
    ////////////////////////////////////////

    var supportedFilters = _.reduce(facetProperties, function (arr, v, k) {
      var facetDTO = {
        type: v.facet.type,
        name: k, //TODO: this will be dot-notation for expand
        label: k,
        help: "we need to define help text" //TODO
      };

      //TODO: will change on dot-notated props. Then type is, say, location, while root is, say, event
      var type = root;

      if (v.facet.type === "enum") {
        var label = v.facet.label;
        if (label) {
          facetDTO.label = _.isFunction(label) ? label(root, type) : label;
        }
        facetDTO.values = [{
          val: "Brooklyn",
          nr: 48
        }, {
          val: "Astoria",
          nr: 48
        }, {
          val: "Soho",
          nr: 48
        }];

        arr.push(facetDTO);
      }
      return arr;
    }, []);

    var result = _.extend(combinedResult.results, {
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
        filters: supportedFilters
      }
    });


    return result;



    //TODO PRESENTING FILTERS 
    //1. fetch all available es-fields per root
    //2. ... including expanded ones
    //3. ... that are available for filtering? hmm, shouldn't this be all filters, since otherwise how to link NLP?
    //4. intersect with all fields for which enums are set. 
    //4. other filters that are deemed important such as ranges
    //5. Create labels for all filters including expanded ones. 
    //
    //NO: NOT ALL FILTERS NEED TO BE SUPPORTED BY FACETS
    //YES: ALL FILTERS NEED TO BE SUPPORTED BY *ACTIVE* FACETS
    //
    //TODO CREATING FILTERS: 
    //1. FROM PATH
    //filterQueryUtils.getPathForCompoundKey(root, "location.containedInPlace.name".split(".")));
    //

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


function createFilterQuery(command) {

  if (!command.type) {
    throw new Error("command.type shoud be defined");
  }

  //auto load expand-map
  if (command.includeCardFormatting) {
    var refs = command.meta.refs = command.meta.refs || {};
    refs.expand = refs.expand || expandMap[command.type];
  }

  command.page = command.page || 0;

  //default sort
  command.sort = command.sort || {
    type: "doc"
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

var tagger = new pos.Tagger();

var middleware = {
  superSweetNLP: function superSweetNLP(req, res, next) {
    if (req.body.isNew && !req.type && req.body.question !== undefined) {

      var question = req.body.question.toLowerCase();

      var words = new pos.Lexer().lex(question);
      var taggedWords = tagger.tag(words);

      var tags = "";
      _.each(taggedWords, function (val) {
        var word = val[0];
        var tag = val[1];
        tags += " " + word + "/" + tag;
      });
      tags = tags.trim();


      var ruleMap = {

        NUMBER_CHUNK: {
          ruleType: 'tokens',
          pattern: '[{ word:/one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen/}]',
          result: "CD"
        },

        NUMBER_CHUNK1: {
          ruleType: 'tokens',
          pattern: '[{ tag:CD}]',
          result: "CD"
        },

        //january -> MONTH
        MONTH: {
          ruleType: 'tokens',
          pattern: '[{ word:/january|february|march|april|may|june|july|august|september|october|november|december/ }]',
          result: "MONTH"
        },

        //weekdays
        //sundays -> weekday
        WEEKDAY: {
          ruleType: 'tokens',
          pattern: '[{ word:/monday|tuesday|wednesday|thursday|friday|saturday|sunday(s)*/}]',
          result: "WEEKDAY"
        },

        //e.g.: afternoon
        TIMEOFDAY: {
          ruleType: "tokens",
          pattern: "[{word:/morning|afternoon|evening|night|midnight|midday/}]",
          result: "TIMEOFDAY"
        },

        TIMESPAN: {
          ruleType: 'tokens',
          pattern: '[{word:/day(s)*|week(s)*|month(s)*|year(s)*/}]',
          result: "TIMESPAN"
        },


        //E.g. next month
        RELATIVE_DATE1: {
          ruleType: 'tokens',
          pattern: "[{ word:/this|next/}] [{chunk:TIMESPAN}]",
          result: "RELATIVE_DATE"
        },

        //E.g.: 3 weeks
        RELATIVE_DATE2: {
          ruleType: 'tokens',
          pattern: "[{chunk:CD}] [{chunk:TIMESPAN}]",
          result: "RELATIVE_DATE"
        },


        //month + day -> DATE
        //january 12 -> DATE
        DATE_FROM_MONTH: {
          ruleType: "tokens",
          pattern: "[{chunk:MONTH}] [{word:\\d{1,2}; chunk:CD}]",
          result: "DATE"
        },

        //Simple terms that directly indicate a date.
        //e.g.: yesterday -> DATE
        //now (as in 3 weeks from now) 
        DATE_FROM_DAY_DIRECTLY: {
          ruleType: 'tokens',
          pattern: '[{ word:/yesterday|today|tomorrow|now/}]',
          result: "DATE"
        },

        //date from weekday
        //this sunday -> DATE
        //next saturday -> DATE
        DATE_FROM_WEEKDAY: {
          ruleType: "tokens",
          pattern: "[{word:this|next}] [{chunk:WEEKDAY}]",
          result: "DATE"
        },

        //Used to compose compound dates
        //(DATE | WEEKDAY) in RELATIVE_DATE -> DATE
        //e.g: tomorrow in 3 weeks
        DATE_FROM_RELATIVEDATE1: {
          ruleType: "tokens",
          pattern: "[{chunk:/DATE|WEEKDAY/}] [{word:in}] [{chunk:RELATIVE_DATE}]",
          result: "DATE"
        },

        //RELATIVE_DATE from (DATE | WEEKDAY) -> DATE
        //e.g. 3 weeks from tomorrow
        //16 days after tomorrow
        DATE_FROM_RELATIVEDATE2: {
          ruleType: "tokens",
          pattern: "[{chunk:RELATIVE_DATE}] [{word:/from|before|after/}] [{chunk:/DATE|WEEKDAY/}]",
          result: "DATE"
        },

        //friday afternoon
        DATE_FROM_TIMEOFDAY: {
          ruleType: "tokens",
          pattern: "[{chunk:/DATE|WEEKDAY/}] [{chunk:TIMEOFDAY}]",
          result: "DATE"
        },

        //(the) afternoon of DATE
        DATE_FROM_TIMEOFDAY1: {
          ruleType: "tokens",
          pattern: "[{tag:DT}]* [{chunk:TIMEOFDAY}] [{word:/of/}]* [{chunk:/DATE|WEEKDAY/}] ",
          result: "DATE"
        },


        //catchall for weekdays if not matched using more complex stuff
        WEEKDAY_TO_DATE: {
          ruleType: "tokens",
          pattern: "[{chunk:WEEKDAY}]",
          result: "DATE"
        },



        ///////////////////////

        //noun phrase plural


        //e.g: the large black cat
        //KWHEN: often denoting: 
        // - Proper Noun (e.g.: name of bar)
        // - (sub)type + adjectives (e.g.: best italian restaurants)
        //   - all Delightfully cheap restaurants
        NP: {
          ruleType: 'tokens',

          //determiner + 
          //Adverb | Adverb, comparitive | Adverb, superlative
          //adjective | Adjective, comparative | Adjective, superlative
          //singular/plural (proper) noun
          pattern: '[ { tag:/DT|RB(R|S)*|JJ(R|S)*|NN.*?/ } ]+',
          result: 'NP'
        },

        // //NOTE: just as an example: if we add this, we need to allow for this chunk to match in NP as well..
        // ALL: {
        //   ruleType: 'tokens',
        //   pattern: '[{ word:/all/; tag:DT }]',
        //   result: "ALL"
        // },

        // //.. we could use this rule to do that.
        // ALL_NP: {
        //   ruleType: 'tokens',
        //   pattern: '[ { chunk:ALL } ] [ { chunk:NP } ]',
        //   result: 'NP'
        // },


        //prepositional phrase is a noun phrase preceded by a preposition
        //e.g.: 'in the house' and 'by the cold pool' 
        //KWHEN: often denoting where / when
        PP: {
          ruleType: 'tokens',
          pattern: '[ { tag:IN } ] [ { chunk:NP } ]',
          result: 'PP'
        },

        // //verb phrase:  verb followed by one or more noun or prepositional phrases
        // //e.g.: 'washed the dog in the bath'
        // //KWHEN: ??
        // VP: {
        //   ruleType: 'tokens',
        //   pattern: '[ { tag:/VB.*?/ } ] [ { chunk:/NP|PP/ } ]+',
        //   result: 'VP'
        // },

        // //e.g.: The doctor saw the patient at the surgery.
        // CLAUSE: {
        //   ruleType: 'tokens',
        //   pattern: '[ { chunk:NP } ] [ { chunk:VP } ]',
        //   result: 'CLAUSE'
        // },


        //we may have tagged some numbers that were part of NP. 
        //We re-add these numbers to NP here, unless they are part of another bigger (temporal) structure
        NP_WITH_NR: {
          ruleType: "tokens",
          pattern: '[ { chunk:NP }]* [ { chunk:CD } ] [ { chunk:NP }]*',
          result: 'NP'
        }
      };

      var rules = [
        ruleMap.NUMBER_CHUNK,
        ruleMap.NUMBER_CHUNK1,
        ruleMap.MONTH,
        ruleMap.WEEKDAY,
        ruleMap.TIMEOFDAY,
        ruleMap.TIMESPAN,
        ruleMap.RELATIVE_DATE1,
        ruleMap.RELATIVE_DATE2,
        ruleMap.DATE_FROM_MONTH,
        ruleMap.DATE_FROM_DAY_DIRECTLY,
        ruleMap.DATE_FROM_WEEKDAY,
        ruleMap.DATE_FROM_RELATIVEDATE1,
        ruleMap.DATE_FROM_RELATIVEDATE2,
        ruleMap.DATE_FROM_TIMEOFDAY,
        ruleMap.DATE_FROM_TIMEOFDAY1,
        ruleMap.WEEKDAY_TO_DATE,

        ruleMap.NP,
        ruleMap.NP_WITH_NR,
        ruleMap.PP,
        ruleMap.VP
      ];

      var chunks = chunker.chunk(tags, rules);

      res.json({
        tags: tags,
        chunks: chunks
      });

      return;
      // return next();
    }
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

      //if type no found to a 'all-type' query which is later on separated
      //Also make sure 'filter' object exists
      filterContext = _.defaults(filterContext || {}, {
        filter: {},
        type: "all"
      });

      //termFound was used for type-lookup. Remove that for lookup of name
      if (termFound) {
        lowerBodySplit = _.difference(lowerBodySplit, [termFound]);
      }

      if (lowerBodySplit.length) {
        filterContext.filter.name = lowerBodySplit.join(" ").trim();
      }

      _.extend(req.body, filterContext, {
        wantUnique: false
      });
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


  //Single Item
  app.get("/entities/:id", function (req, res, next) {

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


  //quick search returning results on every kepress
  //Used in
  //- collection "add dialog"
  app.post('/suggest', function (req, res, next) {

    var body = req.body;
    var err;
    if (!body.query) {
      err = new Error("'query' body param required");
      err.status = 400;
      return next(err);
    }

    var types = _.keys(rootsLowerCaseMap);
    if (body.type) {
      var type = body.type.toLowerCase();
      if (rootsLowerCaseMap[type]) {
        types = [type];
      } else {
        err = new Error("'type' body param should be one of existing types: " + types.join(","));
        err.status = 400;
        return next(err);
      }
    }

    //compound all indices together that we want to query
    var indexString = _.map(types, function (type) {
      return "kwhen-" + type;
    }).join(",");

    //create suggest body. 
    //This consists of a group per type
    var esBody = _.reduce(types, function (agg, type) {
      var rootCorrectCase = rootsLowerCaseMap[type];
      agg[rootCorrectCase] = {
        completion: {
          field: "suggest",
          context: {
            root: rootCorrectCase
          }
        }
      };
      return agg;
    }, {
      "text": body.query
    });

    command.esClient.suggest({
        index: indexString,
        body: esBody
      })
      .then(function (esResult) {
        delete esResult._shards;

        res.json(_.reduce(esResult, function (agg, groupForType, typeName) {
          if (groupForType[0].options.length) {
            agg[typeName] = groupForType[0].options;
          }
          return agg;
        }, {}));
      })
      .catch(function (err) {
        console.log(err);
        next(err);
      });
  });


  //Search returns results on suggestion Enter
  //Used in
  //- collection "add dialog"
  //
  //Frontend needs to do a query per type.
  app.post('/suggestCards', function (req, res, next) {

    var body = req.body;
    var err;

    var types = _.keys(rootsLowerCaseMap);
    if (body.type) {
      var type = body.type.toLowerCase();
      if (rootsLowerCaseMap[type]) {
        types = [type];
      } else {
        err = new Error("'type' body param should be one of existing types: " + types.join(","));
        err.status = 400;
        return next(err);
      }
    }

    //pagination
    var page = body.page || 0;

    //create promises
    var promiseMap;
    try {
      promiseMap = _.reduce(types, function (agg, type) {
        var typeCorrectCase = rootsLowerCaseMap[type.toLowerCase()];

        if (!typeCorrectCase) {
          err = new Error("'type' body param should be one of existing types: " + _.keys(rootsLowerCaseMap).join(","));
          err.status = 400;
          throw err;
        }

        //if type no found to a 'all-type' query which is later on separated
        //Also make sure 'filter' object exists
        var command = _.extend({
          wantUnique: false,
          type: typeCorrectCase,
          includeCardFormatting: true,
          page: page,
          pageSize: body.type ? 10 : 5, //5 per page. Since we show multiple types, 
          sort: {
            type: "score"
          },
          meta: {
            includeCardFormatting: true
          }
        });

        //addq uery-param. Not
        if (body.query) {
          command.filter = {};
          //name.raw has enum-mapping: 1 token, lowercased. 
          //This allows to do prefix
          command.filter["name.raw"] = body.query.toLowerCase().trim();
        }

        var filterQuery = createFilterQuery(command);
        command.filterContext = filterQuery;

        var singleReqPromise = Promise.resolve()
          .then(function () {
            //perform query
            return filterQuery.performQuery();
          })
          .then(function (json) {
            return {
              totalResults: json.meta.elasticsearch.hits.total,
              filterContext: command.filterContext,
              results: conditionalEnrichWithCardViewmodel(command, json),
            };
          })
          .catch(function (err) {
            err.filterQuery = filterQuery;
            return err; //error passed as result
          });

        agg[typeCorrectCase] = singleReqPromise;
        return agg;
      }, {});

      return Promise.props(promiseMap)
        .then(function (json) {
          return res.json(json);
        });

    } catch (error) {
      next(error); //error sync -> 500
    }

  });

  //used by Search page. 
  app.post('/search', function (req, res, next) {

    //always do includeCardFormatting for simplicity
    var command = _.extend({}, req.body, {
      includeCardFormatting: true
    });

    var filterQuery;
    try {
      filterQuery = createFilterQuery(command);
      command.filterContext = filterQuery;
    } catch (err) {
      return next(err);
    }

    return Promise.resolve()
      .then(function () {
        //perform query
        return filterQuery.performQuery();
      })
      .then(createDTOS(command))
      .then(enrichWithFilters(command, filterQueryUtils))
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
  app.post('/question', middleware.superSweetNLP, function (req, res, next) {

    //always include cardFormatting
    var command = _.extend({}, req.body, {
      includeCardFormatting: true
    });

    //typeless query -> should be split multiple typed queries
    var filterQueries;
    try {

      if (command.type === "all") {

        //group filter queries by type
        filterQueries = _.map(fixedTypesInOrder, function (type) {
          return createFilterQuery(_.defaults({
            type: type
          }, command));
        });
      } else {
        //temporary way of adding related filter queries
        filterQueries = createRelatedFilterQueries(createFilterQuery(command));
      }
    } catch (err) {
      return next(err);
    }

    var promises = _.map(filterQueries, function (filterQuery) {
      return Promise.resolve()
        .then(function () {
          //perform query
          return filterQuery.performQuery();
        })
        .then(createDTOS({
          filterContext: filterQuery,
          includeCardFormatting: command.includeCardFormatting
        }))
        .then(function (combinedResult) {
          return combinedResult.results;
        });
    });

    return Promise.all(promises)
      .then(function (jsons) {

        var outputJson = {
          results: jsons
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
