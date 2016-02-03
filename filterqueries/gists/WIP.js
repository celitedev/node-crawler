////////////////////////////////////////////////////////////////////
//SPATIAL LOGIC
// asking for specific location => `geo` property 
// - for Place, PlaceWithOpeningHours => geo
// - for Event => location.geo
// 
// asking for location by name =>
// 
//  - for Place, PlaceWithOpeningHours => containedInPlace (ref)
//  
//  - for Event => location.name || location.containedInPlace  (ref)
//  
//  - for Organization => 
//    - inbound: 
//      - Event.performer (default)
//      - Event.organizer
//    - outbound: 
//      - x degree probably only
//      
//  - for Person =>
//    - inbound: 
//      - Event.performer (default)
//      - Event.organizer
//    - outbound: 
//      - x degree probably only
//      
//  - for CreativeWork => 
//  	- inbound: CreativeWork || Event. 
//  	  - Event.workFeatured (default)
//      - Event.recordedIn
//   - outbound: 
//      - CreativeWork.about (Place) 
//      - others in 2nd degree only
//
// In short: 
// Asking for specific geo, address, or placeName can be supported in 1 query for all roots when: 
// 1. geo, address, name of place on Place + PlaceWithOpeningHours
// 2. expand Event.location with geo, address, name
// 3. expand Event.workFeatured with name
// 4. expand Event.performer with name
// 
// For past events we might: 
// - not store in ES anymore? 
// - store in ES, but shards based on time and have events in the past with less powerful CPU. 
// - remove really unneeded past events, such as ShowingEvents. 
// - do some aggregation over deleted events. This can be done on a property basis it seems: 
//   - for each key in Event.workfeatured (i.e.: a CreativeWork), we aggregate Event-data such as time + location
//   - similar for other properties. 
//   - This may be an ideal case for druid, if rethinkdb / couch tables are not enough.
//   
// 
// Example queries: 
//
// Q: Is the Apple Store in Soho open?
// A: PlaceWithOpeningHours.name=AppleStore + PlaceWithOpeningHours.containedInPlace--expand.name=Soho
// A: PlaceWithOpeningHours.name=AppleStore + PlaceWithOpeningHours.containedInPlace--name=Soho //TODO: 
//  
// Q: Where does the avengers play near me?  (SPATIAL TYPE = NEARPOINT)
// A: Event.workfeatured--expand.name=avengers + Event.location--expand.geo=<lat,long>
//
// Q: Where does the avengers play in soho? (SPATIAL TYPE = CONTAINEDINPLACE)
// A: Event.workfeatured--expand.name=avengers + Event.location--expand.containedInPlace--name=Soho //TODO: double lookup during index
// 
// Q: Where does the avengers play in theater X? (SPATIAL TYPE = LOCATION)
// A: Event.workfeatured--expand.name=avengers + Event.location--expand.name=TheaterX
// 
// Q: Where does the avengers play near grand central? (SPATIAL TYPE = NEARPLACE)
// A. This needs 2 separate questions. 
// 1. Get `geo` from grand central
// 2. fill-in similar to SPATIAL=NEARPOINT
// 
//spatial lookup options

var spatialOptions = {

	//Can be used on Place, PlaceWithOpeningHours, Event (by extension of `location`)
	nearPoint: {
		type: "nearPoint",
		options: {
			latitude: "<lat>",
			longitude: "<lng>",
			radius: 3,
			radiusMetric: "km"
		}
	},

	//Can be used on roots: Place, PlaceWithOpeningHours, Event (by extension of `location`)
	containedInPlace: {
		//uses containedInPlace -property or any derived property such as containedInPlace--name
		type: "containedInPlace",
		options: {
			A: {
				//if id is known, it can be passed directly to the options-property. 
				//containsInPlace-property is used to lookup. 
				//NOTE: containsInPlace-property MUST exist. 
				//TBD: what happens if containsInPlace-property doesn't exist?
				options: "<id>"
			},
			B: {
				//alternatively options-property may be an object, containing properties by which 
				//the containedInPlace is to be looked-up. 
				//
				//By default the ThingIndex is used to do this lookup. 
				//
				//This is needed since containedInPlace as ambiguous in type: it can both ref a 
				//Place or a PlaceWithOpeningHours which are separate roots. 
				//
				//Alternatively, if options-object only contains a single property, in this example `name`
				//we can spare a lookup if a calculated field `containedInPlace--<propName>` exists
				//The queryplanner should be able to see if `containedInPlace--<propName>` exists and use
				//that. If not default to ThingIndex-lookup.
				options: {
					name: "soho"
				}
			}
		}
	},

	//Can be used on PersonAndOrganization and CreativeWork
	//
	//Uses performedTable (M-N) in RethinkDB or something. 
	//Alternatively *might* be able to use Events to look this up, 
	//but events aren't kept for past history presumably... so we'd need
	//performedTable for those. 
	//
	//E.g.: 
	//- (when) has X performed in Soho 
	//- when does shakira perform in ...
	//- when is this movie played in... 
	performedIn: {
		type: "performedIn",
		options: {
			A: {
				options: "<id>"
			},
			B: {
				options: {
					name: "soho"
				}
			}
		}
	}
};
