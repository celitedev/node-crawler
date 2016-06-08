var _ = require("lodash");
var moment = require("moment");
require("moment-timezone");

var utils = module.exports = {
 
	//Sometimes a supplied datetime is in local time while it should be in a specified timezone
	//NOTE: sDateTimeLocal should be a datetime WITHOUT timezone
	transposeTimeToUTC: function(sDateTimeLocal, supposedTimezone){

		if(!sDateTimeLocal){
			//if date is unspecified return false
			//NOTE: be sure the calling crawler defines a pruner
			return false; 
		}

		//based on isoDT and supposedTimezone -> fetch suffix of timezone
		//NOTE: we need an actual date instead of now, bc of daylight saving time shifts
		function getTZSuffix(isoDT){
			if(!supposedTimezone) return "";
			var dateInTZ = moment(new Date(isoDT)).tz(supposedTimezone).format();
			return dateInTZ.substring(dateInTZ.length-6);
		}

		var dateUTC; 
		var parseDateLocalTZ;

		//Check if sDateTimeLocal is a correct isoDateTime. 
		//We check for 3 specific isotimes: 
		// - without timezone - 2016-10-18T19:00:00
		// - utc 							- 2016-06-09T15:00:00Z
		// - with timezone 		- 2016-10-18T19:00:00-04:00
		//
		//These isoDates are not correctly parsed using the else-flow below
		//so we parse them separately. 
		
		var isoDT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}/gi;
		var isoUTC = /Z$/gi;
		var isoTZ = /[-+][0-9]{2}:[0-9]{2}$/gi;
		if(sDateTimeLocal.match(isoDT)){

			parseDateLocalTZ = sDateTimeLocal;
			if(!(sDateTimeLocal.match(isoUTC) || sDateTimeLocal.match(isoTZ))){
				//parse with unspecified timezone  -> add tzSuffix
				parseDateLocalTZ += getTZSuffix(parseDateLocalTZ);
			}

		}else{

			//parseDateCurrentTZ: This always translates to timezone of pc, so strip out tz
			var date =  moment(new Date(sDateTimeLocal));
	    if (!date.isValid()) {
	      return false;
	    }
	    var parseDateCurrentTZ = 	date.format(); 

	    //now based on some string magic, change to timezone as supplied or zero otherwise.
	    parseDateLocalTZ = parseDateCurrentTZ.substring(parseDateCurrentTZ, parseDateCurrentTZ.length-6) + getTZSuffix(parseDateCurrentTZ);

		}

		//lastly, transform this date to utc
    dateUTC =  moment(new Date(parseDateLocalTZ)).utc();

    // console.log("###############################################################");
    // console.log(sDateTimeLocal, parseDateLocalTZ, dateUTC.format());

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
