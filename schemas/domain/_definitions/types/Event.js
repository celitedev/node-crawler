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

		},
		performer: {

		},
		recordedIn: {},
		// review: {}, //reviews are kept separately
		startDate: {},
		subEvent: {

		},
		superEvent: {},
		workFeatured: {

		},
		workPerformed: {

		}
	}
};