var _ = require("lodash");
var pos = require('pos');
var chunker = require('pos-chunker');
var tagger = new pos.Tagger();

//Sometimes the simple pos-tagger makes a mistake.
//We correct the most occuring errors here.
var wordOverwriteMap = {
  open: "VB" //the word open should always be a VB (verb). Incorrectly identified as JJ (adverb)
};

var tagOverwriteMap = {
  "NNS": "NN" //problems with plural nouns
};

//be, do, have and modal verbs 
var modalForms = [
  "am", "are", "is", //be
  "do", "does", "don", //do. Don (from don't)
  "have", "has", //have
  "can", "could", "may", "might", "must", "shall", "should", "will", "would" //modals
];

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
    pattern: '[{ tag:CD}]',
    result: "CD"
  },

  //WRB + verb, e.g.: 
  //When does
  //who is
  QUESTION1: {
    ruleType: 'tokens',
    pattern: '[{ tag:WRB}]',
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

  TIMEOFDAY1: {
    ruleType: "tokens",
    pattern: "[{chunk:CD}]{0,1} [{word:/minutes?|hours?/}] [{word:/ago/}]{0,1}",
    result: "TIMEOFDAY"
  },

  //10 to five
  TIMEOFDAY2: {
    ruleType: "tokens",
    pattern: "[{chunk:CD}] [{word:/to|after|before|past?/}] [{chunk:CD}]",
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
    pattern: "[{word:at}] [{chunk:CD}]",
    result: "TIMEOFDAY"
  },

  //combinator
  TIMEOFDAY6: {
    ruleType: "tokens",
    pattern: "[{tag:IN}] [{chunk:TIMEOFDAY}]",
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
    pattern: "[{tag:IN}] [{chunk:RELATIVE_DATE}]",
    result: "DATE"
  },

  //friday afternoon
  DATE_FROM_TIMEOFDAY: {
    ruleType: "tokens",
    pattern: "[{chunk:/DATE|WEEKDAY/}] [{tag:IN}]* [{chunk:TIMEOFDAY}]",
    result: "DATE"
  },

  //(the) afternoon of DATE
  DATE_FROM_TIMEOFDAY1: {
    ruleType: "tokens",
    pattern: "[{tag:DT}]* [{chunk:TIMEOFDAY}] [{tag:IN}]* [{chunk:/DATE|WEEKDAY/}] ",
    result: "DATE"
  },

  //last night, etc
  DATE_FROM_TIMEOFDAY2: {
    ruleType: "tokens",
    pattern: "[{word:/the|this|last|next|coming|following|last|prior|previous/}] [{tag:/RB(R|S)*|JJ(R|S)*/}]* [{chunk:TIMEOFDAY}]",
    result: "DATE"
  },


  //catchall for weekdays if not matched using more complex stuff
  WEEKDAY_TO_DATE: {
    ruleType: "tokens",
    pattern: "[{chunk:WEEKDAY}]",
    result: "DATE"
  },

  //this + date -> date
  THIS_DATE: {
    ruleType: "tokens",
    pattern: "[{word:/this/}] [{chunk:DATE}]",
    result: "DATE"
  },

  //Combine multiple dates
  //
  //Date(
  //  Date(this monday)
  //  Date(3 weeks ago) 
  //)
  DATE_COMPOUND: {
    ruleType: "tokens",
    pattern: "[{chunk:DATE}]{2,}", //combine 2 or more dates
    result: "DATE"
  }
};

var ruleMapDuration = {
  //When we don't match relativeDate to a DATE then it should be matched to a DURATION
  //e.g.: coming 3 weeks
  RELATIVE_DATE_TO_DURATION: {
    ruleType: "tokens",
    pattern: "[{chunk:RELATIVE_DATE}]",
    result: "DURATION"
  },
  THE_DURATION: {
    ruleType: "tokens",
    pattern: "[{word:/the/}] [{chunk:DATE_SPAN}]",
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
    pattern: '[ { tag:/DT|RB(R|S)*|JJ(R|S)*|NN.*?/ } ]+',
    result: 'NP'
  },

  //possive pronouns:
  //'my house' | my favorite restaurant
  NP_POSSESSIVE: {
    ruleType: 'tokens',
    pattern: '[{tag:/PRP\\$|PRP/}] [{chunk:NP}]',
    result: 'NP'
  },


  //prepositional phrase is a noun phrase preceded by a preposition
  //e.g.: 'in the house' and 'by the cold pool' 
  //
  //THESE ACT AS CONTRAINTS!
  //KWHEN: often denoting where / when
  PP: {
    ruleType: 'tokens',
    pattern: '[{tag:IN}] [{chunk:/NP|DATE|DURATION/}]',
    result: 'PP'
  },

  //e.g.: near me
  PP_TAG: {
    ruleType: 'tokens',
    pattern: '[{tag:IN}] [{tag:/PRP|PRP$|WP|WP$/}]', //NOTE TOO SURE: added all pronouns as found in peen treebank
    result: 'PP'
  },

  // //Some dates are propositional phrases although no proposition (on, in) found. 
  // //Examples: tonight, this saturday. 
  // //For our purposes we match all dates as propositional phrases
  //
  //PROBLEM: this matches 
  PP_DATE: {
    ruleType: 'tokens',
    pattern: '[{chunk:/DATE|DURATION/}]',
    result: 'PP'
  },

  // verb phrase:  verb followed by one or more noun or prepositional phrases
  //e.g.: 'washed the dog in the bath'
  //
  //Also matches DATE | DURATION: "let's go this weekend"
  //here 'this weekend' isn't matched as a PP because it doesn't have a preposition (on, at, etc.)
  //but still counts as a preposition. 
  //
  //KWHEN: play in the garden?
  VP: {
    ruleType: 'tokens',
    pattern: '[ { tag:/VB.*?/ } ] [ { chunk:/NP|PP/ } ]+',
    result: 'VP'
  },

  //COSTLY! the warm blanket -> 1500ms
  // //e.g.: (when does) miley cyrus play in the garden?
  // CLAUSE: {
  //   ruleType: 'tokens',
  //   pattern: '[ { chunk:NP}] [ { chunk:VP } ]',
  //   result: 'CLAUSE'
  // },


  ////////////////////////////////////////////////////////////
  // //THIS STUFF LEADS TO EXTREMELY HIGH PROCESSING COSTS. WHY? 
  // // //we may have tagged some numbers that were part of NP. 
  // // //We re-add these numbers to NP here, unless they are part of another bigger (temporal) structure
  // NP_WITH_NR: {
  //   ruleType: "tokens",
  //   pattern: '[ { chunk:CD } ] [ { chunk:NP }]',
  //   result: 'NP'
  // },
  // 
  // THIS ONE IN PARTICULAR. 
  // WE ALREADY TRIED IN SEVERAL OTHER WAYS
  // //combine two consequtive NPs (this only triggers if NP_WITH_NR triggered  )
  // NP_WITH_NRCOMBINE: {
  //   ruleType: "tokens",
  //   pattern: '[ { chunk:NP }] [ { chunk:NP }]',
  //   result: 'NP'
  // }
};

/////////////////////////////////////////
////////////////////////////////////////

var NLPRules = module.exports = _.extend({}, ruleMapGeneral, ruleMapDate, ruleMapNP, ruleMapDuration);

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
        "www", "WRB" //www is just a made up symbol: implicit what-who-where
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
    NLPRules.QUESTION1
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
    NLPRules.NP_POSSESSIVE,
    NLPRules.PP,
    NLPRules.PP_TAG,
    NLPRules.PP_DATE,
    NLPRules.VP,
    NLPRules.CLAUSE
  ]);


  return chunks;
};



var doTest = true;
var hasErrors = false;
var showStats = false;


/////////////////////////////////////////////
//SEE: http://www.chompchomp.com/terms.htm //
/////////////////////////////////////////////

var testDates = [{
    question: "tonight",
    chunks: "[PP [DATE [NP tonight/RB]]]"
  }, {
    question: "this morning",
    chunks: "[PP [DATE [NP this/DT] [TIMEOFDAY morning/VBG]]]"
  }, {
    //awful
    question: "this saturday",
    chunks: "[PP [DATE [DATE [NP this/DT] [DATE [WEEKDAY [NP saturday/NN]]]]]]"
  }, {
    question: "this lovely weekend ",
    chunks: "[PP [DURATION [NP this/DT lovely/RB weekend/NN]]]"
  },

  //E2E
  {
    question: "Where does The Avengers play near me this afternoon",
    chunks: "[QUESTION where/WRB] [VP does/VBZ [NP the/DT avengers/NN]] [VP play/VB [PP near/IN me/PRP] [PP [DATE [NP this/DT] [TIMEOFDAY [NP afternoon/NN]]]]]"
  }, {
    question: "does miley cyrus play in the garden",
    chunks: "[QUESTION www/WRB] [VP does/VBZ [NP miley/NN cyrus/NN]] [VP play/VB [PP in/IN [NP the/DT garden/NN]]]"
  }, {
    question: "where does miley cyrus play in the garden",
    chunks: "[QUESTION where/WRB] [VP does/VBZ [NP miley/NN cyrus/NN]] [VP play/VB [PP in/IN [NP the/DT garden/NN]]]"
  }, {

    question: "this monday 3 weeks ago",
    chunks: "[PP [DATE [DATE [DATE [NP this/DT] [DATE [WEEKDAY [NP monday/NN]]]]] [DATE [DURATION [RELATIVE_DATE [CD 3/CD] [TIMESPAN [NP weeks/NN]]]] [NP ago/RB]]]]"
  }
];


//TODO: 
//- add date / time
//- add spatial (wrapper around PP?)
//
//USAGE: 
var testPrepositionalPhrases = [{
  question: "on Statton Island",
  "chunks": "[PP on/IN [NP statton/NN island/NN]]"
}, {
  question: "in my house",
  "chunks": "[PP in/IN [NP my/PRP$ [NP house/NN]]]"
}, {
  question: "near my favorite restaurant",
  chunks: "[PP near/IN [NP my/PRP$ [NP favorite/JJ restaurant/NN]]]"
}, {
  "question": "at my favorite restaurant",
  "chunks": "[PP at/IN [NP my/PRP$ [NP favorite/JJ restaurant/NN]]]"
}];

// var testVerbPhrases = [{
//   question: 
// }]

//TODO: test VB (Verb Phrase)

////////////
///Overview of some sentences that we must match in the end
// WHAT IS THE NAME OF THAT NICE ITALIAN PLACE NEAR CENTRAL STATION


//TODO: MORE END TO END EXAMPLES
var testE2E = [{
  question: "what restaurants are located near me",
  chunks: "what/WP [NP restaurants/NN] [VP are/VBP located/VBN [PP near/IN me/PRP]]"
}, {
  question: "what restaurants are located near the sutton hotel",
  chunks: "what/WP [NP restaurants/NN] [VP are/VBP located/VBN [PP near/IN [NP the/DT sutton/NN hotel/NN]]]"
}, {
  question: "coldplay performs the coming months in the madison square garden",
  chunks: "[NP coldplay/NN] [VP performs/VBZ [PP [DURATION [RELATIVE_DATE [NP the/DT] [RELATIVE_DATE coming/VBG [TIMESPAN [NP months/NN]]]]]] [PP in/IN [NP the/DT madison/NN square/NN garden/NN]]]"
}];

var testQuestions = []
  .concat(testDates)
  .concat(testPrepositionalPhrases)
  .concat(testE2E);

_.each(testQuestions, function (questionObj) {
  var chunks = NLPRules.getChunks(NLPRules.getTags(questionObj.question));

  if (doTest && chunks !== questionObj.chunks) {
    console.log("##################################");
    console.log("SHOULD", questionObj);
    console.log("WAS", chunks);
    hasErrors = true;
  }

  if (showStats) {
    console.log("##################################");
    console.log(questionObj);
  }

});
if (hasErrors) {
  throw new Errors("see above errors");
}
