//An event happening at a certain time and location, such as a concert, 
//lecture, or festival. 
//Ticketing information may be added via the 'offers' property. 
//Repeated events may be structured as separate Event objects.

module.exports = {
	properties: {
		aggregateRating: {},
		doorTime: {},
		duration: {},
		endDate: {},
		location: {},
		// offers: //offers -> NOTE: shouldn't this be 'offer' 
		organizer: {
			isMulti: true
		},
		performer: {
			isMulti: true
		},
		recordedIn: {},
		review: {
			isMulti: true
		},
		startDate: {},
		subEvent: {
			isMulti: true
		},
		superEvent: {},
		workFeatured: {
			isMulti: true
		},
		workPerformed: {
			isMulti: true
		}
	}
};
