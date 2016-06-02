var _ = require("lodash");
var moment = require("moment");

module.exports = function (options) {

  var DEBUG_OPENINGHOURS = options.DEBUG_OPENINGHOURS;

  var mealTypes = {
    dinner: "dinner",
    brunch: "brunch",
    lunch: "lunch",
    breakfast: "breakfast",
    // "bar &amp; lounge": "bar / lounge",
    // "bar": "bar / lounge",
    // "lounge": "bar / lounge",
    "late": "late",
    "late menu": "late",
  };

  var openinghoursStats = {
    has: 0,
    success: 0,
    failParse: 0,
    failOrder: 0,
    failOther: 0
  };

  var dayMapping = {
    mon: 0,
    monday: 0,
    tue: 1,
    tues: 1,
    tuesday: 1,
    wed: 2,
    wednesday: 2,
    thu: 3,
    thurs: 3,
    thursday: 3,
    fri: 4,
    friday: 4,
    sat: 5,
    saturday: 5,
    sun: 6,
    sunday: 6,
    sundays: 6,
    dai: [0, 1, 2, 3, 4, 5, 6], //daily
    daily: [0, 1, 2, 3, 4, 5, 6] //daily
  };


  function processOpeninghours(arr) {

    if (!arr.length) return [];

    var err;

    var el = arr.shift();

    var thisTerm = {};

    if (mealTypes[el] !== undefined) { //find mealtype

      thisTerm.type = "mealType";
      thisTerm.val = mealTypes[el]; //mapped mealtype

    } else if (dayMapping[el.substring(0, 3)] !== undefined) { //fine dayrange

      thisTerm.type = "dayrange";

      if (el.split("-").length === 1) { //single day found

        var map = dayMapping[el];
        if (map === undefined) {
          err = new Error("Couldn't find dayrange after matching for full string: " + el);
          err.status = "fullrangeDayParseError";
          throw err;
        }
        thisTerm.val = _.isArray(map) ? map : [map];

      } else {

        //try to parse a day-range e.g.: mon-fri
        var rangeSplit = el.split("-");

        if (rangeSplit.length !== 2) {
          err = new Error("Splitting dayrange on '-' didn't result in 2 parts: " + el);
          err.status = "dayRangeSplitError";
          throw err;
        }

        var startDay = dayMapping[rangeSplit[0]];
        var endDay = dayMapping[rangeSplit[1]];

        if (startDay === undefined || endDay === undefined) {
          err = new Error("dayrange split couldn't map start or end: " + el);
          err.status = "dayRangeMapError";
          throw err;
        }

        if (_.isArray(startDay) || _.isArray(endDay)) {
          err = new Error("dayrange split resulted in an array for start or end. This is not supported: " + el);
          err.status = "dayRangeIllegalArrayFoundError";
          throw err;
        }

        //start and end found. Both are not arrays
        if (startDay > endDay) {
          endDay += 7; //mod
        }

        thisTerm.val = [];
        for (var i = startDay; i <= endDay; i++) {
          thisTerm.val.push(i % 7);
        }
      }

    } else if (~el.indexOf("am-") || ~el.indexOf("pm-")) { //find timerange

      var splitHours = el.split("-");
      if (splitHours.length !== 2) {
        err = new Error("Splitting hourrange on '-' didn't result in 2 parts: " + el);
        err.status = "hourRangeIllegalArrayFoundError";
        throw err;
      }

      var startHour,
        endHour;

      //specific catch
      if (splitHours[0] === "midnight" || splitHours[0] === "12:00am") {
        splitHours[0] = "00:00am";
      }
      if (splitHours[1] === "midnight" || splitHours[1] === "12:00am") {
        splitHours[1] = "00:00am";
      }

      startHour = moment(splitHours[0], 'HH:mm').format('HH:mm');
      endHour = moment(splitHours[1], 'HH:mm').format('HH:mm');

      if (!~startHour.indexOf(":") || !~endHour.indexOf(":")) {
        err = new Error("startHour or endHour could not be parsed: " + el);
        err.status = "hourCouldNotBeParseError";
        throw err;
      }

      thisTerm.type = "timerange";
      thisTerm.val = [startHour, endHour];

    } else {
      err = new Error("no parser found: " + el);
      err.status = "NO_PARSER";
      throw err;
    }

    //continue processing
    return [thisTerm].concat(processOpeninghours(arr));
  }


  function processOpeninghoursTotal(openRaw) {

    //lowercase -> trim -> remove spaces next to '-'
    openRaw = openRaw.toLowerCase()
      .trim()
      .replace(/( )+to( )+/g, '-') //change word 'to' -> '-'
      .replace(/( )+from( )+/g, '#') //change word 'from' -> '#'
      .replace(/( )*-( )*/g, '-')
      .replace(/&(.){2,7};/g, "#") //remove special characters. Assume these are separators
      .replace(/;/g, "") //replace semi-column
      .replace(/<[^>]*>/g, "#") //change all tags  -> #
      .replace(/:( )+/g, "#") //change colon plus at least 1 space -> #
      .replace(/:#/g, "#")
      .replace(/am( )+/g, "am#") //am (pm) followed by space injects a separator.
      .replace(/pm( )+/g, "pm#")
      .replace(/( )*am( )*/g, "am") //remove space around am
      .replace(/( )*pm( )*/g, "pm")
      .replace(/( )*#( )*/g, "#")
      .replace(/( )/g, "#") //at this point each space is a separator so move in separator
      .replace(/\#+/g, '#') //change multiple ## -> #
      .replace(/^#/g, '') //remove first #
      .replace(/#$/g, ''); //... and last

    var openingArr = openRaw.split("#");


    //We probably have pairs of day (or day-ranges) + a time-range

    //Generally we split into 2 distinct groups: 
    //1. indication of mealtype
    //2. NO indication of mealtype

    try {
      openinghoursStats.has++;
      var result = processOpeninghours(_.clone(openingArr));

      var lastTermType;
      var firstTermType;
      var errMsg;
      _.each(result, function (termObj) {

        if (errMsg) return;
        var termType = termObj.type;

        if (!lastTermType) { //init
          lastTermType = termType;
          firstTermType = termType;
          return;
        }

        if (termType === "mealType" && firstTermType !== "mealType") {
          errMsg = "mealtype only allowed if we start with it: " + openingArr;
        } else if (lastTermType === "mealType" && termType === "mealType") {
          errMsg = "mealType cannot directly follow mealtype: " + openingArr;
        } else if (lastTermType === "timerange" && termType === "timerange") {
          errMsg = "timerange cannot directly follow timerange: " + openingArr;
        } else if (lastTermType === "mealType" && termType === "timerange") {
          errMsg = "timerange cannot directly follow mealType: " + openingArr;
        }
        lastTermType = termType;
      });

      if (errMsg) {
        var error = new Error(errMsg);
        error.status = "ERROR_IN_ORDER";
        throw error;
      }


      ///////////////////////////////////////////
      //Let's combine mealtype, dayRange, timeRange
      //This is pretty tricky but we use the following rules (by example)
      //
      // meal -> create meal
      // day -> add day to prev meal 
      // time -> add time to prev meal
      //
      // meal -> create meal
      // day -> add day to prev meal 
      // day -> add day to prev meal 
      // time -> add time to prev meal (for both days)
      //
      // meal -> create meal
      // day -> add day to prev meal 
      // meal -> create meal
      // day -> add day to prev meal 
      // time -> add time to all prev meals that don't have time set
      //
      // meal -> create meal
      // day -> add day to prev meal 
      // meal -> create meal
      // day -> add day to prev meal 
      // time -> add time to all prev meals that don't have time set
      // time -> ERROR
      //
      // meal -> create meal
      // meal -> ERROR
      //
      // time -> create time
      // time -> ERROR
      //
      // meal -> create meal
      // time -> ERROR (needs day first)

      var openinghoursMap = [];
      var lastMealType;
      _.each(result, function (r) {
        var objs;
        switch (r.type) {
          case "mealType":
            openinghoursMap.push({
              type: r.val
            });
            lastMealType = r.val;
            break;
          case "dayrange":
            //find mealtypes without dayRange and add current dayRange
            //If no mealtypes found -> create a new object without mealtype
            objs = _.filter(openinghoursMap, function (obj) {
              return obj.dayRange === undefined;
            });
            if (!objs.length) { //no mealType found -> create

              openinghoursMap.push({
                type: lastMealType || "all",
                dayRange: r.val
              });

            } else {

              _.each(objs, function (obj) {
                obj.dayRange = r.val;
              });
            }
            break;
          case "timerange":
            //find mealtypes without timeRange and add current timeRange
            //If no mealtypes found -> error
            objs = _.filter(openinghoursMap, function (obj) {
              return obj.timeRange === undefined;
            });
            if (!objs.length) {

              var error = new Error("wanted to map timerange but no dayRange objects found to map to: " + openingArr);
              error.status = "ERROR_IN_ORDER";
              throw error;

            }
            _.each(objs, function (obj) {
              obj.timeRange = r.val;
            });
            break;
        }
      });


      //Now create correct format
      if (_.size(openinghoursMap)) {
        return _.reduce(openinghoursMap, function (arr, obj) {
          return arr.concat([{
            hoursPayload: obj.type,
            dayOfWeekNumber: obj.dayRange,
            opens: obj.timeRange[0],
            closes: obj.timeRange[1]
          }]);
        }, []);
      }

      openinghoursStats.success++;

      //DEV: see openinghours stats
      // console.log(openinghoursStats);

    } catch (err) {
      switch (err.status) {
        case "ERROR_IN_ORDER":
          if (DEBUG_OPENINGHOURS) {
            console.log(err.message);
          }
          openinghoursStats.failOrder++;
          break;
        case "NO_PARSER":
          // console.log(err.message);
          openinghoursStats.failParse++;
          break;
        default:
          if (DEBUG_OPENINGHOURS) {
            console.log(err.message);
          }
          openinghoursStats.failOther++;
      }
    }
  }


  function getFactsObject(htmlFragment) {

    //later extra 0 and 2. 1 is used for matching div which might have class attached but we don't need
    //to extract it.
    var re = /<h4>(.*?)<\/h4><div(.*?)>(.*?)<\/div>/g,
      match, params = {};

    while (match = re.exec(htmlFragment)) { //THIS ASSIGNMENT IS CORRECT
      params[match[1]] = match[3];
    }
    return params;
  }


  return {
    processOpeninghoursTotal: processOpeninghoursTotal,
    getFactsObject: getFactsObject
  };
};
