var _ = require("lodash");
var moment = require("moment");
require("moment-timezone");

var utils = module.exports = {

	//when time is meant to be in timezone but source forgot to add it
	// transposeTimeToTimezone: function(sDateTime, timezone){
	// 	var date =  moment(new Date(sDateTime));

 //    if (!date.isValid()) {
 //      return false;
 //    }

 //    var dtCurrentZone = date.format();
 //    dtCurrentZone = dtCurrentZone.substring(0, dtCurrentZone.length - 6);
 //    return moment.tz(dtCurrentZone, "America/New_York");
	// }, 


	//Sometimes a supplied datetime is in local time while it should be in a specified timezone
	//NOTE: sDateTimeLocal should be a datetime WITHOUT timezone
	transposeTimeToUTC: function(sDateTimeLocal, supposedTimezone){

		var tzSuffix ="";
		if(supposedTimezone){
			//given 2016-06-07T16:12:38-04:00
			//tzSuffix = -04:00
			tzSuffix = moment().tz(supposedTimezone).format();
			tzSuffix = tzSuffix.substring(tzSuffix.length-6);
		}

		//parseDateCurrentTZ: This always translates to timezone of pc, so strip out tz
		//NOTE: when presented with a correct iso this will CHANGE the time based on current tz to UTC offset!
		//BUT when parsing anotehr string (9-12-2016 9PM) it will NOT CHANGE the time!
		var date =  moment(new Date(sDateTimeLocal));
    if (!date.isValid()) {
      return false;
    }
    var parseDateCurrentTZ = 	date.format(); 

    //now based on some string magic, change to timezone as supplied or zero otherwise.
    var parseDateLocalTZ = parseDateCurrentTZ.substring(parseDateCurrentTZ, parseDateCurrentTZ.length-6) + tzSuffix;

   	//lastly, transform this date to utc
    var dateUTC =  moment(new Date(parseDateLocalTZ)).utc();

    console.log("###############################################################");
    console.log(sDateTimeLocal, parseDateLocalTZ, dateUTC.format());

    return dateUTC.format();
	}, 

	transposeTimeWithTimezoneToUTC: function(sDateTimeWithTimezone){
		var date =  moment(new Date(sDateTimeWithTimezone));
    if (!date.isValid()) {
      return false;
    }
    return date.utc().format();
	},



	translateTimestampToTimezone: function(timestamp, timezone){
		var dt = moment.unix(timestamp);
		if(!timezone) return dt.utc().format();
		return utils.translateTimeToTimezone(dt, timezone);
	}
};
