var _ = require("lodash");
var pos = require('pos');
var chunker = require('pos-chunker');
var tagger = new pos.Tagger();
var colors = require("colors");

module.exports = function (command) {

  //Sometimes the simple pos-tagger makes a mistake.
  //We correct the most occuring errors here.
  var wordOverwriteMap = {
    //not VB since that's handled specifically
    open: "VBZ", //the word open should always be a VBZ (verb). Incorrectly identified as JJ (adverb)
    bar: "NN"
  };

  var tagOverwriteMap = {
    "NNS": "NN" //problems with plural nouns
  };

  //HACK: set all tags to be adjectvices
  //this fixes things like 'italian', 'french' etc to be improperly tagged as NN
  var allTags = [];
  var isWordOverwriteMapWarmed = false;

  function warmWordOverwriteMap() {

    //all subtypes are identified as NN
    _.each(command.cacheUtils.supportedAttribsPerType, function (obj) {
      _.each(obj.subtypes, function (tag) {
        wordOverwriteMap[tag] = "NN";
      });
    });

    //all tags are identified as JJ
    //NOTE: we do this AFTER setting subtypes to NN. 
    //This because sometimes we set term to both subtypes as well as tag
    _.each(command.cacheUtils.supportedAttribsPerType, function (obj) {
      _.each(obj.tags, function (tag) {
        wordOverwriteMap[tag] = "JJ";
      });
    });


    if (!isWordOverwriteMapWarmed) {
      isWordOverwriteMapWarmed = true;
      console.log(("warmed wordOverwriteMap").green);
    }
  }
  //feeds from other cache which may be updated at any time
  setInterval(warmWordOverwriteMap, 1000); //each sec

  //be, do, have and modal verbs 
  var modalForms = [
    "is", "was", "were", "being", "going",
    "am", "are", "be", "been", //be
    "do", "does", "don", "did", //do. Don (from don't)
    "have", "has", "had", //have
    "can", "could", "may", "might", "must", "shall", "should", "will", "would" //modals
  ];

  _.each(modalForms, function (modalWord) {
    wordOverwriteMap[modalWord] = "MD";
  });

  var teens = ["twenty", "thirty", "fourty", "fifty", "sixty", "seventy", "eighty", 'ninety'];
  var toTen = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  var toTwenty = ["ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];

  var toHundred = [].concat(toTen).concat(toTwenty);
  _.each(teens, function (pre) {
    _.each(toTen, function (suf) {
      toHundred.push(pre + suf);
    });
  });

  /////////////////////////////////////////
  ////////////////////////////////////////
  var ruleMapGeneral = {
    NUMBER_CHUNK: {
      ruleType: 'tokens',
      pattern: '[{ word:/' + toHundred.join("|") + '/}]',
      result: "CD"
    },

    NUMBER_CHUNK1: {
      ruleType: 'tokens',
      pattern: '[{tag:CD}]',
      result: "CD"
    },

    //WRB + verb, e.g.: 
    //When does
    //who is
    //
    //NOTE: start at sentence!
    //So this doesn't match: are bands playing tonight WHICH are cool
    QUESTION1: {
      ruleType: 'tokens',
      pattern: '^[{tag:/WRB|WP|WP$|WDT/}]',
      result: "QUESTION"
    },

    QUESTION2: {
      ruleType: 'tokens',
      pattern: '[{chunk:QUESTION}] [{ word:time}]',
      result: "QUESTION"
    },
  };

  var ruleMapDate = {

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
      pattern: "[{word:/morning|afternoon|evening|night|midnight|midday|noon/}]",
      result: "TIMEOFDAY"
    },

    //6 years ago
    TIMEOFDAY1: {
      ruleType: "tokens",
      pattern: "[{chunk:CD}]{0,1} [{word:/minutes?|hours?/}] [{word:/ago/}]{0,1}",
      result: "TIMEOFDAY"
    },

    //10 to five
    TIMEOFDAY2: {
      ruleType: "tokens",
      pattern: "[{chunk:CD}] [{word:/to|after|before|past/}] [{chunk:CD}]",
      result: "TIMEOFDAY"
    },

    //quarter past five
    TIMEOFDAY3: {
      ruleType: "tokens",
      pattern: "[{word:/quarter|half/}] [{word:/to|after|before|past?/}] [{chunk:CD}]",
      result: "TIMEOFDAY"
    },

    //3 o'clock
    //3 o clock
    TIMEOFDAY4: {
      ruleType: "tokens",
      pattern: "[{chunk:CD}] [{word:o}] [{word:'}]* [{word:clock}]",
      result: "TIMEOFDAY"
    },

    //at 5. (words 'at' needs to be here, otherwise not clear enough it indicates time)
    TIMEOFDAY5: {
      ruleType: "tokens",
      pattern: "[{chunk:CD}] [{word:/pm|am/}]",
      result: "TIMEOFDAY"
    },

    TIMESPAN: {
      ruleType: 'tokens',
      pattern: '[{word:/day(s)*|week(s)*|month(s)*|year(s)*/}]',
      result: "TIMESPAN"
    },


    //E.g.: 3 weeks
    RELATIVE_DATE1: {
      ruleType: 'tokens',
      pattern: "[{chunk:CD}] [{chunk:/TIMESPAN/}]",
      result: "RELATIVE_DATE"
    },

    //a month
    RELATIVE_DATE2: {
      ruleType: 'tokens',
      pattern: "[{term:an?}] [{chunk:TIMESPAN}]",
      result: "RELATIVE_DATE"
    },

    //E.g. next month / coming month
    //"the day" (later to be constructed in 'the day after tomorrow for instance')
    RELATIVE_DATE3: {
      ruleType: 'tokens',
      pattern: "[{ word:/the|this|next|coming|following|last|prior|previous/}] [{chunk:/TIMESPAN|RELATIVE_DATE/}]",
      result: "RELATIVE_DATE"
    },


    //month + day -> DATE
    //january 12 -> DATE
    //september the 20 th
    DATE_FROM_MONTH: {
      ruleType: "tokens",
      pattern: "[{chunk:MONTH}] [{tag:DT}]? [{word:\\d{1,2}; chunk:CD}] [{tag:DT}]*",
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

    //timeOfDay indicators that are specitic enough to count as dates
    DATE_FROM_TIMEOFDAY_DIRECTLY: {
      ruleType: 'tokens',
      pattern: '[{ word:/tonight/}]',
      result: "DATE"
    },

    //date from weekday
    //this lovely sunday -> DATE
    //next saturday -> DATE
    DATE_FROM_WEEKDAY: {
      ruleType: "tokens",
      pattern: "[{word:/this|next|coming|following|last|prior|previous/}] [{tag:/RB(R|S)*|JJ(R|S)*/}]* [{chunk:WEEKDAY}]",
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
      pattern: "[{chunk:RELATIVE_DATE}] [{word:/from|before|after|since/}] [{chunk:/DATE|WEEKDAY/}]",
      result: "DATE"
    },

    //3 weeks ago
    DATE_FROM_RELATIVEDATE3: {
      ruleType: "tokens",
      pattern: "[{chunk:RELATIVE_DATE}] [{word:/ago/}]",
      result: "DATE"
    },

    //in 3 weeks
    DATE_FROM_RELATIVEDATE4: {
      ruleType: "tokens",
      pattern: "[{tag:/IN|TO/}] [{chunk:RELATIVE_DATE}]",
      result: "DATE"
    },

    //friday afternoon
    DATE_FROM_TIMEOFDAY: {
      ruleType: "tokens",
      pattern: "[{chunk:/DATE|WEEKDAY/}] [{tag:/IN|TO/}]* [{chunk:TIMEOFDAY}]",
      result: "DATE"
    },


    DATE_FROM_TIMEOFDAY1: {
      ruleType: "tokens",
      pattern: "[{chunk:/DATE|WEEKDAY/}] [{word:/starting|ending/}]* [{chunk:TIMEOFDAY}]",
      result: "DATE"
    },


    //(the) afternoon of DATE
    DATE_FROM_TIMEOFDAY2: {
      ruleType: "tokens",
      pattern: "[{tag:DT}]* [{chunk:TIMEOFDAY}] [{tag:/IN|TO/}]* [{chunk:/DATE|WEEKDAY/}] ",
      result: "DATE"
    },

    //last night, etc
    DATE_FROM_TIMEOFDAY3: {
      ruleType: "tokens",
      pattern: "[{word:/the|this|that|last|next|coming|following|last|prior|previous/}] [{tag:/RB(R|S){0,1}|JJ(R|S){0,1}/}]* [{chunk:TIMEOFDAY}]",
      result: "DATE"
    },


    //this + date -> date
    THIS_DATE: {
      ruleType: "tokens",
      pattern: "[{word:/this/}] [{chunk:DATE}]",
      result: "DATE"
    },
  };

  var ruleMapDuration = {
    //When we don't match relativeDate to a DATE then it should be matched to a DURATION
    //e.g.: coming 3 weeks
    RELATIVE_DATE_TO_DURATION: {
      ruleType: "tokens",
      pattern: "[{chunk:RELATIVE_DATE}]",
      result: "DURATION"
    },
    //this lovely weekend
    WEEKEND: {
      ruleType: "tokens",
      pattern: "[{word:/this|next|coming|following|last|prior|previous/}]* [{tag:/RB(R|S)*|JJ(R|S)*/}]* [{word:/weekend/}]",
      result: "DURATION"
    },
  };

  var ruleMapNP = {
    //e.g: the large black cat
    //KWHEN: often denoting: 
    // - Proper Noun (e.g.: name of bar)
    // - (sub)type + adjectives (e.g.: best italian restaurants)
    //   - all Delightfully cheap restaurants
    NP: {
      ruleType: 'tokens',

      //NOTE: liberal ordening to match proper nouns like restaurant names
      pattern: '[{ tag:/PRP[$]?|DT|RB(R|S){0,1}|JJ(R|S){0,1}/}]* [{ tag:/NN.*?/}]+ [{ tag:/DT|RB(R|S)*|JJ(R|S)*/}]*',
      result: 'NP'
    },

    //prepositional phrase is a noun phrase preceded by a preposition
    //e.g.: 'in the house' and 'by the cold pool' 
    //
    //THESE ACT AS CONTRAINTS!
    //KWHEN: often denoting where / when
    PP: {
      ruleType: 'tokens',
      pattern: '[{tag:/IN|TO/}] [{chunk:/NP|DATE|DURATION|TIMEOFDAY/}]',
      result: 'PP'
    },

    //e.g.: near me
    PP_TAG: {
      ruleType: 'tokens',
      pattern: '[{tag:IN}] [{tag:/PRP|PRP$|WP|WP$|WDT/}]', //NOT TOO SURE: added all pronouns as found in penn treebank
      result: 'PP'
    },


    PP_IN: {
      ruleType: 'tokens',
      pattern: '[ {tag:/TO|IN|WP|WP$|WDT/} ] [ { chunk:PP } ]',
      result: 'PP'
    },


    VP: {
      ruleType: 'tokens',
      pattern: "[{tag:MD}] [{chunk:NP}]", //this makes sure VP always has a NP (can be nested)
      result: 'VP'
    },

    //NOTE: this isn't matching stuff like: "which [restaurants are located] near to me" 
    //Adding that rule (match against NP as well as VP) completely freezes the box.
    //We can manage without it
    VP1: {
      ruleType: 'tokens',
      // pattern: "(([{chunk:VP}] [{tag:MD}]*)|([{chunk:NP}] [{tag:MD}]+)) ([{word:to}] [{word:be}])? [{tag:VB[^\s]?}]",
      pattern: "[{chunk:VP}] [{tag:MD}]* ([{word:to}] [{word:be}])? [{tag:VB[^\s]?}]",
      result: 'VP'
    },

  };

  /////////////////////////////////////////
  ////////////////////////////////////////

  var NLPRules = _.extend({}, ruleMapGeneral, ruleMapDate, ruleMapNP, ruleMapDuration);

  NLPRules.getTags = function (question) {
    question = question.toLowerCase();

    var words = new pos.Lexer().lex(question);
    var taggedWords = tagger.tag(words);

    //modalForms

    var tags = "";
    if (taggedWords.length) {
      var firstWord = taggedWords[0];

      //If first word of sentence start with modal, this is an indication of a question. 
      //Therefore, add a question symbol before it
      if (~modalForms.indexOf(firstWord[0])) {
        taggedWords.unshift([
          "wwwModal", "WRB" //www is just a made up symbol: implicit what-who-where
        ]);
      }

      _.each(taggedWords, function (val) {
        var word = val[0];
        var tag = wordOverwriteMap[word] || tagOverwriteMap[val[1]] || val[1];
        tags += " " + word + "/" + tag;
      });

      tags = tags.trim();
    }

    return tags;
  };


  NLPRules.getChunks = function (tags) {
    var chunks = chunker.chunk(tags, [
      NLPRules.NUMBER_CHUNK,
      NLPRules.NUMBER_CHUNK1,
      NLPRules.QUESTION1,
      NLPRules.QUESTION2
    ]);

    //apply date-rules
    chunks = chunker.chunk(chunks, [
      NLPRules.MONTH,
      NLPRules.WEEKDAY,
      NLPRules.TIMEOFDAY,
      NLPRules.TIMEOFDAY1,
      NLPRules.TIMEOFDAY2,
      NLPRules.TIMEOFDAY3,
      NLPRules.TIMEOFDAY4,
      NLPRules.TIMEOFDAY5,
      NLPRules.TIMEOFDAY6,
      NLPRules.TIMESPAN,
      NLPRules.RELATIVE_DATE1,
      NLPRules.RELATIVE_DATE2,
      NLPRules.RELATIVE_DATE3,
      NLPRules.DATE_FROM_MONTH,
      NLPRules.DATE_FROM_DAY_DIRECTLY,
      NLPRules.DATE_FROM_TIMEOFDAY_DIRECTLY,
      NLPRules.DATE_FROM_WEEKDAY,
      NLPRules.DATE_FROM_RELATIVEDATE1,
      NLPRules.DATE_FROM_RELATIVEDATE2,
      NLPRules.DATE_FROM_RELATIVEDATE3,
      NLPRules.DATE_FROM_RELATIVEDATE4,
      NLPRules.DATE_FROM_TIMEOFDAY,
      NLPRules.DATE_FROM_TIMEOFDAY1,
      NLPRules.DATE_FROM_TIMEOFDAY2,
      NLPRules.DATE_FROM_TIMEOFDAY3,
      NLPRules.WEEKDAY_TO_DATE,
      NLPRules.THIS_DATE,
      NLPRules.DATE_COMPOUND
    ]);

    //apply datespan rules
    chunks = chunker.chunk(chunks, [
      NLPRules.RELATIVE_DATE_TO_DURATION,
      NLPRules.THE_DURATION,
      NLPRules.WEEKEND,
    ]);

    //apply NP rules
    chunks = chunker.chunk(chunks, [
      NLPRules.NP,
      NLPRules.VP,
      NLPRules.VP1,
      NLPRules.PP,
      NLPRules.PP_IN,
      NLPRules.PP_TAG,
      NLPRules.PP_DATE,
    ]);


    return chunks;
  };



  var doTest = true;
  var hasErrors = false;
  var showStats = false;


  /////////////////////////////////////////////
  //SEE: http://www.chompchomp.com/terms.htm //
  /////////////////////////////////////////////

  var testTenses = [{
    question: 'does billy joel play',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP does/MD [NP billy/RB joel/NN]] play/VB]' //Simple Present:
  }, {
    question: 'When does billy joel play',
    chunks: '[QUESTION when/WRB] [VP [VP does/MD [NP billy/RB joel/NN]] play/VB]' //Simple Present 2:
  }, {
    question: 'did billy joel play',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP did/MD [NP billy/RB joel/NN]] play/VB]' //Simple Past:
  }, {
    question: 'Has billy joel been played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP has/MD [NP billy/RB joel/NN]] been/MD played/VBD]' //Present Perfect
  }, {
    question: 'Had billy joel been played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP had/MD [NP billy/RB joel/NN]] been/MD played/VBD]' //Past Perfect
  }, {
    question: 'Will billy joel be played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP will/MD [NP billy/RB joel/NN]] be/MD played/VBD]' //will-future
  }, {
    question: 'Is billy joel going to be played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP is/MD [NP billy/RB joel/NN]] going/MD to/TO be/MD played/VBD]' //going to-future
  }, {
    question: 'Will billy joel have been played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP will/MD [NP billy/RB joel/NN]] have/MD been/MD played/VBD]' //Future Perfect
  }, {
    question: 'Would billy joel be played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP would/MD [NP billy/RB joel/NN]] be/MD played/VBD]' //Conditional I
  }, {
    question: 'Would billy joel have been played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP would/MD [NP billy/RB joel/NN]] have/MD been/MD played/VBD]' //Conditional II
  }, {
    question: 'Is  billy joel being played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP is/MD [NP billy/RB joel/NN]] being/MD played/VBD]' //Present Progressive
  }, {
    question: 'Was billy joel being played',
    chunks: '[QUESTION wwwModal/WRB] [VP [VP was/MD [NP billy/RB joel/NN]] being/MD played/VBD]' //Past Progressive
  }];

  var testDates = [{
      question: "tonight",
    }, {
      question: "this morning",
    }, {
      question: "this lovely saturday",
    }, {
      question: "this lovely weekend",
    }, {
      question: "at night",
    }, {
      question: "at midnight",
    }, {
      question: "at christmas",
    }, {
      question: "at the end of the week", //needs work
    }, {
      question: "on Sunday",
    }, {
      question: "on the 25th of December", //needs work
    }, {
      question: "on Good Friday", //needs work
    }, {
      question: "on the morning of September the 11th",
    },

    //periods
    {
      question: "after school", //needs work. When is school
    }, {
      question: "6 years ago",
    }
  ];


  //TODO: 
  //- add date / time
  //- add spatial (wrapper around PP?)
  //
  //USAGE: 
  var testPrepositionalPhrases = [{
      question: 'on Statton Island',
      chunks: '[PP on/IN [NP statton/NN island/NN]]'
    }, {
      question: 'in my house',
      chunks: '[PP in/IN [NP my/PRP$ house/NN]]'
    },
    //  {
    //   question: 'near my favorite restaurant',
    //   was: '[PP near/IN [NP my/PRP$ favorite/JJ restaurant/NN]]'
    // }, 
    // {
    //   question: 'at my favorite restaurant',
    //   was: '[PP at/IN [NP my/PRP$ favorite/JJ restaurant/NN]]'
    // }
  ];

  // var testVerbPhrases = [{
  //   question: 
  // }]

  //TODO: test VB (Verb Phrase)

  ////////////
  ///Overview of some sentences that we must match in the end
  // WHAT IS THE NAME OF THAT NICE ITALIAN PLACE NEAR CENTRAL STATION


  //TODO: MORE END TO END EXAMPLES
  var testE2E = [{
    question: "Where does The Avengers play near me this afternoon",
  }, {
    question: "does miley cyrus play in the garden",
  }, {
    question: "where does miley cyrus play in the garden",
  }, {
    question: "this monday 3 weeks ago",
  }, {
    question: "what restaurants are located near me",
  }, {
    question: "what restaurants are located near the sutton hotel",
  }, {
    question: "coldplay performs the coming months in the madison square garden",
  }];

  var testQuestions = []
    .concat(testTenses)
    .concat(testDates)
    .concat(testPrepositionalPhrases)
    .concat(testE2E);

  _.each(testQuestions, function (questionObj) {
    var chunks = NLPRules.getChunks(NLPRules.getTags(questionObj.question));

    if (doTest && chunks !== questionObj.chunks && questionObj.chunks !== undefined) {
      console.log("##################################");
      console.log("SHOULD", questionObj);
      console.log("WAS", chunks);
      hasErrors = true;
    }

    if (showStats) {
      console.log(_.extend(questionObj, {
        was: chunks
      }));
    }

  });
  if (hasErrors) {
    throw new Errors("see above errors");
  }


  return NLPRules;
};
