//- 1. (chunk:QUESTION) {0,1}(chunk:(NP|VP))
//- 2. ( chunk:(VP|PP))* //zero or more VP || PP
//- 3  (( tag:(VB[^\s]?|MD|TO))*( tag:VB[^\s]?))*  //ending with verb in all sorts of ways -> e.g.: going to be built
//
//TOTAL: 
//^(chunk:QUESTION ){0,1}(chunk:(NP|VP))( chunk:(VP|PP))*(( tag:(VB[^\s]?|MD|TO))*( tag:VB[^\s]?))*$
//
/////////////////////
//ACTIVE QUESTIONS
//which restaurants are open tonight                          -> chunk:QUESTION chunk:NP chunk:VP
//which restaurants will be open tonight                      -> chunk:QUESTION chunk:NP chunk:VP
//which artist plays tonight in madison square garden         -> chunk:QUESTION chunk:NP chunk:VP
//which jazz bands play tonight at my favorite club           -> ERROR
//which fine italian restaurants allow for reservations tomorrow night near grand central station ->  chunk:QUESTION chunk:NP chunk:VP
//which events does arctic monkeys perform tonight at my favorite club  -> chunk:QUESTION chunk:NP chunk:VP chunk:VP
//which events does arctic monkeys perform tonight that are still available -> chunk:QUESTION chunk:NP chunk:VP chunk:VP chunk:VP
//which restaurants are fine to go to tonight -> chunk:QUESTION chunk:NP chunk:VP chunk:VP
//
//
//which restaurants are|will open
//which artist will play
//which events does arctic monkeys perform
//
//when does the crazy goose open
//when will ...
//do the avengers play (where | when is also implicit here)
//when do the arctic monkeys perform
//is the green lantarn open (!! SPECIAL CASE)
//
//all bands who|that|which play tonight (that have high ratings)
//all bands playing tonight
//jazz concerts tonight (no verb)
//
// 
//
// DIFFERENT TENSES
// Simple Present:        Is the house built?
// Simple Past:           Was the house built?
// Present Perfect:       Has the house been built?
// Past Perfect:          Had the house been built?
// will-future:           Will  the house be built?
// going to-future:       Is  the house going to be built?
// Future Perfect:        Will  the house have been built?
// Conditional I:         Would the house be built?
// Conditional II:        Would the house have been built?
// Present Progressive:   Is  the house being built?
// Past Progressive:      Was the house being built?
//
// TENSES CAN BE COMBINED WITH WWWW-QUESTIONS
// 
////////////////
///PASSIVE QUESTIONS
//will coldplay play tomorrow -> chunk:QUESTION chunk:VP chunk:VP
//
//
//which restaurants are open -> chunk:QUESTION chunk:NP tag:VBP tag:VB


var FALLBACK_REASON = {
  TODO_PROPER_NOUN: "TODO_PROPER_NOUN",
  PROPER_NOUN_AMBIGUOUS: "PROPER_NOUN_AMBIGUOUS",
  PROPER_NOUN_NOT_FOUND: "PROPER_NOUN_NOT_FOUND",
  NOUN_UNDECIDED: "NOUN_UNDECIDED",
  NO_NP_FOUND: "NO_NP_FOUND",
  QUESTION_NOT_MATCHED: "QUESTION_NOT_MATCHED"
};

var NOUN_DECISION = {
  SINGLE_PROPER_NOUN_FOUND: "SINGLE_PROPER_NOUN_FOUND",
  SUBTYPE_MATCH_PLURAL: "SUBTYPE_MATCH_PLURAL",
  SUBTYPE_WHICH: "SUBTYPE_WHICH",
  SUBTYPE_MATCH_SIMPLE: "SUBTYPE_MATCH_SIMPLE",
  SUBTYPE_MATCH_START_WITH_DT: "SUBTYPE_MATCH_START_WITH_DT",
  FALLBACK: "FALLBACK"
};



var _ = require("lodash");
var Promise = require("bluebird");

var chunkUtils = require("./utils");

module.exports = function (command) {

  var NLPRules = require("./rules")(command);

  var esClient = command.esClient;

  var roots = command.roots;
  var cacheUtils = command.cacheUtils;
  var vocabs = command.vocabs;

  var rootsToProperCase = _.reduce(roots, function (agg, root) {
    agg[root.toLowerCase()] = root;
    return agg;
  }, {});


  // //TODO: if nothing found, perhaps: 
  // //- only go for prefixes, until single NN.
  // //
  // //This to find things like "Coldplay concerts"
  // //Here 'concerts' should be tagged as 'subtype' already
  // function doProperNounQuery(name) {

  //   var suggestQuery = {
  //     index: "kwhen-place,kwhen-event,kwhen-placewithopeninghours,kwhen-organizationandperson,kwhen-creativework",
  //     type: 'type1',
  //     body: {
  //       "text": name,
  //       "All": {
  //         "completion": {
  //           "field": "suggestAll"
  //         }
  //       }
  //     }
  //   };

  //   return esClient.suggest(suggestQuery);
  // }


  function fetchRootProperCased(rootNameLower) {
    return rootsToProperCase[rootNameLower];
  }

  function processNonProper(commandObj) {

    return Promise.resolve()
      .then(function () {

        var root = fetchRootProperCased(commandObj.nounSignals.subtypeRoots[0]);

        //subtype as found in cache. This can be an alias, so bring it back to the original
        var subtype = commandObj.nounSignals.subtypeMatched;

        var subtypeForSupportedTags = vocabs.subtypes.inverseMap[subtype.toLowerCase()];

        var supportedTags = [];

        if (subtypeForSupportedTags) {
          //may have multiple elements. e.g.: 'concert' may refer to subtype danceevent, festival, musievent

          //take the unique union over all subtypes. i.e.: tags specified specifically for concert, etc.
          supportedTags = _.uniq(_.reduce(subtypeForSupportedTags, function (arr, subtype) {

            var attrs = cacheUtils.supportedAttribsPerType[subtype];
            if (attrs) {
              return arr.concat(attrs.tags);
            }
            return arr;
          }, []));

        }

        //add supported tags for root
        supportedTags = _.unique(supportedTags.concat(cacheUtils.supportedAttribsPerType[root.toLowerCase()].tags));

        var filterContext = {
          filter: {},
          type: root,
          wantUnique: false, //plural
        };

        //add subtype filter if matched subtype isn't root
        if (subtype !== root.toLowerCase()) {
          //NOTE: we use the original subtype here (which could be an alis like 'concert') instead of actual subtype. 
          //This solves issues where 'concert' matches to more subtypes (danceevent, festival, musievent)
          filterContext.filter.subtypes = subtype;
        }

        //build list of adverbs and adjectives
        //add those as term-filters to 'tagsFromFact'
        if (commandObj.nounSignals.isComplexNoun) {

          var foundTags = _.pluck(chunkUtils.filter(commandObj.nounSignals.np.parts, {
            tag: "(JJ*?|RB*?)"
          }), "word");


          var foundSupportedTags = _.intersection(foundTags, supportedTags);
          filterContext.filter.tagsFromFact = foundSupportedTags;

          //DEBUG: unsupported filters
          commandObj.sentenceSignals.filtersUnmatched = _.difference(foundTags, supportedTags);
        }

        //DEBUG: supported filters
        commandObj.sentenceSignals.filters = filterContext.filter;

        filterContext.nlpMeta = commandObj;

        return filterContext;
      });
  }

  function processProper(commandObj) {
    return Promise.resolve()
      .then(function () {

        commandObj.doFallback = true; //temporary
        commandObj.doFallbackReason = FALLBACK_REASON.TODO_PROPER_NOUN;
        return commandObj;
      });
  }


  function processFallback(commandObj) {
    return Promise.resolve()
      .then(function () {
        if (!commandObj.doFallbackReason) {
          throw new Error("sanity check: No fallback reason");
        }
        commandObj.doFallback = true;
        return commandObj;
      });
  }

  function createQueryPlan(question) {

    var nounSignals = {

      noNounFound: false,

      //if true, NP consists of multiple parts
      isComplexNoun: false,

      //if true, weak signal for non-proper noun
      nounExistsAtEnd: false,

      //if true, noun is the plural of the subtype found
      subtypePlural: false,

      //indicates proper noun found (zero or more) based on verbatim text of first NP
      properNounsFound: false,

      //true -> indices we've found NP to start with DT (not the). 
      //Good indicator for non-proper noun
      startWithNonProperNounDeterminer: false,


      //////////////
      ///Multi-nou stuff

      //if true, likely compound or improper defined NP or npConsistsOfOnlyNouns=true
      multipleNounsFound: false,

      //if true, we try to 'repair' multiple nouns. 
      //TODO: we should probably only do that when no proper nouns found, otherwise
      //'the bulaga restaurant' would be wrongly changed
      multipleNounsOneSubtypeFound: false,

      //true -> slight positive signal we're looking at proper noun
      multipleNounsNoSubtypeFound: false,

      //would be weird if we found this
      multipleNounsMultipleSubtypesFound: false,

      //np that only consists of NN is likely a Proper Noun
      //e.g.: Phil Collins
      npConsistsOfOnlyNouns: false,


      ////////

      //set to the matched subtype if found
      subtypeMatched: null,

      //if subtype found, defines a collection of roots that can contain this subtype.
      subtypeRoots: null,

      //actual proper nouns
      properNouns: null,

    };


    var sentenceSignals = {
      questionType: null,
      questionTense: null, //TODO
      temporal: null, //specific, undefined (default now), past, present, future
      spatial: null, //noun-place-indication, specific lat/long, address/corner/between, user-location
      filters: {}, //based on JJ(.)? + RB(.)?
      sort: null, //specific: JJ(good) / JJS(better) / JJS(best), (also RBR, RBS)  default based on (type, location to user, other context?)
    };

    var err;

    return Promise.resolve()
      .then(function () {

        var tags = NLPRules.getTags(question);
        var sChunk = NLPRules.getChunks(tags);

        var currentChunk = {
          type: "top",
          abstract: null, //ordening
          abstractText: null, //ordening
        };

        var chunks = chunkUtils.getParts(currentChunk, sChunk);

        var commandObj = {
          doFallback: false,
          doFallbackReason: null,
          nounDecisionType: null,
          nounDecision: {
            isProper: null,
            isPlural: null,
            confidence: 0, //manual assigned between 0 and 1
          },
          sentenceSignals: sentenceSignals,
          nounSignals: nounSignals,
          posMap: {
            //map containing all values found per POS tag
          },
          tags: tags,
          chunks: sChunk,
          tree: chunks,

        };

        //MD + EX -> were there
        //NP -> The triple comma club, italian restaurants, 
        //VP -> (MD)* NN (verb)
        if (chunks.abstractText.match(/^(chunk:QUESTION )?(tag:MD (tag:EX )?)?(chunk:(NP|VP))( tag:(VB[^\s]?|MD|TO))*( chunk:(VP|PP|DATE|DURATION))*(( tag:(VB[^\s]?|MD|TO))*( tag:VB[^\s]?))*$/)) {

          //detect question type
          detectQuestionType(chunks, commandObj);

          var otherNPs = chunkUtils.filter(chunks.parts, {
            chunkType: "NP"
          }, true, ["DURATION", "DATE"]);

          if (!otherNPs.length) {
            nounSignals.noNounFound = true;
            commandObj.doFallbackReason = FALLBACK_REASON.NO_NP_FOUND;
            return processFallback(commandObj);
          }

          var np = nounSignals.np = otherNPs.shift();

          //analyze noun structure. This gives signals on how to interpret noun. 
          detectNPSignals(nounSignals, np, getAllSubtypesMap());

          //Fech constaints which can be transformed to filters later on. 
          //Independent on how we process the question later on, the following is a complete list
          //of constraints: 
          //
          //- Noun Phrases (NP) other than the main NP. 
          //  TODO / NOTE: we leave some info here by not also looking for Verb Phrases (VP), in that verb phrases
          //  may indicate how NPs interact with main noun. THAT"S FOR LATER
          //- Prepositional Phrases (PP) 
          //- Dates (DATE)
          //- Duration (DURATION)
          (function fetchConstraints() {
            var posMap = commandObj.posMap;

            posMap.np = otherNPs;

            posMap.date = chunkUtils.filter(chunks.parts, {
              chunkType: "DATE"
            }, true, ["DURATION"]);

            posMap.duration = chunkUtils.filter(chunks.parts, {
              chunkType: "DURATION"
            }, true, ["DATE"]);


            //make a list of all PPs that are a date/duration/np container
            var ppContainerForDateOrDuration = _.compact(_.map(posMap.date.concat(posMap.duration, posMap.np), function (obj) {
              if (obj.parent.chunkType === "PP") {
                return obj.parent;
              }
            }));

            //find all the PPs but excluding the just found date/duration containers
            posMap.pp = chunkUtils.filter(chunks.parts, {
              chunkType: "PP"
            }, true, ["DURATION", "DATE"], ppContainerForDateOrDuration);


          }());

          ////////////////////////////////
          // DEPRECATED SUGGESTER
          // SEE #245
          // 
          // Redo proper noun lookup using in-mem structure doing lookup from large to small shingles 
          // with constraint that proper noun should be at end of NP. 
          // This makes it performant enough probably.
          //
          // return Promise.resolve()
          //   .then(function () {

          //     //TODO: should we group ES query on type? 
          //     //Now we do it in post. Seems good enough?
          //     return doProperNounQuery(np.text)
          //       .then(function (doc) {

          //         // var options = doc.All[0].options;
          //         var options = [];

          //         if (options.length) {
          //           nounSignals.properNounsFound = true;
          //           nounSignals.properNouns = _.map(options, function (option) {
          //             return {
          //               id: option.payload.id,
          //               name: option.text,
          //               root: option.payload.root,
          //               subtypes: option.payload.subtypes
          //             };
          //           });
          //         }
          //       });
          //   })
          //   .then(function () {
          //     //Based on Noun signals, try to find it we're looking at proper / plural / singular
          //     return decideNounTypeBasedOnSignals(nounSignals, sentenceSignals, commandObj, np);
          //   });

          //Based on Noun signals, try to find it we're looking at proper / plural / singular
          return decideNounTypeBasedOnSignals(nounSignals, sentenceSignals, commandObj, np);


        } else {

          commandObj.doFallbackReason = FALLBACK_REASON.QUESTION_NOT_MATCHED;
          return processFallback(commandObj);
        }
      });
  }

  function getAllSubtypesMap() {
    // <subtype -> [root]>
    var subtypeToRoots = {};
    _.each(cacheUtils.supportedAttribsPerType, function (obj, root) {
      _.each(obj.subtypes, function (val) {
        subtypeToRoots[val] = subtypeToRoots[val] || [];
        subtypeToRoots[val].push(root);
      });
    });
    return subtypeToRoots;
  }

  function detectQuestionType(chunks, commandObj) {
    var qType = chunkUtils.find(chunks.parts, {
      chunkType: "QUESTION"
    });

    if (qType) {

      commandObj.sentenceSignals.questionType = {
        tag: qType.parts[0].tag,
        word: qType.parts[0].word
      };
    } else {
      commandObj.sentenceSignals.questionType = {
        tag: "IMPLICIT"
      };
    }
  }


  function decideNounTypeBasedOnSignals(nounSignals, sentenceSignals, commandObj, np) {

    var nd = commandObj.nounDecision;

    return Promise.resolve()
      .then(function () {

        if (nounSignals.properNounsFound && nounSignals.properNouns.length === 1) {

          //if we've exactly identified 1 proper noun let's go with that no matter what.

          commandObj.nounDecisionType = NOUN_DECISION.SINGLE_PROPER_NOUN_FOUND;

          nd.isProper = true;
          nd.confidence = np.abstract.length > 1 ? 0.9 : 0.6; //high confidence if we noun consists of more than 1 term. 
          return processProper(commandObj);
        }


        //PRE: not 1 proper noun match

        if (nounSignals.subtypeMatched && nounSignals.subtypePlural) {

          //Very likely that we're talking a non-proper noun. 
          //
          //This among other things because it's very unlikely that a proper noun 
          //contains a plural form of a subtype. 
          //
          //e.g.: fine italian restaurants

          commandObj.nounDecisionType = NOUN_DECISION.SUBTYPE_MATCH_PLURAL;

          nd.isProper = false;
          nd.isPlural = true;

          nd.confidence = 0.8;

          return processNonProper(commandObj);
        }


        var questionsIndicatingList = ["which", "what"];
        if (nounSignals.subtypeMatched && ~questionsIndicatingList.indexOf(commandObj.sentenceSignals.questionType.word)) {

          //starting with 'which/what' -> very likely we want a list of results

          commandObj.nounDecisionType = NOUN_DECISION.SUBTYPE_WHICH;

          nd.isProper = false;
          nd.isPlural = true;

          nd.confidence = 0.8;

          return processNonProper(commandObj);
        }


        //PRE: 
        //- not 1 proper noun match
        //- not subtype match + plural

        if (nounSignals.subtypeMatched && !nounSignals.isComplexNoun) {

          //we matched a subtype, singular, and noun consists of only 1 element -> restaurants

          commandObj.nounDecisionType = NOUN_DECISION.SUBTYPE_MATCH_SIMPLE;

          nd.isProper = false;

          //singular by definition of rule-stacking, bc: NOUN_DECISION.SUBTYPE_MATCH_PLURAL
          nd.isPlural = nounSignals.subtypePlural; //singular
          nd.confidence = 0.9;

          return processNonProper(commandObj);
        }

        //PRE: 
        //- not 1 proper noun match
        //- not subtype match + plural
        //- not subtype match + singular simple noun

        if (nounSignals.subtypeMatched && nounSignals.startWithNonProperNounDeterminer) {

          //match: subtype match + singular complex noun + start with DT but not 'the'
          //e.g.: any restaurant 

          commandObj.nounDecisionType = NOUN_DECISION.SUBTYPE_MATCH_START_WITH_DT;

          nd.isProper = false;
          nd.isPlural = true;
          nd.confidence = 0.7;

          return processNonProper(commandObj);
        }

        //////////////////////////////////////////////////////////////////////////
        //TODO: FALLBACK SHOULD BE ON A SPECTRUM. I.E.: BASED ON SIGNALS WE PROVIDE MULTIPLE ROWS, WHICH
        //TOGETHER STILL MIGHT GIVE A REASONABLE ANSWER.
        //
        //IN OTHER WORDS: DEFAULT / OLD CODE SHOULD BE DEPRECATED BY SOLUTION BELOW
        //WHICH DECIDES ON *ALL* ROWS
        //////////////////////////////////////////////////////////////////////////


        //HAVEN'T REACHED SOLID ENOUGH CONCLUSION. GOING WITH FALLBACK

        nd.isProper = null; //just for explicitness
        nd.confidence = 0.4;

        commandObj.nounDecisionType = NOUN_DECISION.FALLBACK;

        //PRE: 
        //- not 1 proper noun match
        //- not subtype match + plural
        //- not subtype match + singular simple noun
        //- not subtype match + singular complex noun + start with DT but not 'the'
        //- multiple proper nouns found + Np consists only of nouns. -> likely proper noun (ambiguous)

        if (nounSignals.properNounsFound && nounSignals.npConsistsOfOnlyNouns) {

          //match: multiple proper nouns found + Np consists only of nouns. -> likely proper noun (ambiguous)
          nd.isProper = true;
          nd.properCandidatesMulti = true;
          nd.confidence = 0.7;

          commandObj.doFallbackReason = FALLBACK_REASON.PROPER_NOUN_AMBIGUOUS;

          //TODO: add row
        }


        if (nounSignals.properNounsFound && nounSignals.multipleNounsNoSubtypeFound) {

          ///match: multiple proper nouns found + Np found without subtype. -> likely proper noun (ambiguous)
          nd.isProper = true;
          nd.properCandidatesMulti = true;
          nd.confidence = 0.6;

          commandObj.doFallbackReason = FALLBACK_REASON.PROPER_NOUN_AMBIGUOUS;

          //TODO: add row

        }

        //likely that we're looking for Proper Noun which doesn't exists in DB
        if (!nounSignals.properNounsFound && !nounSignals.subtypeMatched && nounSignals.npConsistsOfOnlyNouns) {

          nd.isProper = true;
          nd.properCandidatesNone = true;
          nd.confidence = 0.6;

          commandObj.doFallbackReason = FALLBACK_REASON.PROPER_NOUN_NOT_FOUND;

          //TODO: question change: didn't find xxx, but here's some stuff that might interest you...
        }


        if (!commandObj.doFallbackReason) {
          if (nounSignals.properNounsFound) {
            commandObj.doFallbackReason = FALLBACK_REASON.PROPER_NOUN_AMBIGUOUS;
          } else {
            commandObj.doFallbackReason = FALLBACK_REASON.NOUN_UNDECIDED;
          }
        }


        return processFallback(commandObj);



        // //Fallback is based combination of things, resulting in multiple rows


        // //////////////////
        // // 1. PROPER NOUN BASED ON KEYWORD MATCH
        // if (nounSignals.properNounsFound) {
        //   //by rue-stacking definition, we've got multiple results
        // }


        // ////////////////////////////////
        // // 2. SUBTYPE ROWS, PLURAL
        // if (nounSignals.subtypeMatched) {

        //   //1 subtype match -> 1 subtype row

        //   //low confidence: 
        //   //instead of: 'Showing all indian restaurants'
        //   //we show: "Think you meant to see all indian restaurants"    

        // } else if (nounSignals.multipleNounsMultipleSubtypesFound) {

        //   //multiple subtypes -> multi subtype rows

        // } else {
        //   //SKIP.. no subtype rows
        // }



      });

  }

  function detectNPSignals(nounSignals, np, subtypeToRoots) {

    var lastNounIndex = np.abstract.lastIndexOf("tag:NN");
    if (!~lastNounIndex) { //NP needs NN
      throw new Error("no NN found in NP", np.text);
    }

    var multipleNouns = chunkUtils.filter(np.parts, {
      tag: "NN"
    });

    //Multiple nouns found in NP. May have many valid reasons such as when looking at Proper Noun, such as Billy Joel
    if (multipleNouns.length > 1) {

      nounSignals.multipleNounsFound = true;

      //Phil Collins denoted as "tag:NN tag:NN"
      //In general, all NP's that contain soley of NN have a high chance of being a proper 
      nounSignals.npConsistsOfOnlyNouns = multipleNouns.length === np.abstract.length;

      //for debug: show the multiple nouns found
      nounSignals.multipleNouns = _.pluck(multipleNouns, "text");

      var subtypeMapArr = _.map(nounSignals.multipleNouns, function (noun) {
        //return true if noun matches at least 1 subtype, false otherwise
        return !!_.find(subtypeToRoots, function (roots, subtype) {
          return ~noun.indexOf(subtype);
        });
      });

      var subtypeMapPostiveArr = _.compact(subtypeMapArr);

      if (!subtypeMapPostiveArr.length) {

        //although multiple nouns found, no subtype was found
        nounSignals.multipleNounsNoSubtypeFound = true;
        return;

      } else if (subtypeMapPostiveArr.length > 1) {

        //Multiple nouns as well as subtypes found in NP
        //This should never happen?
        nounSignals.multipleNounsMultipleSubtypesFound = true;
        return;
      }

      nounSignals.multipleNounsOneSubtypeFound = true;

      return repairMultipleNouns(nounSignals, np, subtypeMapArr, multipleNouns, subtypeToRoots);
    }

    //PRE: there's exactly 1 noun

    //if true, NP consists of multiple parts
    nounSignals.isComplexNoun = np.abstract.length > 1;


    //NP starting with any determiner that's not 'the' is a pretty sound signal for a non-proper noun
    //e.g: "any restaurant", "all bars"
    if (np.abstractText.indexOf("tag:DT") === 0 && np.text.indexOf("the") !== 0) {
      nounSignals.startWithNonProperNounDeterminer = true;
    }

    //Noun found at end of NP
    //weak signal for non-proper noun
    if (lastNounIndex === np.abstract.length - 1) {
      nounSignals.nounExistsAtEnd = true;
    }

    var noun = np.parts[lastNounIndex].text;

    //Match each of the defined subtypes (over all roots) as prefix-needle (edge N-gram)
    //against noun. 
    //
    //Multiple subtypes can match i.e.: place and placewithopeninghours.
    //In this case we match against the longest matching subtype.
    //
    //Moreover, a subtype may, theoretically, be defined against multiple roots
    var matchedSubtype = "";
    _.each(subtypeToRoots, function (roots, subtype) {
      if (~noun.indexOf(subtype) && subtype.length > matchedSubtype.length) {
        matchedSubtype = subtype;
      }
    });

    if (matchedSubtype) {

      //set subtypeMatched to the actual subtype matched. E.g.: "restaurant"
      nounSignals.subtypeMatched = matchedSubtype;

      //Detect plural naively: if noun ends with an 's' but subtype doesn't
      nounSignals.subtypePlural = noun.lastIndexOf("s") === noun.length - 1 && matchedSubtype.lastIndexOf("s") !== matchedSubtype.length - 1;

      //set the related roots for the matched subtype
      nounSignals.subtypeRoots = subtypeToRoots[matchedSubtype];
    }
  }


  function repairMultipleNouns(nounSignals, np, subtypeMapArr, multipleNouns, subtypeToRoots) {
    //PRE: although multiple nouns found, only 1 matched a subtype. 
    //Most likely this is caused by improper POS-tagging. 
    //e.g.: italian restaurant -> "tag:NN tag:NN"

    //Proceed as if single noun matched...

    for (var i = 0; i < subtypeMapArr.length; i++) {
      if (subtypeMapArr[i] === false) {
        var improperNounPart = multipleNouns[i];

        var newTag = "JJ"; //move to adjective. Semi-random choice
        improperNounPart.tag = newTag;
        improperNounPart.abstract = ["tag:" + newTag];
        improperNounPart.path = improperNounPart.path.replace(/(NN)/g, newTag);
      }
    }

    //fix the other data-structures
    np.abstract = [];
    np.path = "NP";
    _.each(np.parts, function (part) {
      np.abstract.push("tag:" + part.tag);
      np.path += " " + part.path;
    });
    np.abstractText = np.abstract.join(" ");

    //tag multiple nouns as repaired, but other than that continue as if single noun found
    nounSignals.multipleNounsRepaired = true;
    nounSignals.multipleNounsFound = false;

    //redo with single noun
    return detectNPSignals(nounSignals, np, subtypeToRoots);
  }

  return {
    createQueryPlan: createQueryPlan
  };

};
