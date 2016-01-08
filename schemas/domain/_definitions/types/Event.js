//An event happening at a certain time and location, such as a concert, 
//lecture, or festival. 
//Ticketing information may be added via the 'offers' property. 
//Repeated events may be structured as separate Event objects.

module.exports = {
	properties: {
		aggregateRating: false,
		doorTime: false,
		duration: false,
		endDate: false,
		location: false,
		// offers: //offers -> NOTE: shouldn't this be 'offer' 
		organizer: false,
		performer: false,
		recordedIn: false,
		// review: false, //reviews are kept separately
		startDate: false,
		subEvent: false,
		superEvent: false,
		workFeatured: false,
		workPerformed: false,
		subtypes: false,
	}
};
