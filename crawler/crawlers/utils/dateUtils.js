var _ = require("lodash");
var moment = require("moment");
require("moment-timezone");

var utils = module.exports = {

	//when time is meant to be in timezone but source forgot to add it
	transposeTimeToTimezone: function(sDateTime, timezone){
		var date =  moment(new Date(sDateTime));

    if (!date.isValid()) {
      return false;
    }

    var dtCurrentZone = date.format();
    dtCurrentZone = dtCurrentZone.substring(0, dtCurrentZone.length - 6);
    return moment.tz(dtCurrentZone, "America/New_York").format();
	}, 

	//actually translate dt to timezone
	translateTimeToTimezone: function(sDateTimeOrMomentDate, timezone){
		
		var date = _.isString(sDateTimeOrMomentDate) ?  
			moment(new Date(sDateTimeOrMomentDate)) : 
			sDateTimeOrMomentDate;

		if (!date.isValid()) {
      return false;
    }

		return date.tz(timezone).format();
	},

	translateTimestampToTimezone: function(timestamp, timezone){
		var dt = moment.unix(timestamp);
		return utils.translateTimeToTimezone(dt, timezone);
	}
};
