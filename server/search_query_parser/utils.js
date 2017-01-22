var _ = require("lodash");

function parsedQuestionHasData( parsedQuestion ){
  return parsedQuestion
    && parsedQuestion.questions
    && parsedQuestion.questions.length > 0
}

function getEntityMentions( type, parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].entitymentions
    && _.some(parsedQuestion.questions[0].entitymentions, 'ner', type) )
  {
    return _.filter(parsedQuestion.questions[0].entitymentions, 'ner', type)[0].text.replace(getTypeFilterText(parsedQuestion), '');
  }
}

function getTypeFilterText( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].eventtypes
    && parsedQuestion.questions[0].eventtypes.length > 0 )
  {
    return parsedQuestion.questions[0].eventtypes[parsedQuestion.questions[0].eventtypes.length-1].text;
  }
}

// EXPORTED //

function getDateFilter( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].temporal_query_info
    && parsedQuestion.questions[0].temporal_query_info.length > 0 )
  {
    return parsedQuestion.questions[0].temporal_query_info[0];
  }
}

function getTypeFilter( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].eventtypes
    && parsedQuestion.questions[0].eventtypes.length > 0 )
  {
    return parsedQuestion.questions[0].eventtypes[parsedQuestion.questions[0].eventtypes.length-1].event_type;
  }
}

function getOrganizationAndPersonFilter( parsedQuestion ){
  return getEntityMentions('OrganizationAndPerson', parsedQuestion);
}

function getPlaceWithOpeningHoursFilter( parsedQuestion ){
  return getEntityMentions('PlaceWithOpeninghours', parsedQuestion);
}

function getLocationFilter( parsedQuestion ){
  return getEntityMentions('LOCATION', parsedQuestion);
}

function getFilteredKeyword( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion) ) {
    if ( (getDateFilter(parsedQuestion) || getOrganizationAndPersonFilter(parsedQuestion)) || getPlaceWithOpeningHoursFilter(parsedQuestion) || getLocationFilter(parsedQuestion) ){
      if ( parsedQuestion.questions[0].other_text
        && parsedQuestion.questions[0].other_text.length > 0
        && parsedQuestion.questions[0].other_text[0].text ) {
        return _.map(parsedQuestion.questions[0].other_text, function (part) {
          if (part.text != '') return part.text;
        }).join(' ');
      }
    }else{
      return parsedQuestion.questions[0].text.slice(0,-1); //TODO JIM HACK TO FIX SEARCH QUERY PARSER ISSUE #6
    }
  }
}

function getFilteredKeywordWithoutType( parsedQuestion ){
  if ( getFilteredKeyword(parsedQuestion) ){
    return getFilteredKeyword(parsedQuestion).replace(getTypeFilterText(parsedQuestion), '').trim();
  } else {
    return "";
  }
}

function getRawKeyword( parsedQuestion ){
  if( parsedQuestionHasData(parsedQuestion) ){
    //TODO SEARCH QUERY PARSER this is not quite right, when there is a date recognized it should be filtered out, see slack #392
    return parsedQuestion.questions[0].text.slice(0,-1); //TODO JIM HACK TO FIX SEARCH QUERY PARSER ISSUE #6
  }
}

function getRawKeywordWithoutType( parsedQuestion ){
  if( getRawKeyword(parsedQuestion) ) {
    return getRawKeyword(parsedQuestion).replace(getTypeFilterText(parsedQuestion), '').trim();
  } else {
    return "";
  }
}

module.exports = {
  getDateFilter: getDateFilter,
  getTypeFilter: getTypeFilter,
  getOrganizationAndPersonFilter: getOrganizationAndPersonFilter,
  getPlaceWithOpeningHoursFilter: getPlaceWithOpeningHoursFilter,
  getLocationFilter: getLocationFilter,
  getFilteredKeyword: getFilteredKeyword,
  getFilteredKeywordWithoutType: getFilteredKeywordWithoutType,
  getRawKeyword: getRawKeyword,
  getRawKeywordWithoutType: getRawKeywordWithoutType
};